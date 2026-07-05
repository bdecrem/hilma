#include <stdio.h>
#include <stdlib.h>
#include "gpt.h"
static void *slurp(const char*p,long*l){FILE*f=fopen(p,"rb");void*b;long n;if(!f){exit(1);}fseek(f,0,SEEK_END);n=ftell(f);fseek(f,0,SEEK_SET);b=malloc(n+1);if(fread(b,1,n,f)!=(size_t)n)exit(1);fclose(f);((char*)b)[n]=0;*l=n;return b;}
int main(int c,char**v){
  long ml,tl,xl; void*m=slurp("./model_q.bin",&ml),*t=slurp("./tok2048.bin",&tl);
  char*txt=slurp(v[1],&xl);
  if(GptInitMem(m,ml,t,tl,0,0,1)!=0){fprintf(stderr,"init fail\n");return 1;}
  printf("%.5f\n", GptEvalText(txt));
  return 0;
}
