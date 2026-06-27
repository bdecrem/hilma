/* ssh.c — tiny SSH-2 client core. See ssh.h. Portable C (host + 68k). */
#include "ssh.h"
#include "sha256.h"
#include "aes128.h"
#include "x25519.h"
#include "ed25519.h"
#include <string.h>
#include <stdlib.h>
#ifdef PSSH_DEBUG
#include <stdio.h>
#endif

/* SSH message numbers */
#define MSG_DISCONNECT 1
#define MSG_IGNORE 2
#define MSG_UNIMPL 3
#define MSG_DEBUG 4
#define MSG_SERVICE_REQUEST 5
#define MSG_SERVICE_ACCEPT 6
#define MSG_KEXINIT 20
#define MSG_NEWKEYS 21
#define MSG_KEX_ECDH_INIT 30
#define MSG_KEX_ECDH_REPLY 31
#define MSG_USERAUTH_REQUEST 50
#define MSG_USERAUTH_FAILURE 51
#define MSG_USERAUTH_SUCCESS 52
#define MSG_USERAUTH_BANNER 53
#define MSG_GLOBAL_REQUEST 80
#define MSG_REQUEST_FAILURE 82
#define MSG_CHANNEL_OPEN 90
#define MSG_CHANNEL_OPEN_CONFIRMATION 91
#define MSG_CHANNEL_OPEN_FAILURE 92
#define MSG_CHANNEL_WINDOW_ADJUST 93
#define MSG_CHANNEL_DATA 94
#define MSG_CHANNEL_EOF 96
#define MSG_CHANNEL_CLOSE 97
#define MSG_CHANNEL_REQUEST 98
#define MSG_CHANNEL_SUCCESS 99
#define MSG_CHANNEL_FAILURE 100

/* states */
enum {
    ST_VERSION, ST_KEXINIT, ST_LADDER_QC, ST_KEXREPLY, ST_LADDER, ST_VERIFY, ST_NEWKEYS,
    ST_SERVICE, ST_AUTH, ST_CHANOPEN, ST_SHELLREQ, ST_READY, ST_ERR
};

#define RXCAP   8192
#define PKTCAP  8192
#define LOCAL_CHAN 0

struct ssh_client {
    ssh_io io;
    const char *user, *password;
    int state;
    char err[96];

    /* version strings (no CRLF) */
    char vc[64], vs[256];
    int  vsn;            /* server version length filled */

    /* our & server KEXINIT payloads (for the exchange hash) */
    uint8_t ic[2048]; uint32_t icn;
    uint8_t is[4096]; uint32_t isn;

    /* ephemeral X25519 */
    uint8_t eph_priv[32], eph_pub[32];
    uint8_t srv_pub[32];        /* Q_S */
    x25519_state lad;
    int      lad_bit;           /* progress 0..255 */
    uint8_t  ks_blob[1024]; uint32_t ks_blobn;   /* server host key blob */
    uint8_t  host_pub[32];      /* server's Ed25519 public key (from K_S) */
    uint8_t  host_sig[64];      /* server's signature over H (from KEX_ECDH_REPLY) */
    int      have_hostkey;      /* 1 if host_pub/host_sig were parsed */
    ed25519_vrfy_state vrfy;    /* resumable host-key signature verification */
    uint8_t  shared[32];        /* K */
    uint8_t  H[32];             /* exchange hash / session id */

    /* keys */
    int encrypted;
    aes128_ctx aes_c2s, aes_s2c;
    uint8_t ctr_c2s[16], ctr_s2c[16];
    uint8_t ks_c2s[16], ks_s2c[16]; int pos_c2s, pos_s2c;
    uint8_t mac_c2s[32], mac_s2c[32];
    uint32_t seq_c2s, seq_s2c;

    /* receive assembly */
    uint8_t rx[RXCAP]; uint32_t rxn;
    uint32_t pkt_total;   /* 0 = length unknown; else 4+pkt_len */
    uint32_t pkt_dec;     /* bytes of rx already decrypted */

    /* channel */
    uint32_t srv_chan;
    int32_t  send_window;
    uint32_t recv_consumed;
    int      got_version;
    int      sent_pty;
};

/* ---------- small writers/readers ---------- */
static void put_u32(uint8_t *p, uint32_t v){ p[0]=(uint8_t)(v>>24);p[1]=(uint8_t)(v>>16);p[2]=(uint8_t)(v>>8);p[3]=(uint8_t)v; }
static uint32_t get_u32(const uint8_t *p){ return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3]; }

typedef struct { uint8_t *p; uint32_t n, cap; } W;
static void w_init(W *w, uint8_t *buf, uint32_t cap){ w->p=buf; w->n=0; w->cap=cap; }
static void w_byte(W *w, uint8_t b){ if(w->n<w->cap) w->p[w->n++]=b; }
static void w_raw(W *w, const void *d, uint32_t n){ uint32_t i; const uint8_t*s=d; for(i=0;i<n;i++) w_byte(w,s[i]); }
static void w_u32(W *w, uint32_t v){ uint8_t t[4]; put_u32(t,v); w_raw(w,t,4); }
static void w_str(W *w, const void *d, uint32_t n){ w_u32(w,n); w_raw(w,d,n); }
static void w_cstr(W *w, const char *s){ w_str(w, s, (uint32_t)strlen(s)); }
/* mpint: minimal two's-complement; for our positive K, prepend 0 if high bit set */
static void w_mpint(W *w, const uint8_t *b, uint32_t n){
    uint32_t i=0; while(i<n && b[i]==0) i++;             /* strip leading zeros */
    if(i==n){ w_u32(w,0); return; }
    if(b[i]&0x80){ w_u32(w, n-i+1); w_byte(w,0); w_raw(w,b+i,n-i); }
    else { w_u32(w, n-i); w_raw(w,b+i,n-i); }
}

static void fail(ssh_client*c, const char*m){ if(c->state!=ST_ERR){ strncpy(c->err,m,sizeof(c->err)-1); c->err[sizeof(c->err)-1]=0; c->state=ST_ERR; if(c->io.on_status)c->io.on_status(c->io.user,m);} }

/* ---------- CTR stream (continuous keystream) ---------- */
static void ctr_inc(uint8_t ctr[16]){ int i; for(i=15;i>=0;i--){ if(++ctr[i]) break; } }
static void ctr_crypt(aes128_ctx*aes, uint8_t ctr[16], uint8_t ks[16], int*pos, const uint8_t*in, uint8_t*out, uint32_t len){
    uint32_t i; for(i=0;i<len;i++){ if(*pos==0||*pos==16){ aes128_encrypt(aes,ctr,ks); ctr_inc(ctr); *pos=0; } out[i]=in[i]^ks[(*pos)++]; }
}

/* ---------- packet send ---------- */
static void send_packet(ssh_client*c, const uint8_t*payload, uint32_t plen){
    static uint8_t pkt[PKTCAP];     /* static: too big for the 68k stack */
    uint32_t blk, padlen, total, i;
    if(c->state==ST_ERR) return;
    blk = c->encrypted ? 16 : 8;
    /* padlen: pad (4+1+plen+pad) to multiple of blk, pad in [4,255] */
    padlen = blk - ((5 + plen) % blk); if(padlen<4) padlen += blk;
    total = 1 + plen + padlen;                 /* packet_length field value */
    if(4+total+32 > sizeof(pkt)){ fail(c,"packet too large"); return; }
    put_u32(pkt, total);
    pkt[4] = (uint8_t)padlen;
    memcpy(pkt+5, payload, plen);
    if(c->io.get_random) c->io.get_random(c->io.user, pkt+5+plen, padlen); else memset(pkt+5+plen,0,padlen);
    if(c->encrypted){
        uint8_t mac[32]; uint8_t seqb[4]; static uint8_t macin[4+PKTCAP];
        put_u32(seqb, c->seq_c2s);
        memcpy(macin, seqb, 4); memcpy(macin+4, pkt, 4+total);
        hmac_sha256(c->mac_c2s, 32, macin, 4+4+total, mac);
        ctr_crypt(&c->aes_c2s, c->ctr_c2s, c->ks_c2s, &c->pos_c2s, pkt, pkt, 4+total);
        c->io.send(c->io.user, pkt, 4+total);
        c->io.send(c->io.user, mac, 32);
    } else {
        c->io.send(c->io.user, pkt, 4+total);
    }
    (void)i;
    c->seq_c2s++;
}

/* ---------- kex helpers ---------- */
static void build_kexinit(ssh_client*c){
    W w; uint8_t cookie[16];
    w_init(&w, c->ic, sizeof(c->ic));
    w_byte(&w, MSG_KEXINIT);
    if(c->io.get_random) c->io.get_random(c->io.user, cookie, 16); else memset(cookie,0,16);
    w_raw(&w, cookie, 16);
    w_cstr(&w, "curve25519-sha256,curve25519-sha256@libssh.org");   /* kex (same wire) */
    w_cstr(&w, "ssh-ed25519");                 /* server host key (we don't verify) */
    w_cstr(&w, "aes128-ctr");                   /* enc c2s */
    w_cstr(&w, "aes128-ctr");                   /* enc s2c */
    w_cstr(&w, "hmac-sha2-256");                /* mac c2s */
    w_cstr(&w, "hmac-sha2-256");                /* mac s2c */
    w_cstr(&w, "none");                          /* comp c2s */
    w_cstr(&w, "none");                          /* comp s2c */
    w_cstr(&w, "");                              /* lang c2s */
    w_cstr(&w, "");                              /* lang s2c */
    w_byte(&w, 0);                               /* first_kex_packet_follows */
    w_u32(&w, 0);                                /* reserved */
    c->icn = w.n;
}

static void send_kex_ecdh_init(ssh_client*c){
    W w; uint8_t buf[64];
    /* c->eph_pub was computed by the resumable Q_C ladder (ST_LADDER_QC) */
    w_init(&w, buf, sizeof(buf));
    w_byte(&w, MSG_KEX_ECDH_INIT);
    w_str(&w, c->eph_pub, 32);
    send_packet(c, buf, w.n);
}

static void derive_key(ssh_client*c, char X, uint8_t*out, uint32_t outlen){
    /* K1 = HASH(mpint(K) || H || X || session_id); session_id = H */
    sha256_ctx s; uint8_t k1[32]; W w; uint8_t mp[40]; uint32_t mpn;
    w_init(&w, mp, sizeof(mp)); w_mpint(&w, c->shared, 32); mpn=w.n;
    sha256_init(&s); sha256_update(&s, mp, mpn); sha256_update(&s, c->H, 32);
    sha256_update(&s, &X, 1); sha256_update(&s, c->H, 32); sha256_final(&s, k1);
    if(outlen<=32){ memcpy(out,k1,outlen); }
    else { memcpy(out,k1,32); /* extend not needed for our sizes */ }
    (void)outlen;
}

static void compute_exchange_hash(ssh_client*c){
    sha256_ctx s; W w; static uint8_t tmp[8192]; uint32_t n;
    /* H = HASH( string(Vc)||string(Vs)||string(Ic)||string(Is)||string(Ks)||string(Qc)||string(Qs)||mpint(K) ) */
    w_init(&w, tmp, sizeof(tmp));
    w_cstr(&w, c->vc);
    w_str(&w, c->vs, c->vsn);
    w_str(&w, c->ic, c->icn);
    w_str(&w, c->is, c->isn);
    w_str(&w, c->ks_blob, c->ks_blobn);
    w_str(&w, c->eph_pub, 32);
    w_str(&w, c->srv_pub, 32);
    w_mpint(&w, c->shared, 32);
    n = w.n;
    sha256_init(&s); sha256_update(&s, tmp, n); sha256_final(&s, c->H);
}

static void install_keys(ssh_client*c){
    uint8_t iv1[32], iv2[32], k1[32], k2[32];
    /* c->H was computed (compute_exchange_hash) before host-key verification */
    derive_key(c,'A',iv1,16); derive_key(c,'B',iv2,16);
    derive_key(c,'C',k1,16);  derive_key(c,'D',k2,16);
    derive_key(c,'E',c->mac_c2s,32); derive_key(c,'F',c->mac_s2c,32);
    aes128_init(&c->aes_c2s, k1); aes128_init(&c->aes_s2c, k2);
    memcpy(c->ctr_c2s, iv1, 16); memcpy(c->ctr_s2c, iv2, 16);
    c->pos_c2s = 16; c->pos_s2c = 16;   /* force fresh keystream block on first use */
#ifdef PSSH_DEBUG
    { int _i; fprintf(stderr,"client H="); for(_i=0;_i<32;_i++)fprintf(stderr,"%02x",c->H[_i]);
      fprintf(stderr,"\n vc=%s vsn=%u icn=%u isn=%u ksn=%u\n",c->vc,(unsigned)c->vsn,(unsigned)c->icn,(unsigned)c->isn,(unsigned)c->ks_blobn);
      fprintf(stderr," vs=%.*s\n",(int)c->vsn,c->vs);
      fprintf(stderr," K ="); for(_i=0;_i<32;_i++)fprintf(stderr,"%02x",c->shared[_i]); fprintf(stderr,"\n");
      fprintf(stderr," QC="); for(_i=0;_i<32;_i++)fprintf(stderr,"%02x",c->eph_pub[_i]); fprintf(stderr,"\n");
      fprintf(stderr," QS="); for(_i=0;_i<32;_i++)fprintf(stderr,"%02x",c->srv_pub[_i]); fprintf(stderr,"\n");
      { uint8_t _fp[32]; /* FPRINT */
        sha256(c->vc,strlen(c->vc),_fp); fprintf(stderr," fpVC="); for(_i=0;_i<8;_i++)fprintf(stderr,"%02x",_fp[_i]); fprintf(stderr," len=%u\n",(unsigned)strlen(c->vc));
        sha256(c->vs,c->vsn,_fp);        fprintf(stderr," fpVS="); for(_i=0;_i<8;_i++)fprintf(stderr,"%02x",_fp[_i]); fprintf(stderr," len=%u\n",(unsigned)c->vsn);
        sha256(c->ic,c->icn,_fp);        fprintf(stderr," fpIC="); for(_i=0;_i<8;_i++)fprintf(stderr,"%02x",_fp[_i]); fprintf(stderr," len=%u\n",(unsigned)c->icn);
        sha256(c->is,c->isn,_fp);        fprintf(stderr," fpIS="); for(_i=0;_i<8;_i++)fprintf(stderr,"%02x",_fp[_i]); fprintf(stderr," len=%u\n",(unsigned)c->isn);
        sha256(c->ks_blob,c->ks_blobn,_fp);fprintf(stderr," fpKS="); for(_i=0;_i<8;_i++)fprintf(stderr,"%02x",_fp[_i]); fprintf(stderr," len=%u\n",(unsigned)c->ks_blobn);
      } }
#endif
}

/* ---------- channel ---------- */
static void open_channel(ssh_client*c){
    W w; uint8_t buf[64];
    w_init(&w,buf,sizeof(buf));
    w_byte(&w,MSG_CHANNEL_OPEN);
    w_cstr(&w,"session"); w_u32(&w,LOCAL_CHAN); w_u32(&w,0x100000); w_u32(&w,0x1000);
    send_packet(c,buf,w.n);
}
static void request_pty_and_shell(ssh_client*c){
    W w; uint8_t buf[256];
    /* pty-req */
    w_init(&w,buf,sizeof(buf));
    w_byte(&w,MSG_CHANNEL_REQUEST); w_u32(&w,c->srv_chan); w_cstr(&w,"pty-req"); w_byte(&w,0);
    w_cstr(&w,"vt100"); w_u32(&w,80); w_u32(&w,24); w_u32(&w,0); w_u32(&w,0);
    w_cstr(&w,"");                       /* empty terminal modes */
    send_packet(c,buf,w.n);
    /* shell */
    w_init(&w,buf,sizeof(buf));
    w_byte(&w,MSG_CHANNEL_REQUEST); w_u32(&w,c->srv_chan); w_cstr(&w,"shell"); w_byte(&w,1);
    send_packet(c,buf,w.n);
}

/* ---------- dispatch one decrypted payload ---------- */
static void on_payload(ssh_client*c, const uint8_t*p, uint32_t n){
    uint8_t t;
    if(n<1) return;
    t = p[0];
    if(t==MSG_IGNORE||t==MSG_DEBUG||t==MSG_UNIMPL) return;
    if(t==MSG_DISCONNECT){
#ifdef PSSH_DEBUG
        if(n>9){ uint32_t L=get_u32(p+5); fprintf(stderr,"DISCONNECT reason=%u msg=%.*s\n",(unsigned)get_u32(p+1),(int)L,(char*)p+9); }
#endif
        fail(c,"server disconnected"); return; }
    if(t==MSG_GLOBAL_REQUEST){ /* if want_reply, refuse */ W w; uint8_t b[8]; w_init(&w,b,8); w_byte(&w,MSG_REQUEST_FAILURE); /* find want_reply: after a string */
        /* p: type, string(name), bool want_reply */ uint32_t i=1; if(i+4<=n){ uint32_t L=get_u32(p+i); i+=4+L; if(i<n && p[i]) send_packet(c,b,w.n); } return; }

    switch(c->state){
    case ST_KEXINIT:
        if(t==MSG_KEXINIT){
            static const uint8_t base[32]={9};
            if(n<=sizeof(c->is)){ memcpy(c->is,p,n); c->isn=n; }
            c->io.get_random(c->io.user, c->eph_priv, 32);
            x25519_start(&c->lad, c->eph_priv, base);   /* Q_C = X25519(eph_priv, 9), resumable */
            c->lad_bit=0; c->state=ST_LADDER_QC;
            if(c->io.on_status) c->io.on_status(c->io.user,"key exchange (this takes a bit on a 68000)...");
        }
        break;
    case ST_KEXREPLY:
        if(t==MSG_KEX_ECDH_REPLY){
            uint32_t i=1, L;
            c->have_hostkey = 0;
            L=get_u32(p+i); i+=4; if(L<=sizeof(c->ks_blob)){ memcpy(c->ks_blob,p+i,L); c->ks_blobn=L; } i+=L;       /* K_S */
            L=get_u32(p+i); i+=4; if(L==32) memcpy(c->srv_pub,p+i,32); i+=L;                                          /* Q_S */
            /* signature blob: string(alg) + string(sig). For ssh-ed25519 the inner
               sig is 64 bytes. Capture it; verified after we have H. */
            { uint32_t sl=get_u32(p+i); i+=4; { uint32_t j=0;
                uint32_t an=get_u32(p+i+j); j+=4+an;                     /* skip "ssh-ed25519" */
                { uint32_t sn=get_u32(p+i+j); j+=4; if(sn==64){ memcpy(c->host_sig,p+i+j,64); } }
                (void)sl; }
            }
            /* host_pub = 2nd string inside K_S (after the "ssh-ed25519" name) */
            { uint32_t j=0, an=get_u32(c->ks_blob+j); j+=4+an;
              { uint32_t kn=get_u32(c->ks_blob+j); j+=4; if(kn==32){ memcpy(c->host_pub,c->ks_blob+j,32); c->have_hostkey=1; } }
            }
            x25519_start(&c->lad, c->eph_priv, c->srv_pub);
            c->lad_bit=0; c->state=ST_LADDER;
            if(c->io.on_status) c->io.on_status(c->io.user,"key exchange (this takes a bit on a 68000)...");
        }
        break;
    case ST_NEWKEYS:
        if(t==MSG_NEWKEYS){
            W w; uint8_t b[64];
            c->encrypted=1;                                   /* s2c now encrypted too */
            w_init(&w,b,64); w_byte(&w,MSG_SERVICE_REQUEST); w_cstr(&w,"ssh-userauth"); send_packet(c,b,w.n);
            c->state=ST_SERVICE;
        }
        break;
    case ST_SERVICE:
        if(t==MSG_SERVICE_ACCEPT){
            W w; uint8_t b[256];
            w_init(&w,b,sizeof(b));
            w_byte(&w,MSG_USERAUTH_REQUEST); w_cstr(&w,c->user); w_cstr(&w,"ssh-connection");
            w_cstr(&w,"password"); w_byte(&w,0); w_cstr(&w,c->password);
            send_packet(c,b,w.n);
            c->state=ST_AUTH;
            if(c->io.on_status) c->io.on_status(c->io.user,"authenticating...");
        }
        break;
    case ST_AUTH:
        if(t==MSG_USERAUTH_SUCCESS){ open_channel(c); c->state=ST_CHANOPEN; }
        else if(t==MSG_USERAUTH_FAILURE){ fail(c,"authentication failed (wrong password?)"); }
        else if(t==MSG_USERAUTH_BANNER){ /* ignore */ }
        break;
    case ST_CHANOPEN:
        if(t==MSG_CHANNEL_OPEN_CONFIRMATION){
            uint32_t i=1; i+=4; c->srv_chan=get_u32(p+i); i+=4; c->send_window=(int32_t)get_u32(p+i);
            request_pty_and_shell(c); c->state=ST_SHELLREQ;
        } else if(t==MSG_CHANNEL_OPEN_FAILURE){ fail(c,"could not open session channel"); }
        break;
    case ST_SHELLREQ:
        if(t==MSG_CHANNEL_SUCCESS){ c->state=ST_READY; if(c->io.on_status) c->io.on_status(c->io.user,"[connected]"); }
        else if(t==MSG_CHANNEL_FAILURE){ fail(c,"server refused the shell"); }
        break;
    case ST_READY:
        if(t==MSG_CHANNEL_DATA){
            uint32_t i=1; uint32_t L; i+=4; L=get_u32(p+i); i+=4;
            if(i+L<=n && c->io.on_data) c->io.on_data(c->io.user, p+i, L);
            c->recv_consumed += L;
            if(c->recv_consumed > 0x80000){ W w; uint8_t b[16]; w_init(&w,b,sizeof(b)); w_byte(&w,MSG_CHANNEL_WINDOW_ADJUST); w_u32(&w,c->srv_chan); w_u32(&w,c->recv_consumed); send_packet(c,b,w.n); c->recv_consumed=0; }
        } else if(t==MSG_CHANNEL_WINDOW_ADJUST){ uint32_t i=1; i+=4; c->send_window += (int32_t)get_u32(p+i); }
        else if(t==MSG_CHANNEL_EOF||t==MSG_CHANNEL_CLOSE){ fail(c,"remote shell closed"); }
        break;
    default: break;
    }
}

/* ---------- receive assembly ---------- */
static void process_rx(ssh_client*c){
    for(;;){
        uint32_t blk = c->encrypted?16:8, need;
        if(c->state==ST_LADDER||c->state==ST_LADDER_QC||c->state==ST_VERIFY||c->state==ST_ERR) return;   /* don't consume packets mid-kex */
        if(c->pkt_total==0){
            if(c->rxn < blk) return;
            if(c->encrypted){ ctr_crypt(&c->aes_s2c,c->ctr_s2c,c->ks_s2c,&c->pos_s2c,c->rx,c->rx,blk); c->pkt_dec=blk; }
            else c->pkt_dec=0;
            c->pkt_total = 4 + get_u32(c->rx);
            if(c->pkt_total<8 || c->pkt_total>PKTCAP){ fail(c,"bad packet length"); return; }
        }
        need = c->pkt_total + (c->encrypted?32:0);
        if(c->rxn < need){
            if(c->encrypted && c->pkt_dec < c->pkt_total){
                uint32_t avail = (c->rxn<c->pkt_total?c->rxn:c->pkt_total) - c->pkt_dec;
                ctr_crypt(&c->aes_s2c,c->ctr_s2c,c->ks_s2c,&c->pos_s2c, c->rx+c->pkt_dec, c->rx+c->pkt_dec, avail);
                c->pkt_dec += avail;
            }
            return;
        }
        if(c->encrypted){
            uint8_t mac[32], seqb[4]; static uint8_t macin[4+PKTCAP];
            if(c->pkt_dec < c->pkt_total){ ctr_crypt(&c->aes_s2c,c->ctr_s2c,c->ks_s2c,&c->pos_s2c, c->rx+c->pkt_dec, c->rx+c->pkt_dec, c->pkt_total-c->pkt_dec); c->pkt_dec=c->pkt_total; }
            put_u32(seqb,c->seq_s2c); memcpy(macin,seqb,4); memcpy(macin+4,c->rx,c->pkt_total);
            hmac_sha256(c->mac_s2c,32,macin,4+c->pkt_total,mac);
            if(memcmp(mac, c->rx+c->pkt_total, 32)!=0){ fail(c,"MAC verify failed"); return; }
        }
        {   uint8_t padlen=c->rx[4]; uint32_t paylen;
            /* rx=[length(4)][padlen(1)][payload][padding]; pkt_total=4+length; payload=pkt_total-4-1-padlen */
            paylen = c->pkt_total - 5 - padlen;
            on_payload(c, c->rx+5, paylen);
        }
        c->seq_s2c++;
        memmove(c->rx, c->rx+need, c->rxn-need);
        c->rxn -= need; c->pkt_total=0; c->pkt_dec=0;
        if(c->state==ST_ERR) return;
    }
}

/* ---------- version exchange (line based, before binary packets) ---------- */
static void try_version(ssh_client*c){
    uint32_t i;
    for(i=0;i<c->rxn;i++){
        if(c->rx[i]=='\n'){
            uint32_t L=i; if(L>0 && c->rx[L-1]=='\r') L--;
            if(L>=4 && memcmp(c->rx,"SSH-",4)==0){
                if(L>=sizeof(c->vs)) L=sizeof(c->vs)-1;
                memcpy(c->vs,c->rx,L); c->vs[L]=0; c->vsn=L;
                memmove(c->rx,c->rx+i+1,c->rxn-(i+1)); c->rxn-=(i+1);
                c->got_version=1;
                build_kexinit(c); send_packet(c, c->ic, c->icn);
                c->state=ST_KEXINIT;
                return;
            } else { /* a banner line before the version: drop it */
                memmove(c->rx,c->rx+i+1,c->rxn-(i+1)); c->rxn-=(i+1); i=(uint32_t)-1;
            }
        }
    }
}

/* ---------- public API ---------- */
ssh_client *ssh_new(const ssh_io *io, const char *user, const char *password){
    ssh_client *c = (ssh_client*)calloc(1,sizeof(ssh_client));
    if(!c) return 0;
    c->io=*io; c->user=user; c->password=password;
    c->state=ST_VERSION; c->err[0]=0;
    strcpy(c->vc, "SSH-2.0-Plutonix_1.0");
    /* send our version line immediately */
    io->send(io->user, (const uint8_t*)c->vc, (uint32_t)strlen(c->vc));
    io->send(io->user, (const uint8_t*)"\r\n", 2);
    return c;
}
void ssh_free(ssh_client*c){ if(c) free(c); }

void ssh_feed(ssh_client*c, const uint8_t*data, size_t len){
    if(c->state==ST_ERR) return;
    if(c->rxn + len > RXCAP) len = RXCAP - c->rxn;
    memcpy(c->rx+c->rxn, data, len); c->rxn += (uint32_t)len;
    if(!c->got_version) try_version(c);
    if(c->got_version) process_rx(c);
}

int ssh_pump(ssh_client*c, int ladder_steps){
    if(c->state==ST_ERR) return -1;
    if(c->state==ST_LADDER_QC){             /* phase 1: our ephemeral public key */
        if(x25519_step(&c->lad, ladder_steps)){
            x25519_finish(&c->lad, c->eph_pub);
            send_kex_ecdh_init(c);
            c->state=ST_KEXREPLY;
            process_rx(c);                  /* server's reply may already be buffered */
        } else { c->lad_bit += ladder_steps; if(c->lad_bit>255) c->lad_bit=255; }
    } else if(c->state==ST_LADDER){          /* phase 2: the shared secret */
        if(x25519_step(&c->lad, ladder_steps)){
            x25519_finish(&c->lad, c->shared);
            compute_exchange_hash(c);        /* H now known; verify the host key signs it */
            if(c->have_hostkey &&
               ed25519_verify_start(&c->vrfy, c->host_pub, c->H, 32, c->host_sig) == 0){
                c->lad_bit=0; c->state=ST_VERIFY;
                if(c->io.on_status) c->io.on_status(c->io.user,"verifying host key...");
            } else {
                fail(c,"server host key is malformed or unsupported");
            }
        } else { c->lad_bit += ladder_steps; if(c->lad_bit>255) c->lad_bit=255; }
    } else if(c->state==ST_VERIFY){          /* phase 3: Ed25519 host-key signature (resumable) */
        if(ed25519_verify_step(&c->vrfy, ladder_steps)){
            if(!ed25519_verify_finish(&c->vrfy)){
                fail(c,"HOST KEY SIGNATURE INVALID - refusing to connect");
            } else if(c->io.check_host && c->io.check_host(c->io.user, c->host_pub) < 0){
                fail(c,"HOST KEY CHANGED - possible man-in-the-middle - refusing");
            } else {
                install_keys(c);
                { W w; uint8_t b[4]; w_init(&w,b,4); w_byte(&w,MSG_NEWKEYS); send_packet(c,b,w.n); }
                c->state=ST_NEWKEYS;
                process_rx(c);              /* buffered server NEWKEYS */
            }
        } else { c->lad_bit += ladder_steps; if(c->lad_bit>255) c->lad_bit=255; }
    }
    return c->state==ST_READY ? 1 : 0;
}

/* 0..255 across the three expensive phases: Q_C, shared secret, host-key verify */
int ssh_kex_progress(ssh_client*c){
    if(c->state>=ST_NEWKEYS) return 255;
    if(c->state==ST_VERIFY)    return 170 + c->lad_bit/3;   /* ~170..255 */
    if(c->state==ST_LADDER)    return 85 + c->lad_bit/3;    /* ~85..170 */
    if(c->state==ST_LADDER_QC) return c->lad_bit/3;         /* ~0..85 */
    return c->state>ST_KEXINIT ? 255 : 0;
}

int ssh_send_data(ssh_client*c, const uint8_t*data, size_t len){
    W w; static uint8_t buf[2048]; uint32_t chunk;
    if(c->state!=ST_READY) return -1;
    while(len>0){
        chunk = len>1400?1400:(uint32_t)len;
        w_init(&w,buf,sizeof(buf));
        w_byte(&w,MSG_CHANNEL_DATA); w_u32(&w,c->srv_chan); w_str(&w,data,chunk);
        send_packet(c,buf,w.n);
        c->send_window -= chunk; data+=chunk; len-=chunk;
    }
    return 0;
}

const char *ssh_error(ssh_client*c){ return c->err; }
