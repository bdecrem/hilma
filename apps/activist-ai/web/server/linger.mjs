// Refusing a request whose body is still arriving (too large, signed out, a cap reached), so that
// the client reads the answer.
//
// Closing the socket as soon as the answer is written (what the front desk did for the review's M2)
// leaves the body's remaining bytes unread: the kernel answers them with a reset, and a reset
// often makes the client's TCP throw away the answer it had already received. The client then saw
// "connection reset" instead of the 413 and its message; the front desk's check failed about half
// the time on the staging mini. So, the usual lingering close: the whole answer with
// `Connection: close`, our FIN after it, then read and drop what the client is still sending, and
// close once it has stopped (its FIN), after LINGER_MS, or after LINGER_BYTES, whichever is first.
// The bounds keep M2 fixed: a refused sender holds the socket at most LINGER_MS and makes us read
// at most LINGER_BYTES more.
//
// The same file is used by the front desk (../../frontdesk/server.mjs) and the opencode door
// (./proxy.mjs); the gateway (../../gateway/server.mjs) keeps its own copy, it imports nothing.

export const LINGER_MS = 3_000
export const LINGER_BYTES = 8 * 1024 * 1024

/**
 * Call before the answer is written. Marks the answer `Connection: close` and makes the socket
 * close the lingering way once Node has sent it. Requests that arrive behind it on the same
 * connection are not answered (`lingering(req)` is true for them; the handler destroys the socket).
 */
export function closeAfter(req, res, { ms = LINGER_MS, bytes = LINGER_BYTES } = {}) {
  const sock = req.socket
  res.setHeader('connection', 'close')
  if (!sock || sock.olaLinger) return
  sock.olaLinger = true
  // Node ends a `Connection: close` answer with socket.destroySoon(): FIN, then destroy as soon as
  // the FIN is out, with the body still arriving. This one waits, within the bounds.
  sock.destroySoon = function lingerSoon() {
    if (this.destroyed) return
    const start = this.bytesRead
    const stop = () => this.destroy()
    const timer = setTimeout(stop, ms)
    // The HTTP parser reads the socket natively (no 'data' events), so the bytes are counted.
    const count = setInterval(() => this.bytesRead - start > bytes && stop(), 25)
    timer.unref()
    count.unref()
    this.once('close', () => (clearTimeout(timer), clearInterval(count)))
    this.once('end', stop)
    this.end()
    // Whatever is still coming for this request is read and dropped.
    if (!req.complete) req.resume()
  }
}

/** True for a request that arrived on a connection already refused and closing. */
export const lingering = (req) => req.socket?.olaLinger === true

/**
 * Reads a request body of at most max bytes: the body, or null when it is larger (or the request
 * failed). On null the rest is left unread, not destroyed (a destroyed request takes its socket
 * with it, and the refusal never reaches the client); answer it with closeAfter.
 */
export const readUpTo = (req, max) =>
  new Promise((resolve) => {
    const chunks = []
    let size = 0
    const done = (v) => {
      req.off('data', onData).off('end', onEnd).off('error', onError).off('close', onError)
      if (v === null) req.pause()
      resolve(v)
    }
    const onData = (c) => {
      size += c.length
      if (size > max) return done(null)
      chunks.push(c)
    }
    const onEnd = () => done(Buffer.concat(chunks))
    const onError = () => done(null)
    req.on('data', onData).on('end', onEnd).on('error', onError).on('close', onError)
  })
