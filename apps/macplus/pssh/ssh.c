/* ssh.c — tiny SSH-2 client core. See ssh.h. Portable C (host + 68k). */
#include "ssh.h"
#include "sha256.h"
#include "sha512.h"
#include "aes128.h"
#include "x25519.h"
#include "ed25519.h"
#include "zlibss.h"
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
    ST_SERVICE, ST_AUTHSIGN, ST_AUTH, ST_CHANOPEN, ST_SHELLREQ, ST_READY, ST_ERR
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
    /* optional public-key identity (tried before password) */
    uint8_t  id_seed[32], id_pub[32];
    int      have_id, tried_pubkey, tried_password;
    ed25519_sign_state sign;    /* resumable auth signature */
    uint8_t  signbuf[600]; uint32_t signbuf_len, auth_off, auth_len;
    const char *exec_cmd;       /* if set, run this command instead of a shell (for scp) */
    uint8_t  shared[32];        /* K */
    uint8_t  H[32];             /* exchange hash / session id */

    /* keys */
    int encrypted;
    aes128_ctx aes_c2s, aes_s2c;
    uint8_t ctr_c2s[16], ctr_s2c[16];
    uint8_t ks_c2s[16], ks_s2c[16]; int pos_c2s, pos_s2c;
    uint8_t mac_c2s[64], mac_s2c[64];
    uint32_t seq_c2s, seq_s2c;
    /* negotiated algorithms */
    int enc_klen_c2s, enc_klen_s2c;     /* cipher key bytes: 16 (aes128) or 32 (aes256) */
    int mac512_c2s, mac512_s2c;         /* 1 = hmac-sha2-512, 0 = hmac-sha2-256 */
    int mac_len_c2s, mac_len_s2c;       /* MAC tag bytes: 32 or 64 */
    int comp_c2s, comp_s2c;             /* 0 none, 1 zlib (at NEWKEYS), 2 zlib@openssh (after auth) */
    int comp_c2s_on, comp_s2c_on;       /* compression currently active for this direction */

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

/* one connection at a time: the (large) zlib stream contexts live in BSS, not in
   the heap-allocated client struct, to keep that struct small on the 68k. */
static zss_deflate g_def;
static zss_inflate g_inf;

/* ---------- packet send ---------- */
static void send_packet(ssh_client*c, const uint8_t*payload, uint32_t plen){
    static uint8_t pkt[PKTCAP];     /* static: too big for the 68k stack */
    uint32_t blk, padlen, total, i;
    if(c->state==ST_ERR) return;
    if(c->comp_c2s_on){                  /* compress the payload (zlib, sync-flush per packet) */
        static uint8_t cbuf[PKTCAP]; uint32_t clen=0;
        if(zss_deflate_run(&g_def, payload, plen, cbuf, sizeof(cbuf), &clen)!=0){ fail(c,"compress error"); return; }
        payload = cbuf; plen = clen;
    }
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
        uint8_t mac[64]; uint8_t seqb[4]; static uint8_t macin[4+PKTCAP];
        put_u32(seqb, c->seq_c2s);
        memcpy(macin, seqb, 4); memcpy(macin+4, pkt, 4+total);
        if(c->mac512_c2s) hmac_sha512(c->mac_c2s, 64, macin, 4+4+total, mac);
        else              hmac_sha256(c->mac_c2s, 32, macin, 4+4+total, mac);
        ctr_crypt(&c->aes_c2s, c->ctr_c2s, c->ks_c2s, &c->pos_c2s, pkt, pkt, 4+total);
        c->io.send(c->io.user, pkt, 4+total);
        c->io.send(c->io.user, mac, (size_t)c->mac_len_c2s);
    } else {
        c->io.send(c->io.user, pkt, 4+total);
    }
    (void)i;
    c->seq_c2s++;
}

/* ---------- algorithm negotiation ---------- */
/* extract name-list #idx (0-based) from a KEXINIT payload (p[0]=msg 20, then
   16-byte cookie, then 10 name-lists). copies into out (NUL-terminated). */
static int kexinit_list(const uint8_t*p, uint32_t n, int idx, char*out, uint32_t cap){
    uint32_t i = 1 + 16; int k;
    for(k=0;k<idx;k++){ uint32_t L; if(i+4>n) return 0; L=get_u32(p+i); i+=4+L; }
    if(i+4>n) return 0;
    { uint32_t L=get_u32(p+i); i+=4; if(i+L>n) return 0; if(L>=cap) L=cap-1; memcpy(out,p+i,L); out[L]=0; }
    return 1;
}
/* does comma-separated `csv` contain the token `name`? */
static int csv_has(const char*csv, const char*name){
    uint32_t nl=(uint32_t)strlen(name); const char*s=csv;
    while(*s){ const char*e=s; while(*e&&*e!=',')e++;
        if((uint32_t)(e-s)==nl && memcmp(s,name,nl)==0) return 1; s=(*e)?e+1:e; }
    return 0;
}
/* first of our preference list (NULL-terminated) present in the server csv; -1 if none */
static int pick_alg(const char*server_csv, const char*const*prefs){
    int i; for(i=0;prefs[i];i++) if(csv_has(server_csv,prefs[i])) return i; return -1;
}
/* choose cipher + MAC for each direction from the server's KEXINIT (c->is).
   returns 0 on success, -1 if no common algorithm. */
static int negotiate(ssh_client*c){
    static const char*const ciphers[] = {"aes256-ctr","aes128-ctr",0};
    static const char*const macs[]    = {"hmac-sha2-256","hmac-sha2-512",0};
    char list[768]; int v;
    if(!kexinit_list(c->is,c->isn,2,list,sizeof(list))) return -1;   /* enc c2s */
    v=pick_alg(list,ciphers); if(v<0) return -1; c->enc_klen_c2s = v==0?32:16;
    if(!kexinit_list(c->is,c->isn,3,list,sizeof(list))) return -1;   /* enc s2c */
    v=pick_alg(list,ciphers); if(v<0) return -1; c->enc_klen_s2c = v==0?32:16;
    if(!kexinit_list(c->is,c->isn,4,list,sizeof(list))) return -1;   /* mac c2s */
    v=pick_alg(list,macs); if(v<0) return -1; c->mac512_c2s = (v==1); c->mac_len_c2s = v==1?64:32;
    if(!kexinit_list(c->is,c->isn,5,list,sizeof(list))) return -1;   /* mac s2c */
    v=pick_alg(list,macs); if(v<0) return -1; c->mac512_s2c = (v==1); c->mac_len_s2c = v==1?64:32;
    {   /* MUST match the offer order in build_kexinit (client preference wins). */
        static const char*const comps[] = {"zlib@openssh.com","zlib","none",0};
        c->comp_c2s = c->comp_s2c = 0;   /* 0 none, 1 immediate-zlib, 2 delayed-zlib@openssh */
        if(kexinit_list(c->is,c->isn,6,list,sizeof(list))){ v=pick_alg(list,comps); if(v>=0) c->comp_c2s = (v==0)?2:(v==1)?1:0; }
        if(kexinit_list(c->is,c->isn,7,list,sizeof(list))){ v=pick_alg(list,comps); if(v>=0) c->comp_s2c = (v==0)?2:(v==1)?1:0; }
    }
    return 0;
}

/* ---------- kex helpers ---------- */
static void build_kexinit(ssh_client*c){
    W w; uint8_t cookie[16];
    w_init(&w, c->ic, sizeof(c->ic));
    w_byte(&w, MSG_KEXINIT);
    if(c->io.get_random) c->io.get_random(c->io.user, cookie, 16); else memset(cookie,0,16);
    w_raw(&w, cookie, 16);
    w_cstr(&w, "curve25519-sha256,curve25519-sha256@libssh.org");   /* kex (same wire) */
    w_cstr(&w, "ssh-ed25519");                 /* server host key (signature verified) */
    w_cstr(&w, "aes256-ctr,aes128-ctr");        /* enc c2s */
    w_cstr(&w, "aes256-ctr,aes128-ctr");        /* enc s2c */
    w_cstr(&w, "hmac-sha2-256,hmac-sha2-512");  /* mac c2s */
    w_cstr(&w, "hmac-sha2-256,hmac-sha2-512");  /* mac s2c */
    w_cstr(&w, "zlib@openssh.com,zlib,none");    /* comp c2s (compression preferred) */
    w_cstr(&w, "zlib@openssh.com,zlib,none");    /* comp s2c */
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
    /* RFC 4253 7.2: K1 = HASH(mpint(K)||H||X||session_id); session_id=H.
       Extend if needed: K2 = HASH(mpint(K)||H||K1), K3 = HASH(...||K1||K2)... */
    sha256_ctx s; uint8_t blk[32]; W w; uint8_t mp[40]; uint32_t mpn, got=0;
    w_init(&w, mp, sizeof(mp)); w_mpint(&w, c->shared, 32); mpn=w.n;
    sha256_init(&s); sha256_update(&s, mp, mpn); sha256_update(&s, c->H, 32);
    sha256_update(&s, &X, 1); sha256_update(&s, c->H, 32); sha256_final(&s, blk);
    for(;;){
        uint32_t take = (outlen-got < 32) ? (outlen-got) : 32;
        memcpy(out+got, blk, take); got += take;
        if(got >= outlen) break;
        /* next block = HASH(mpint(K) || H || all-derived-so-far) */
        sha256_init(&s); sha256_update(&s, mp, mpn); sha256_update(&s, c->H, 32);
        sha256_update(&s, out, got); sha256_final(&s, blk);
    }
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
    uint8_t iv1[16], iv2[16], k1[32], k2[32];
    /* c->H was computed (compute_exchange_hash) before host-key verification.
       Key/IV/MAC lengths follow the negotiated cipher + MAC. */
    derive_key(c,'A',iv1,16); derive_key(c,'B',iv2,16);
    derive_key(c,'C',k1,(uint32_t)c->enc_klen_c2s); derive_key(c,'D',k2,(uint32_t)c->enc_klen_s2c);
    derive_key(c,'E',c->mac_c2s,(uint32_t)c->mac_len_c2s);
    derive_key(c,'F',c->mac_s2c,(uint32_t)c->mac_len_s2c);
    aes_init(&c->aes_c2s, k1, c->enc_klen_c2s); aes_init(&c->aes_s2c, k2, c->enc_klen_s2c);
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
    if(c->exec_cmd){                     /* run a command (e.g. scp) instead of an interactive shell */
        static uint8_t eb[600];
        w_init(&w,eb,sizeof(eb));
        w_byte(&w,MSG_CHANNEL_REQUEST); w_u32(&w,c->srv_chan); w_cstr(&w,"exec"); w_byte(&w,1);
        w_cstr(&w,c->exec_cmd);
        send_packet(c,eb,w.n);
        return;
    }
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

/* ---------- authentication ---------- */
static void send_password_auth(ssh_client*c){
    W w; static uint8_t b[600];
    w_init(&w,b,sizeof(b));
    w_byte(&w,MSG_USERAUTH_REQUEST); w_cstr(&w,c->user); w_cstr(&w,"ssh-connection");
    w_cstr(&w,"password"); w_byte(&w,0); w_cstr(&w, c->password ? c->password : "");
    send_packet(c,b,w.n);
    c->tried_password = 1;
}
/* Build the publickey USERAUTH_REQUEST and start the (resumable) signature.
   The signed data is string(session_id) || the request payload (RFC 4252 7). */
static void start_pubkey_auth(ssh_client*c){
    W w; uint32_t off;
    w_init(&w, c->signbuf, sizeof(c->signbuf));
    w_str(&w, c->H, 32);                          /* string(session_id) */
    off = w.n;
    w_byte(&w, MSG_USERAUTH_REQUEST);
    w_cstr(&w, c->user);
    w_cstr(&w, "ssh-connection");
    w_cstr(&w, "publickey");
    w_byte(&w, 1);                                /* TRUE: signature included */
    w_cstr(&w, "ssh-ed25519");
    w_u32(&w, 4+11+4+32);                         /* pubkey blob = string(alg)+string(key) */
    w_cstr(&w, "ssh-ed25519"); w_str(&w, c->id_pub, 32);
    c->auth_off = off; c->auth_len = w.n - off; c->signbuf_len = w.n;
    ed25519_sign_start(&c->sign, c->signbuf, c->signbuf_len, c->id_pub, c->id_seed);
    c->lad_bit = 0; c->state = ST_AUTHSIGN;
    if(c->io.on_status) c->io.on_status(c->io.user,"signing in with key...");
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
            if(negotiate(c) != 0){ fail(c,"no common cipher/MAC with server"); break; }
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
            /* "zlib" (non-delayed) compression starts immediately at NEWKEYS */
            if(c->comp_s2c==1){ zss_inflate_init(&g_inf); c->comp_s2c_on=1; }
            if(c->comp_c2s==1){ zss_deflate_init(&g_def,6); c->comp_c2s_on=1; }
            w_init(&w,b,64); w_byte(&w,MSG_SERVICE_REQUEST); w_cstr(&w,"ssh-userauth"); send_packet(c,b,w.n);
            c->state=ST_SERVICE;
        }
        break;
    case ST_SERVICE:
        if(t==MSG_SERVICE_ACCEPT){
            if(c->io.on_status) c->io.on_status(c->io.user,"authenticating...");
            if(c->have_id){ start_pubkey_auth(c); }       /* try the key first */
            else { send_password_auth(c); c->state=ST_AUTH; }
        }
        break;
    case ST_AUTH:
        if(t==MSG_USERAUTH_SUCCESS){
            /* "zlib@openssh.com" (delayed) compression starts after auth succeeds */
            if(c->comp_s2c==2){ zss_inflate_init(&g_inf); c->comp_s2c_on=1; }
            if(c->comp_c2s==2){ zss_deflate_init(&g_def,6); c->comp_c2s_on=1; }
            open_channel(c); c->state=ST_CHANOPEN;
        }
        else if(t==MSG_USERAUTH_FAILURE){
            if(!c->tried_password && c->password && c->password[0]){   /* key rejected -> password */
                if(c->io.on_status) c->io.on_status(c->io.user,
                    c->tried_pubkey ? "key rejected, trying password..." : "authenticating...");
                send_password_auth(c);                                 /* stays ST_AUTH */
            } else fail(c, c->tried_pubkey ? "authentication failed (key and password rejected)"
                                           : "authentication failed (wrong password?)");
        }
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
        if(c->state==ST_LADDER||c->state==ST_LADDER_QC||c->state==ST_VERIFY||
           c->state==ST_AUTHSIGN||c->state==ST_ERR) return;   /* don't consume packets mid-crypto */
        if(c->pkt_total==0){
            if(c->rxn < blk) return;
            if(c->encrypted){ ctr_crypt(&c->aes_s2c,c->ctr_s2c,c->ks_s2c,&c->pos_s2c,c->rx,c->rx,blk); c->pkt_dec=blk; }
            else c->pkt_dec=0;
            c->pkt_total = 4 + get_u32(c->rx);
            if(c->pkt_total<8 || c->pkt_total>PKTCAP){ fail(c,"bad packet length"); return; }
        }
        need = c->pkt_total + (c->encrypted?(uint32_t)c->mac_len_s2c:0);
        if(c->rxn < need){
            if(c->encrypted && c->pkt_dec < c->pkt_total){
                uint32_t avail = (c->rxn<c->pkt_total?c->rxn:c->pkt_total) - c->pkt_dec;
                ctr_crypt(&c->aes_s2c,c->ctr_s2c,c->ks_s2c,&c->pos_s2c, c->rx+c->pkt_dec, c->rx+c->pkt_dec, avail);
                c->pkt_dec += avail;
            }
            return;
        }
        if(c->encrypted){
            uint8_t mac[64], seqb[4]; static uint8_t macin[4+PKTCAP];
            if(c->pkt_dec < c->pkt_total){ ctr_crypt(&c->aes_s2c,c->ctr_s2c,c->ks_s2c,&c->pos_s2c, c->rx+c->pkt_dec, c->rx+c->pkt_dec, c->pkt_total-c->pkt_dec); c->pkt_dec=c->pkt_total; }
            put_u32(seqb,c->seq_s2c); memcpy(macin,seqb,4); memcpy(macin+4,c->rx,c->pkt_total);
            if(c->mac512_s2c) hmac_sha512(c->mac_s2c,64,macin,4+c->pkt_total,mac);
            else              hmac_sha256(c->mac_s2c,32,macin,4+c->pkt_total,mac);
            if(memcmp(mac, c->rx+c->pkt_total, (size_t)c->mac_len_s2c)!=0){ fail(c,"MAC verify failed"); return; }
        }
        {   uint8_t padlen=c->rx[4]; uint32_t paylen;
            /* rx=[length(4)][padlen(1)][payload][padding]; pkt_total=4+length; payload=pkt_total-4-1-padlen */
            paylen = c->pkt_total - 5 - padlen;
            if(c->comp_s2c_on){          /* decompress before dispatch */
                static uint8_t dbuf[RXCAP]; uint32_t dlen=0;
                if(zss_inflate_run(&g_inf, c->rx+5, paylen, dbuf, sizeof(dbuf), &dlen)!=0){ fail(c,"decompress error"); return; }
                on_payload(c, dbuf, dlen);
            } else {
                on_payload(c, c->rx+5, paylen);
            }
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

void ssh_set_identity(ssh_client*c, const uint8_t seed[32]){
    memcpy(c->id_seed, seed, 32);
    ed25519_pubkey_from_seed(c->id_pub, seed);
    c->have_id = 1;
}

void ssh_set_exec(ssh_client*c, const char *cmd){ c->exec_cmd = cmd; }

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
    } else if(c->state==ST_AUTHSIGN){        /* resumable public-key auth signature */
        if(ed25519_sign_step(&c->sign, ladder_steps)){
            uint8_t sig[64]; W w; static uint8_t pb[700];
            ed25519_sign_finish(&c->sign, sig);
            w_init(&w, pb, sizeof(pb));
            w_raw(&w, c->signbuf + c->auth_off, c->auth_len);   /* the request payload */
            w_u32(&w, 4+11+4+64);                                /* signature blob */
            w_cstr(&w, "ssh-ed25519"); w_str(&w, sig, 64);
            send_packet(c, pb, w.n);
            c->tried_pubkey = 1; c->state = ST_AUTH;
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
