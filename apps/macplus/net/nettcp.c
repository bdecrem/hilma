/*
 * nettcp.c — minimal synchronous MacTCP client. See nettcp.h.
 */
#include <Devices.h>
#include <Memory.h>
#include <MacTCP.h>
#include "nettcp.h"

#define IPP_RCVBUF_LEN	16384UL		/* MacTCP wants >= 4*MTU; 16K is comfortable */

static short	gIPPRefNum = 0;
static Boolean	gDriverOpen = false;

OSErr NetInit(void)
{
	OSErr err;
	if (gDriverOpen)
		return noErr;
	err = OpenDriver("\p.IPP", &gIPPRefNum);
	if (err == noErr)
		gDriverOpen = true;
	return err;
}

unsigned long NetParseIP(const char *dotted)
{
	unsigned long ip = 0;
	int part = 0, ndigits = 0, octets = 0;
	const char *p = dotted;
	for (;; p++) {
		if (*p >= '0' && *p <= '9') {
			part = part * 10 + (*p - '0');
			ndigits++;
			if (part > 255) return 0;
		} else if (*p == '.' || *p == '\0') {
			if (ndigits == 0) return 0;
			ip = (ip << 8) | (unsigned long)part;
			octets++;
			part = 0; ndigits = 0;
			if (*p == '\0') break;
		} else {
			return 0;
		}
	}
	if (octets != 4) return 0;
	return ip;
}

OSErr NetConnect(NetConn *c, unsigned long host, unsigned short port)
{
	TCPiopb pb;
	OSErr err;

	c->stream = 0;
	c->rcvBuff = nil;
	c->rcvBuffLen = 0;
	c->isOpen = 0;

	err = NetInit();
	if (err != noErr)
		return err;

	c->rcvBuff = NewPtr(IPP_RCVBUF_LEN);
	if (c->rcvBuff == nil)
		return MemError();
	c->rcvBuffLen = IPP_RCVBUF_LEN;

	/* TCPCreate — register the receive buffer, get a stream */
	pb.ioCRefNum = gIPPRefNum;
	pb.csCode = TCPCreate;
	pb.csParam.create.rcvBuff = c->rcvBuff;
	pb.csParam.create.rcvBuffLen = c->rcvBuffLen;
	pb.csParam.create.notifyProc = nil;
	pb.csParam.create.userDataPtr = nil;
	err = PBControlSync((ParmBlkPtr)&pb);
	if (err != noErr) {
		DisposePtr(c->rcvBuff);
		c->rcvBuff = nil;
		return err;
	}
	c->stream = pb.tcpStream;

	/* TCPActiveOpen — connect to host:port */
	pb.ioCRefNum = gIPPRefNum;
	pb.csCode = TCPActiveOpen;
	pb.tcpStream = c->stream;
	pb.csParam.open.ulpTimeoutValue = 20;	/* seconds */
	pb.csParam.open.ulpTimeoutAction = 1;	/* abort on timeout */
	pb.csParam.open.validityFlags = 0xC0;	/* timeoutValue + timeoutAction valid */
	pb.csParam.open.commandTimeoutValue = 0;
	pb.csParam.open.remoteHost = host;
	pb.csParam.open.remotePort = port;
	pb.csParam.open.localHost = 0;
	pb.csParam.open.localPort = 0;
	pb.csParam.open.tosFlags = 0;
	pb.csParam.open.precedence = 0;
	pb.csParam.open.dontFrag = 0;
	pb.csParam.open.timeToLive = 0;
	pb.csParam.open.security = 0;
	pb.csParam.open.optionCnt = 0;
	pb.csParam.open.userDataPtr = nil;
	err = PBControlSync((ParmBlkPtr)&pb);
	if (err != noErr) {
		/* release the stream we created */
		pb.ioCRefNum = gIPPRefNum;
		pb.csCode = TCPRelease;
		pb.tcpStream = c->stream;
		(void)PBControlSync((ParmBlkPtr)&pb);
		DisposePtr(c->rcvBuff);
		c->rcvBuff = nil;
		c->stream = 0;
		return err;
	}

	c->isOpen = 1;
	return noErr;
}

long NetAvailable(NetConn *c)
{
	TCPiopb pb;
	OSErr err;

	if (!c->isOpen)
		return -1;

	pb.ioCRefNum = gIPPRefNum;
	pb.csCode = TCPStatus;
	pb.tcpStream = c->stream;
	pb.csParam.status.userDataPtr = nil;
	err = PBControlSync((ParmBlkPtr)&pb);
	if (err != noErr)
		return -1;					/* connection gone */
	return (long)pb.csParam.status.amtUnreadData;
}

long NetRecv(NetConn *c, void *buf, unsigned short maxlen, unsigned char timeoutSecs)
{
	TCPiopb pb;
	OSErr err;

	if (!c->isOpen)
		return -1;

	pb.ioCRefNum = gIPPRefNum;
	pb.csCode = TCPRcv;
	pb.tcpStream = c->stream;
	pb.csParam.receive.commandTimeoutValue = (SInt8)timeoutSecs;
	pb.csParam.receive.rcvBuff = (Ptr)buf;
	pb.csParam.receive.rcvBuffLen = maxlen;
	pb.csParam.receive.userDataPtr = nil;
	err = PBControlSync((ParmBlkPtr)&pb);

	if (err == noErr)
		return (long)pb.csParam.receive.rcvBuffLen;	/* bytes actually received */

	/* peer closed, or nothing more arrived in time → "no more data" */
	if (err == connectionClosing || err == connectionTerminated ||
		err == commandTimeout || err == connectionDoesntExist)
		return 0;

	return -(long)err;
}

OSErr NetSend(NetConn *c, const void *buf, unsigned short len)
{
	TCPiopb pb;
	struct { unsigned short length; Ptr ptr; unsigned short term; } wds;

	if (!c->isOpen)
		return connectionDoesntExist;

	/* one-entry write-data structure, zero-terminated */
	wds.length = len;
	wds.ptr = (Ptr)buf;
	wds.term = 0;

	pb.ioCRefNum = gIPPRefNum;
	pb.csCode = TCPSend;
	pb.tcpStream = c->stream;
	pb.csParam.send.ulpTimeoutValue = 20;
	pb.csParam.send.ulpTimeoutAction = 1;
	pb.csParam.send.validityFlags = 0xC0;
	pb.csParam.send.pushFlag = 1;
	pb.csParam.send.urgentFlag = 0;
	pb.csParam.send.wdsPtr = (Ptr)&wds;
	pb.csParam.send.userDataPtr = nil;
	return PBControlSync((ParmBlkPtr)&pb);
}

void NetClose(NetConn *c)
{
	TCPiopb pb;

	if (c->stream != 0) {
		if (c->isOpen) {
			pb.ioCRefNum = gIPPRefNum;
			pb.csCode = TCPClose;
			pb.tcpStream = c->stream;
			pb.csParam.close.ulpTimeoutValue = 5;
			pb.csParam.close.ulpTimeoutAction = 1;
			pb.csParam.close.validityFlags = 0xC0;
			pb.csParam.close.userDataPtr = nil;
			(void)PBControlSync((ParmBlkPtr)&pb);
		}
		pb.ioCRefNum = gIPPRefNum;
		pb.csCode = TCPRelease;
		pb.tcpStream = c->stream;
		(void)PBControlSync((ParmBlkPtr)&pb);
		c->stream = 0;
	}
	if (c->rcvBuff != nil) {
		DisposePtr(c->rcvBuff);
		c->rcvBuff = nil;
	}
	c->isOpen = 0;
}

const char *NetErrStr(OSErr e)
{
	switch (e) {
		case noErr:					return "OK";
		case openFailed:			return "connection refused";
		case commandTimeout:		return "timed out";
		case connectionDoesntExist:	return "no connection";
		case connectionClosing:		return "connection closing";
		case connectionTerminated:	return "connection dropped";
		case invalidStreamPtr:		return "bad stream";
		case -23000:				return "MacTCP busy";
		default:					return "network error";
	}
}
