/*
 * shell.inc — Plutonix shell core: a real (small) Unix userland that runs ON
 * the Macintosh Plus. Not a remote client — a local pipeline engine + a suite
 * of stream programs that execute on the 68000 against the filesystem.
 *
 *   - programs are functions over byte streams: Cmd(argc,argv,in,inLen,out)
 *   - the shell parses pipelines ("a | b | c") and redirection ("< f", "> f",
 *     ">> f"), runs each stage feeding its output to the next, then emits the
 *     final stage to the console (or a file).
 *   - programs: echo cat ls pwd grep wc head tail sort uniq rev nl tr date mem
 *               uname help   (all pipeable: `uname | tr a-z A-Z`)
 *   - control (side-effecting): cd mkdir rm clear  and the remote commands:
 *     mini/rsh (instant raw shell on the mini) and ssh (real SSH-2)
 *
 * Shared verbatim with the host test (shtest.c): pipes, redirection, and every
 * program are tested with the system clang, no emulator, no network.
 */

#define PX_MAXARGS  24
#define PX_MAXSTAGES 8
#define PX_BUF      16384       /* per-stage stream buffer */
#define PX_MAXLINES 1024        /* sort/tail line cap */
#define PX_VERSION  "Plutonix 1.0"

/* ---- growable-but-capped byte buffer (defined first so Fs* can take it) ---- */
typedef struct PxBuf { char *p; long len; long cap; } PxBuf;
static void BufInit(PxBuf *b, char *store, long cap) { b->p = store; b->len = 0; b->cap = cap; b->p[0] = 0; }
static void BufPutC(PxBuf *b, char c) { if (b->len < b->cap - 1) { b->p[b->len++] = c; b->p[b->len] = 0; } }
static void BufPutN(PxBuf *b, const char *s, long n) { long i; for (i = 0; i < n; i++) BufPutC(b, s[i]); }
static void BufPutS(PxBuf *b, const char *s) { while (*s) BufPutC(b, *s++); }
static void BufPutLong(PxBuf *b, long v) { char t[16]; short n=0,neg=0; if(v<0){neg=1;v=-v;} if(v==0)t[n++]='0'; while(v>0){t[n++]=(char)('0'+v%10);v/=10;} if(neg)t[n++]='-'; while(n>0)BufPutC(b,t[--n]); }

/* ---- filesystem layer (app implements over HFS; test stubs it) ---- */
extern short FsChdir(const char *path);
extern void  FsPwd(char *out, short cap);
extern short FsListInto(const char *path, PxBuf *out);
extern long  FsReadInto(const char *path, PxBuf *out);          /* <0 = error */
extern short FsWriteFrom(const char *path, const char *b, long n, short append);
extern short FsMkdir(const char *path);
extern short FsRemove(const char *path);
extern void  PxOut(const char *s);
extern void  PxOutLn(const char *s);
extern void  PxDate(char *out, short cap);
extern long  PxFreeMem(void);
extern void  PxSetRemote(const char *host, unsigned short port);  /* ssh target */
extern void  PxSetScp(int isGet, const char *local, const char *remote);  /* scp target */

/* ---- tiny freestanding helpers ---- */
static short SLen(const char *s) { short n=0; while(s[n])n++; return n; }
static short SEq(const char *a, const char *b) { short i=0; while(a[i]&&a[i]==b[i])i++; return a[i]==0&&b[i]==0; }
static short Has(const char *hay, long hlen, const char *needle)
{ short nl=SLen(needle); long i; if(nl==0)return 1; for(i=0;i+nl<=hlen;i++){short j=0; while(j<nl&&hay[i+j]==needle[j])j++; if(j==nl)return 1;} return 0; }
static short Atoi(const char *s) { short v=0; while(*s>='0'&&*s<='9'){v=v*10+(*s-'0');s++;} return v; }

static const char *NextLine(const char *in, long inLen, long *pos, long *len)
{ long start=*pos,i; if(start>=inLen)return 0; for(i=start;i<inLen&&in[i]!='\n';i++); *len=i-start; *pos=(i<inLen)?i+1:i; return in+start; }

/* ===================== the programs ===================== */
typedef short (*CmdFn)(short, char **, const char *, long, PxBuf *);

static short CmdEcho(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ short i; (void)in;(void)inLen; for(i=1;i<argc;i++){BufPutS(out,argv[i]); if(i+1<argc)BufPutC(out,' ');} BufPutC(out,'\n'); return 0; }

static short CmdCat(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ if(argc>1){short i; for(i=1;i<argc;i++){ if(FsReadInto(argv[i],out)<0){BufPutS(out,"cat: ");BufPutS(out,argv[i]);BufPutS(out,": no such file\n");} }} else BufPutN(out,in,inLen); return 0; }

static short CmdLs(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ (void)in;(void)inLen; if(FsListInto(argc>1?argv[1]:"",out)!=0) BufPutS(out,"ls: no such directory\n"); return 0; }

static short CmdPwd(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ char cwd[256]; (void)argc;(void)argv;(void)in;(void)inLen; FsPwd(cwd,sizeof(cwd)); BufPutS(out,cwd); BufPutC(out,'\n'); return 0; }

static short CmdGrep(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long pos=0,len; const char *ln; const char *pat; short inv=0,a=1;
  if(argc>1&&SEq(argv[1],"-v")){inv=1;a=2;}
  if(a>=argc){BufPutS(out,"usage: grep [-v] <pattern>\n");return 0;}
  pat=argv[a];
  while((ln=NextLine(in,inLen,&pos,&len))){ short hit=Has(ln,len,pat); if(hit!=inv){BufPutN(out,ln,len);BufPutC(out,'\n');} }
  return 0; }

static short CmdWc(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long lines=0,words=0,bytes=inLen,i; short inw=0,only=0;
  if(argc>1){ if(SEq(argv[1],"-l"))only=1; else if(SEq(argv[1],"-w"))only=2; else if(SEq(argv[1],"-c"))only=3; }
  for(i=0;i<inLen;i++){char c=in[i]; if(c=='\n')lines++; if(c==' '||c=='\t'||c=='\n'){if(inw){words++;inw=0;}} else inw=1;}
  if(inw)words++;
  if(only==1)BufPutLong(out,lines); else if(only==2)BufPutLong(out,words); else if(only==3)BufPutLong(out,bytes);
  else { BufPutS(out,"  ");BufPutLong(out,lines);BufPutS(out,"  ");BufPutLong(out,words);BufPutS(out,"  ");BufPutLong(out,bytes); }
  BufPutC(out,'\n'); return 0; }

static short ArgN(short argc, char **argv, short def)
{ if(argc>2&&SEq(argv[1],"-n"))return Atoi(argv[2]); if(argc>1&&argv[1][0]=='-'&&argv[1][1]>='0'&&argv[1][1]<='9')return Atoi(argv[1]+1); return def; }

static short CmdHead(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long pos=0,len; const char *ln; short n=ArgN(argc,argv,10); long c=0;
  while(c<n&&(ln=NextLine(in,inLen,&pos,&len))){BufPutN(out,ln,len);BufPutC(out,'\n');c++;} return 0; }

/* shared line-index store (one command runs at a time, so static is safe and
   keeps these big arrays off the tiny 68k stack) */
static long gLS[PX_MAXLINES];
static long gLL[PX_MAXLINES];

static short CmdTail(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long pos=0,len; const char *ln; short n=ArgN(argc,argv,10); long total=0,k,start;
  while((ln=NextLine(in,inLen,&pos,&len))){ if(total<PX_MAXLINES){gLS[total]=ln-in;gLL[total]=len;} total++; }
  start=(total>n)?total-n:0;
  for(k=start;k<total&&k<PX_MAXLINES;k++){BufPutN(out,in+gLS[k],gLL[k]);BufPutC(out,'\n');} return 0; }

static short CmpLine(const char *in, long a, long al, long b, long bl)
{ long i=0; while(i<al&&i<bl){unsigned char ca=in[a+i],cb=in[b+i]; if(ca!=cb)return (ca<cb)?-1:1; i++;} if(al!=bl)return(al<bl)?-1:1; return 0; }
static short CmdSort(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long pos=0,len; const char *ln; long n=0,i,j; (void)argc;(void)argv;
  while((ln=NextLine(in,inLen,&pos,&len))&&n<PX_MAXLINES){gLS[n]=ln-in;gLL[n]=len;n++;}
  for(i=1;i<n;i++){long s=gLS[i],l=gLL[i]; j=i-1; while(j>=0&&CmpLine(in,gLS[j],gLL[j],s,l)>0){gLS[j+1]=gLS[j];gLL[j+1]=gLL[j];j--;} gLS[j+1]=s;gLL[j+1]=l;}
  for(i=0;i<n;i++){BufPutN(out,in+gLS[i],gLL[i]);BufPutC(out,'\n');} return 0; }

static short CmdUniq(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long pos=0,len; const char *ln; const char *prev=0; long plen=-1; (void)argc;(void)argv;
  while((ln=NextLine(in,inLen,&pos,&len))){ short same=(plen==len); if(same){long i; for(i=0;i<len;i++)if(ln[i]!=prev[i]){same=0;break;}} if(!same){BufPutN(out,ln,len);BufPutC(out,'\n');prev=ln;plen=len;} } return 0; }

static short CmdRev(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long pos=0,len; const char *ln; (void)argc;(void)argv;
  while((ln=NextLine(in,inLen,&pos,&len))){long i; for(i=len-1;i>=0;i--)BufPutC(out,ln[i]); BufPutC(out,'\n');} return 0; }

static short CmdNl(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ long pos=0,len; const char *ln; long n=1; (void)argc;(void)argv;
  while((ln=NextLine(in,inLen,&pos,&len))){BufPutS(out,"  ");BufPutLong(out,n++);BufPutS(out,"  ");BufPutN(out,ln,len);BufPutC(out,'\n');} return 0; }

static short ExpandSet(const char *s, char *out, short cap)
{ short n=0; while(*s&&n<cap-1){ if(s[1]=='-'&&s[2]){char a=s[0],b=s[2]; while(a<=b&&n<cap-1)out[n++]=a++; s+=3;} else out[n++]=*s++; } out[n]=0; return n; }
static short CmdTr(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ char s1[128],s2[128]; short n1,n2; long i; if(argc<3){BufPutS(out,"usage: tr SET1 SET2\n");return 0;}
  n1=ExpandSet(argv[1],s1,sizeof(s1)); n2=ExpandSet(argv[2],s2,sizeof(s2));
  for(i=0;i<inLen;i++){char c=in[i]; short k; for(k=0;k<n1;k++)if(s1[k]==c){c=(k<n2)?s2[k]:(n2?s2[n2-1]:c);break;} BufPutC(out,c);} return 0; }

static short CmdDate(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ char d[64]; (void)argc;(void)argv;(void)in;(void)inLen; PxDate(d,sizeof(d)); BufPutS(out,d); BufPutC(out,'\n'); return 0; }
static short CmdMem(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ (void)argc;(void)argv;(void)in;(void)inLen; BufPutS(out,"free memory: "); BufPutLong(out,PxFreeMem()); BufPutS(out," bytes\n"); return 0; }
static short CmdUname(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ (void)argc;(void)argv;(void)in;(void)inLen; BufPutS(out,PX_VERSION " (System 6, Macintosh Plus, m68000)\n"); return 0; }
static short CmdHelp(short argc, char **argv, const char *in, long inLen, PxBuf *out)
{ (void)argc;(void)argv;(void)in;(void)inLen;
  BufPutS(out,PX_VERSION " - a Unix subsystem on the Macintosh Plus.\n");
  BufPutS(out,"programs:  echo cat ls pwd grep wc head tail sort uniq rev nl tr date mem uname\n");
  BufPutS(out,"pipes:     ls / | grep Apps | wc -l\n");
  BufPutS(out,"redirect:  sort < in > out ;  echo hi >> log\n");
  BufPutS(out,"files:     cd <dir>  mkdir <d>  rm <f>  clear\n");
  BufPutS(out,"remote:    mini / rsh [host[:port]]  - INSTANT shell on the mini (raw TCP,\n");
  BufPutS(out,"           trusted LAN, no wait). ESC returns to Plutonix.\n");
  BufPutS(out,"           ssh [user@]host[:port]  - REAL encrypted SSH-2 (curve25519,\n");
  BufPutS(out,"           aes128-ctr; the key exchange takes ~a minute on a 68000).\n");
  BufPutS(out,"           put <local> host:<path> / get host:<path> <local>  - scp file copy\n");
  return 0; }

static const struct { const char *name; CmdFn fn; } gCmds[] = {
    {"echo",CmdEcho},{"cat",CmdCat},{"ls",CmdLs},{"dir",CmdLs},{"pwd",CmdPwd},
    {"grep",CmdGrep},{"wc",CmdWc},{"head",CmdHead},{"tail",CmdTail},
    {"sort",CmdSort},{"uniq",CmdUniq},{"rev",CmdRev},{"nl",CmdNl},{"tr",CmdTr},
    {"date",CmdDate},{"mem",CmdMem},{"free",CmdMem},{"uname",CmdUname},{"help",CmdHelp},
    {0,0}
};
static CmdFn FindCmd(const char *name) { short i; for(i=0;gCmds[i].name;i++) if(SEq(gCmds[i].name,name)) return gCmds[i].fn; return 0; }

/* ===================== shell: tokenize, pipeline, redirection ===================== */
static short Tokenize(char *s, char **argv)
{ short argc=0; char *p=s; while(*p&&argc<PX_MAXARGS){ while(*p==' '||*p=='\t')p++; if(!*p)break;
    if(*p=='"'){p++;argv[argc++]=p; while(*p&&*p!='"')p++; if(*p)*p++=0;}
    else {argv[argc++]=p; while(*p&&*p!=' '&&*p!='\t')p++; if(*p)*p++=0;} } return argc; }

static char gBufA[PX_BUF];
static char gBufB[PX_BUF];
static char gFinal[PX_BUF];

static void RunPipeline(char *(*stages)[PX_MAXARGS], short *argcs, short ns,
                        const char *inFile, PxBuf *final)
{
    const char *inp; long inLen; short s;
    PxBuf loaded; BufInit(&loaded, gBufA, PX_BUF);
    if (inFile) { if (FsReadInto(inFile, &loaded) < 0) { BufPutS(final, "cannot open input file\n"); return; } }
    inp = loaded.p; inLen = loaded.len;
    for (s = 0; s < ns; s++) {
        char **argv = stages[s]; short argc = argcs[s];
        CmdFn fn = argc ? FindCmd(argv[0]) : 0;
        PxBuf ob, *o;
        if (s == ns - 1) o = final;
        else { BufInit(&ob, (s & 1) ? gBufA : gBufB, PX_BUF); o = &ob; }  /* stage0->B, stage1->A,... never reads+writes same buf */
        if (!fn) { BufPutS(final, argc ? argv[0] : ""); BufPutS(final, ": command not found\n"); return; }
        fn(argc, argv, inp, inLen, o);
        inp = o->p; inLen = o->len;
    }
}

/* control commands. Return: 0 handled-normal, 1 ssh, 2 clear, 3 scp,
   4 rsh (instant raw shell), -1 not control */
static short ShControl(short argc, char **argv)
{
    const char *c = argv[0];
    if (SEq(c,"cd"))    { if (FsChdir(argc>1?argv[1]:"/")!=0) PxOutLn("cd: no such directory"); return 0; }
    if (SEq(c,"clear")||SEq(c,"cls")) return 2;
    if (SEq(c,"mkdir")) { if(argc<2)PxOutLn("usage: mkdir <name>"); else if(FsMkdir(argv[1])!=0)PxOutLn("mkdir: failed"); return 0; }
    if (SEq(c,"rm")||SEq(c,"del")) { if(argc<2)PxOutLn("usage: rm <file>"); else if(FsRemove(argv[1])!=0)PxOutLn("rm: failed"); return 0; }
    if (SEq(c,"mini")) { PxSetRemote("admin@192.168.7.50", 2329); return 4; }   /* instant */
    if (SEq(c,"rsh")) {
        /* rsh [host[:port]] — INSTANT trusted-LAN shell (agent-rsh), no crypto,
           no handshake. Bare rsh = the mini. */
        char host[64]; unsigned short port = 2329; short i = 0;
        if (argc < 2) { PxSetRemote("admin@192.168.7.50", 2329); return 4; }
        { const char *a = argv[1];
          while (a[i] && a[i] != ':' && i < 63) { host[i] = a[i]; i++; } host[i] = 0;
          if (a[i] == ':') port = (unsigned short)Atoi(a + i + 1);
          else if (argc >= 3) port = (unsigned short)Atoi(argv[2]); }
        PxSetRemote(host, port);
        return 4;
    }
    if (SEq(c,"ssh")) {
        char host[64]; unsigned short port = 22; short i = 0;
        if (argc < 2) { PxSetRemote("admin@192.168.7.50", 2222); return 1; }   /* bare ssh = the mini */
        { const char *a = argv[1];
          while (a[i] && a[i] != ':' && i < 63) { host[i] = a[i]; i++; } host[i] = 0;
          if (a[i] == ':') port = (unsigned short)Atoi(a + i + 1);
          else if (argc >= 3) port = (unsigned short)Atoi(argv[2]); }
        /* the mini's no-grace SSH server is on 2222, not the system sshd on 22 */
        if (port == 22) { short k; for (k = 0; host[k]; k++) { short j = 0; const char *m = "192.168.7.50"; while (m[j] && host[k+j] == m[j]) j++; if (m[j] == 0) { port = 2222; break; } } }
        PxSetRemote(host, port);
        return 1;
    }
    if (SEq(c,"put") || SEq(c,"get")) {
        /* put <local> [user@]host:<path>   |   get [user@]host:<path> <local> */
        int isGet = SEq(c,"get"); const char *hostarg, *localarg, *colon;
        char host[96], rpath[128]; short i, hn;
        if (argc < 3) { PxOutLn("usage: put <local> host:<path>  |  get host:<path> <local>"); return 0; }
        hostarg = isGet ? argv[1] : argv[2];
        localarg = isGet ? argv[2] : argv[1];
        colon = hostarg; while (*colon && *colon != ':') colon++;
        if (*colon != ':') { PxOutLn("scp: remote must be host:path"); return 0; }
        hn = (short)(colon - hostarg); for (i=0;i<hn&&i<95;i++) host[i]=hostarg[i]; host[i]=0;
        { const char *r = colon+1; for (i=0;r[i]&&i<127;i++) rpath[i]=r[i]; rpath[i]=0; }
        PxSetRemote(host, 22);
        PxSetScp(isGet, localarg, rpath);
        return 3;
    }
    if (SEq(c,"exit")||SEq(c,"logout")) { PxOutLn("(already in the local shell; 'exit' leaves a remote session)"); return 0; }
    return -1;
}

/* Parse + run a full command line. Returns 0 normal, 1 ssh, 2 clear, 3 scp, 4 rsh. */
static short ShRun(char *line)
{
    char *stagev[PX_MAXSTAGES][PX_MAXARGS]; short stagec[PX_MAXSTAGES]; short ns = 0;
    char *segPtr[PX_MAXSTAGES];
    const char *inFile = 0, *outFile = 0; short append = 0;
    char *p = line, *seg = line;
    PxBuf final;

    /* split on '|' */
    for (;; p++) {
        if (*p == '|' || *p == 0) {
            char saved = *p; *p = 0;
            if (ns < PX_MAXSTAGES) segPtr[ns++] = seg;
            if (saved == 0) break;
            seg = p + 1;
        }
    }

    /* tokenize stages, pulling out < > >> redirections */
    { short s, i;
      for (s = 0; s < ns; s++) {
          char *av[PX_MAXARGS]; short ac = Tokenize(segPtr[s], av); short keep = 0;
          for (i = 0; i < ac; i++) {
              if (SEq(av[i],"<")  && i+1<ac) { inFile  = av[++i]; continue; }
              if (SEq(av[i],">")  && i+1<ac) { outFile = av[++i]; append = 0; continue; }
              if (SEq(av[i],">>") && i+1<ac) { outFile = av[++i]; append = 1; continue; }
              stagev[s][keep++] = av[i];
          }
          stagec[s] = keep;
      }
    }

    if (ns == 0 || stagec[0] == 0) return 0;

    /* a lone control command short-circuits */
    if (ns == 1) { short rc = ShControl(stagec[0], stagev[0]); if (rc >= 0) return rc; }

    BufInit(&final, gFinal, PX_BUF);
    RunPipeline(stagev, stagec, ns, inFile, &final);

    if (outFile) { if (FsWriteFrom(outFile, final.p, final.len, append) != 0) PxOutLn("cannot write output file"); }
    else PxOut(final.p);
    return 0;
}
