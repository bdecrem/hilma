/* Minimal AppleTalk.h stub for MacTCP.h — provides only AddrBlock,
   the one type MacTCP.h references (an unused union field for us). */
#ifndef __APPLETALK__
#define __APPLETALK__
#include <MacTypes.h>
struct AddrBlock {
    UInt16  aNet;
    UInt8   aNode;
    UInt8   aSocket;
};
typedef struct AddrBlock AddrBlock;
#endif
