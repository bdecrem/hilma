/*
 * wifi.h — the Macinclaude WiFi system service, app-facing API.
 *
 * Apps stop dialing the modem themselves. They call WIFIConnect() once (it
 * reuses an already-live shared link if another app brought it up), then open
 * named channels to mini services and read/write through them. One serial link
 * to the mini multiplexer is shared across every app and survives app quit,
 * because the link state lives in the SYSTEM heap.
 *
 * Drain the link by calling WIFIIdle() from your event loop on null events.
 *
 * This is the client half. The shared state + serial plumbing is in wifi.c.
 */
#ifndef WIFI_H
#define WIFI_H

#include <Types.h>

#define WIFI_MAXCHAN 8

/* Bring the shared link up (idempotent — returns true immediately if it's
 * already connected). Allocates the shared state in the system heap the first
 * time. Returns false if the modem/mux can't be reached. */
Boolean WIFIConnect(void);

/* Is the shared link currently up? */
Boolean WIFIIsConnected(void);

/* Open a logical channel to a named mini service: "echo", "quote", "bridge",
 * "surf", or an explicit "host:port". Returns a channel id (0..WIFI_MAXCHAN-1)
 * or -1 on failure. */
short WIFIOpen(const char *service);

/* Close a channel. */
void WIFIClose(short chan);

/* Send bytes / a CR-terminated line on a channel. */
void WIFISend(short chan, const void *data, long len);
void WIFISendLine(short chan, const char *line);

/* Pump the link: drain the serial port, parse MUX frames, fan incoming bytes
 * into per-channel buffers. Call this often (every event-loop pass). Returns
 * the number of bytes that arrived this call (0 = idle). */
short WIFIIdle(void);

/* Pull up to cap buffered bytes from a channel into buf. Returns the count
 * (0 if nothing waiting). */
short WIFIRead(short chan, void *buf, short cap);

/* Call right before the app quits: releases this app's serial buffer but leaves
 * the link up, so the next app reuses it instead of redialing. */
void WIFIPark(void);

#endif /* WIFI_H */
