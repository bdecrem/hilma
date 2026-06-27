/*
 * nettcp.h — minimal synchronous MacTCP client for the Macintosh Plus.
 *
 * This is the shared TCP transport for the WiFi-era Plus apps. It replaces the
 * RetroWiFi-SI serial-modem path: instead of dialing a Hayes modem and talking
 * to the mini multiplexer over RS-422, we open a real TCP socket through the
 * BlueSCSI DaynaPORT (Ethernet emulation) + MacTCP.
 *
 * Everything here is SYNCHRONOUS (PBControlSync). On a 68000 a bulk transfer
 * blocks the machine for a few seconds; that is fine for these single-shot
 * request/response apps. Draw a "working" status BEFORE calling, since no events
 * are processed while a call is in flight.
 *
 * Connect by IP literal only — no DNS resolver (dnr.c) is pulled in. The mini is
 * 192.168.7.50 on the LAN; NetParseIP() turns a dotted quad into an ip_addr.
 */
#ifndef NETTCP_H
#define NETTCP_H

#include <MacTypes.h>

typedef struct NetConn {
	unsigned long	stream;		/* MacTCP StreamPtr (0 = none)            */
	Ptr				rcvBuff;	/* MacTCP-owned receive ring (we allocate) */
	unsigned long	rcvBuffLen;
	short			isOpen;		/* 1 once ActiveOpen succeeds              */
} NetConn;

/* Open the MacTCP driver (.IPP). Idempotent — safe to call repeatedly.
   Returns noErr, or an OSErr if MacTCP/DaynaPORT isn't installed. */
OSErr NetInit(void);

/* Build an ip_addr (host byte order, as MacTCP wants) from "a.b.c.d".
   Returns 0 on a malformed string. */
unsigned long NetParseIP(const char *dotted);

/* Create a stream and actively open a connection to host:port.
   Blocks until connected or the open times out (~20s). */
OSErr NetConnect(NetConn *c, unsigned long host, unsigned short port);

/* Non-blocking poll: bytes currently waiting to be read (won't block).
   Returns >=0 unread bytes, or -1 if the connection is gone. Use this to drive
   a progressive/event-loop receive (read only what's already arrived). */
long NetAvailable(NetConn *c);

/* Receive up to maxlen bytes into buf, waiting up to timeoutSecs for data.
   Returns: >0 = bytes received; 0 = peer closed OR timed out (no more data);
            <0 = (-OSErr) on a real error. Loop until <=0 for a bulk read. */
long NetRecv(NetConn *c, void *buf, unsigned short maxlen, unsigned char timeoutSecs);

/* Send len bytes (pushed immediately). Blocks until acked or timeout. */
OSErr NetSend(NetConn *c, const void *buf, unsigned short len);

/* Graceful close + release the stream + free the receive buffer.
   Safe to call on a half-open / never-opened NetConn. */
void NetClose(NetConn *c);

/* Human-readable string for the MacTCP error codes these apps actually hit. */
const char *NetErrStr(OSErr e);

#endif /* NETTCP_H */
