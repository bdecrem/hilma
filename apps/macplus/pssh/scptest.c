/* scptest.c — drive the SSH client + scp.inc through a REAL scp transfer against
 * a real sshd (which runs the real `scp` binary on the far end).
 *   cc -O2 -o /tmp/scptest ssh.c sha256.c sha512.c aes128.c x25519.c ed25519.c scptest.c
 *   PSSH_IDENTITY=<seedhex> /tmp/scptest <host> <port> <user> put <local> <remote>
 *   PSSH_IDENTITY=<seedhex> /tmp/scptest <host> <port> <user> get <remote> <local>
 * Exit 0 on a completed transfer.
 */
#include "ssh.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <time.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include "scp.inc"

static int g_sock;
static ssh_client *g_c;
static ScpCtx g_scp;
static FILE *g_file;
static int g_started;

static int io_send(void *u, const uint8_t *d, size_t n){ (void)u; return (int)write(g_sock, d, n); }
static void io_status(void *u, const char *m){ (void)u; fprintf(stderr, "[ssh] %s\n", m); }
static void io_rand(void *u, uint8_t *o, size_t n){ (void)u; FILE*f=fopen("/dev/urandom","rb"); if(f){if(fread(o,1,n,f)!=n){} fclose(f);} }
static int io_check_host(void *u, const uint8_t k[32]){ (void)u;(void)k; return 0; }
/* channel data -> the scp state machine */
static void io_data(void *u, const uint8_t *d, size_t n){ (void)u;
    if(getenv("PSSH_SCP_DEBUG")){ size_t k; fprintf(stderr,"[rx %zu]",n); for(k=0;k<n&&k<40;k++) fprintf(stderr," %02x%c",d[k], (d[k]>=32&&d[k]<127)?d[k]:'.'); fprintf(stderr,"\n"); }
    scp_feed(&g_scp, d, (uint32_t)n); }

/* scp callbacks */
static int  scp_emit(void *u, const uint8_t *d, uint32_t n){ (void)u; return ssh_send_data(g_c, d, n) >= 0 ? 0 : -1; }
static long scp_fread(void *u, uint8_t *buf, long max){ (void)u; return (long)fread(buf, 1, (size_t)max, g_file); }
static int  scp_fwrite(void *u, const uint8_t *d, long n){ (void)u; return fwrite(d, 1, (size_t)n, g_file) == (size_t)n ? 0 : -1; }

int main(int argc, char **argv){
    const char *host,*user,*mode,*a,*b; int port; struct sockaddr_in sa; ssh_io io;
    char execcmd[300]; long fsize=0; time_t t0; const char *idhex;
    if(argc < 7){ fprintf(stderr,"usage: %s host port user put|get arg1 arg2\n",argv[0]); return 2; }
    host=argv[1]; port=atoi(argv[2]); user=argv[3]; mode=argv[4]; a=argv[5]; b=argv[6];

    if(!strcmp(mode,"put")){                       /* a=local b=remote */
        g_file = fopen(a,"rb"); if(!g_file){ perror("open local"); return 2; }
        fseek(g_file,0,SEEK_END); fsize=ftell(g_file); fseek(g_file,0,SEEK_SET);
        snprintf(execcmd,sizeof(execcmd),"scp -t %s", b);
    } else {                                        /* get: a=remote b=local */
        g_file = fopen(b,"wb"); if(!g_file){ perror("open local"); return 2; }
        snprintf(execcmd,sizeof(execcmd),"scp -f %s", a);
    }

    g_sock=socket(AF_INET,SOCK_STREAM,0);
    memset(&sa,0,sizeof(sa)); sa.sin_family=AF_INET; sa.sin_port=htons(port);
    inet_pton(AF_INET,host,&sa.sin_addr);
    if(connect(g_sock,(struct sockaddr*)&sa,sizeof(sa))!=0){ perror("connect"); return 2; }
    fcntl(g_sock,F_SETFL,O_NONBLOCK);

    io.send=io_send; io.on_data=io_data; io.on_status=io_status; io.get_random=io_rand;
    io.check_host=io_check_host; io.user=0;
    g_c=ssh_new(&io,user,"");
    ssh_set_exec(g_c, execcmd);
    idhex=getenv("PSSH_IDENTITY");
    if(idhex && strlen(idhex)>=64){ uint8_t seed[32]; int k; for(k=0;k<32;k++){int hi=idhex[k*2],lo=idhex[k*2+1];hi=hi<='9'?hi-'0':(hi|32)-'a'+10;lo=lo<='9'?lo-'0':(lo|32)-'a'+10;seed[k]=(uint8_t)((hi<<4)|lo);} ssh_set_identity(g_c,seed); }

    if(!strcmp(mode,"put")) scp_put_init(&g_scp, scp_emit, scp_fread, 0, b, fsize);
    else                    scp_get_init(&g_scp, scp_emit, scp_fwrite, 0);

    t0=time(0);
    for(;;){
        uint8_t buf[4096]; int r,st;
        r=(int)read(g_sock,buf,sizeof(buf));
        if(r>0) ssh_feed(g_c,buf,r);
        else if(r==0){ fprintf(stderr,"socket closed\n"); break; }
        st=ssh_pump(g_c,4096);
        if(!g_started && st==1){ g_started=1; scp_start(&g_scp); }   /* channel ready -> begin scp */
        if(g_scp.finished){
            fclose(g_file);
            fprintf(stderr,"\n--- scp %s: %s (%ld bytes) ---\n", mode,
                    g_scp.error?"FAIL":"OK", g_scp.moved);
            ssh_free(g_c); return g_scp.error?1:0;
        }
        if(st<0){
            /* channel closed: success only if scp already finished (handled above) */
            fprintf(stderr,"SSH: %s\n", ssh_error(g_c));
            fclose(g_file); ssh_free(g_c); return g_scp.finished && !g_scp.error ? 0 : 1;
        }
        if(time(0)-t0>30){ fprintf(stderr,"timeout\n"); fclose(g_file); ssh_free(g_c); return 1; }
        usleep(2000);
    }
    fclose(g_file); ssh_free(g_c); return 1;
}
