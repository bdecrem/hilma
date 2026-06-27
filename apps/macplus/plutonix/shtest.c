/*
 * shtest.c — host test for the Plutonix Unix userland (shell.inc).
 *   cc -o /tmp/shtest shtest.c && /tmp/shtest
 * Drives the real tokenizer, pipeline engine, redirection, and every program
 * against a fake in-memory filesystem. No emulator, no network.
 */
#include <stdio.h>
#include <string.h>

/* ---- captured console (shell.inc externs these; they don't need PxBuf) ---- */
static char gCap[16384]; static int gCapLen;
static void capreset(void) { gCapLen = 0; gCap[0] = 0; }
void PxOut(const char *s)   { int n=(int)strlen(s); if(gCapLen+n<(int)sizeof(gCap)-1){memcpy(gCap+gCapLen,s,n);gCapLen+=n;gCap[gCapLen]=0;} }
void PxOutLn(const char *s) { PxOut(s); PxOut("\n"); }
void PxDate(char *out, short cap) { strncpy(out,"Sat Jun 27 09:00 2026",cap); out[cap-1]=0; }
long PxFreeMem(void) { return 3000000L; }

void PxSetRemote(const char*h, unsigned short p){(void)h;(void)p;}
void PxSetScp(int g, const char*l, const char*r){(void)g;(void)l;(void)r;}
#include "shell.inc"

/* ---- fake filesystem (uses PxBuf, so it lives after the include) ---- */
static char gCwd[256] = "/";
static char gWritten[4096]; static char gWrittenName[128];
struct FF { const char *path; const char *body; };
static struct FF gFiles[] = {
    { "/lines.txt", "cherry\nbanana\napple\nbanana\n" },
    { "/readme",    "hello PLUTONIX world\n" },
    { 0, 0 }
};
static const char *gDirs[] = { "/", "/Apps", 0 };

short FsChdir(const char *path) { if(!strcmp(path,"/")){strcpy(gCwd,"/");return 0;} if(!strcmp(path,"/Apps")){strcpy(gCwd,"/Apps");return 0;} return -1; }
void  FsPwd(char *out, short cap) { strncpy(out,gCwd,cap); out[cap-1]=0; }
short FsListInto(const char *path, PxBuf *out) {
    const char *base = (path&&path[0])?path:gCwd; int i;
    if(strcmp(base,"/")&&strcmp(base,"/Apps")) return -1;
    if(!strcmp(base,"/")){ BufPutS(out,"Apps/\n"); for(i=0;gFiles[i].path;i++){const char*f=gFiles[i].path; if(!strchr(f+1,'/')) {BufPutS(out,f+1);BufPutC(out,'\n');}} }
    return 0;
}
long FsReadInto(const char *path, PxBuf *out) { int i; char abs[256];
    if(path[0]=='/')strcpy(abs,path); else if(!strcmp(gCwd,"/"))sprintf(abs,"/%s",path); else sprintf(abs,"%s/%s",gCwd,path);
    for(i=0;gFiles[i].path;i++) if(!strcmp(gFiles[i].path,abs)){ long n=(long)strlen(gFiles[i].body); BufPutN(out,gFiles[i].body,n); return n; } return -1; }
short FsWriteFrom(const char *path, const char *b, long n, short append) { (void)append; strncpy(gWrittenName,path,sizeof(gWrittenName)); if(n>(long)sizeof(gWritten)-1)n=sizeof(gWritten)-1; memcpy(gWritten,b,n); gWritten[n]=0; return 0; }
short FsMkdir(const char *path) { (void)path; return 0; }
short FsRemove(const char *path) { (void)path; return 0; }

/* ---- harness ---- */
static int gPass=0,gFail=0;
static void ok(const char *label,int cond){ if(cond)gPass++; else {gFail++; printf("FAIL: %s\n  got: <<%s>>\n",label,gCap);} }
static short run(const char *cmd){ char b[512]; strncpy(b,cmd,sizeof(b)); b[sizeof(b)-1]=0; capreset(); return ShRun(b); }

int main(void) {
    short rc;

    ok("echo", (run("echo hello world"),!strcmp(gCap,"hello world\n")));
    ok("echo quotes", (run("echo \"a b\" c"),!strcmp(gCap,"a b c\n")));
    ok("uname", (run("uname"),strstr(gCap,"Plutonix 1.0")&&strstr(gCap,"m68000")));

    rc=run("clear"); ok("clear -> rc 2", rc==2);
    rc=run("ssh");   ok("ssh -> rc 1", rc==1);
    rc=run("mini");  ok("mini -> rc 1", rc==1);

    ok("bogus -> not found", (run("zzz x"),strstr(gCap,"command not found")!=0));

    ok("pwd /", (run("pwd"),!strcmp(gCap,"/\n")));
    rc=run("cd /Apps"); ok("cd ok", rc==0);
    ok("pwd /Apps after cd", (run("pwd"),!strcmp(gCap,"/Apps\n")));
    ok("cd bad", (run("cd /nope"),strstr(gCap,"no such directory")!=0));
    run("cd /");

    ok("ls /", (run("ls /"),strstr(gCap,"Apps/")&&strstr(gCap,"lines.txt")));
    ok("cat file", (run("cat readme"),strstr(gCap,"hello PLUTONIX world")!=0));
    ok("cat missing", (run("cat /nope"),strstr(gCap,"no such file")!=0));

    /* ---- pipes ---- */
    ok("pipe: cat | wc -l", (run("cat lines.txt | wc -l"),strstr(gCap,"4")!=0));
    ok("pipe: cat | sort", (run("cat lines.txt | sort"),strncmp(gCap,"apple\nbanana\nbanana\ncherry\n",26)==0));
    ok("pipe: sort | uniq", (run("cat lines.txt | sort | uniq"),!strcmp(gCap,"apple\nbanana\ncherry\n")));
    ok("pipe: grep", (run("cat lines.txt | grep ban"),!strcmp(gCap,"banana\nbanana\n")));
    ok("pipe: grep -v", (run("cat lines.txt | grep -v banana"),!strcmp(gCap,"cherry\napple\n")));
    ok("pipe: head -n 2", (run("cat lines.txt | head -n 2"),!strcmp(gCap,"cherry\nbanana\n")));
    ok("pipe: tail -n 1", (run("cat lines.txt | tail -n 1"),!strcmp(gCap,"banana\n")));
    ok("pipe: rev", (run("echo abc | rev"),!strcmp(gCap,"cba\n")));
    ok("pipe: tr lower->upper", (run("cat readme | tr a-z A-Z"),strstr(gCap,"HELLO PLUTONIX WORLD")!=0));
    ok("pipe: nl", (run("cat readme | nl"),strstr(gCap,"  1  hello")!=0));
    ok("3-stage pipe", (run("ls / | grep txt | wc -l"),strstr(gCap,"1")!=0));
    ok("uname | tr", (run("uname | tr a-z A-Z"),strstr(gCap,"PLUTONIX")!=0));

    /* ---- redirection ---- */
    run("echo redirected > out.txt");
    ok("redirect > writes file", !strcmp(gWritten,"redirected\n") && strstr(gWrittenName,"out.txt"));
    ok("redirect > no console echo", strcmp(gCap,"")==0);
    run("sort < lines.txt");
    ok("redirect < reads file then sorts", strncmp(gCap,"apple\nbanana\nbanana\ncherry\n",26)==0);
    run("cat lines.txt | sort | uniq > u.txt");
    ok("pipe + redirect", !strcmp(gWritten,"apple\nbanana\ncherry\n"));

    ok("mem pipeable", (run("mem | grep memory"),strstr(gCap,"3000000")!=0));
    ok("help pipeable", (run("help | grep programs"),strstr(gCap,"echo")!=0));

    printf("\nshtest: %d passed, %d failed\n", gPass, gFail);
    return gFail?1:0;
}
