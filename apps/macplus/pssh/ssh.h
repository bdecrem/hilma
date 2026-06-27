/*
 * ssh.h — a tiny SSH-2 client core, portable C (host + 68k Macintosh).
 *
 * Implements just enough real SSH to open an interactive shell on a real
 * OpenSSH server:
 *   - transport: version exchange, binary packets, aes128-ctr + hmac-sha2-256
 *   - kex:       curve25519-sha256 (X25519), exchange hash + key derivation
 *   - auth:      password
 *   - channel:   session + pty-req + shell
 *
 * The expensive public-key steps are RESUMABLE: ssh_pump() runs them in slices
 * so a 7.8MHz 68000 can grind the handshake without freezing — the host event
 * loop keeps drawing a progress bar and stays responsive. There are three such
 * phases: our X25519 ephemeral key, the X25519 shared secret, and the Ed25519
 * host-key signature verification.
 *
 * Host-key verification: the server's Ed25519 signature over the exchange hash
 * is cryptographically verified, then the io.check_host callback decides trust
 * (trust-on-first-use). A bad signature or a changed key aborts the connection.
 */
#ifndef PSSH_SSH_H
#define PSSH_SSH_H
#include <stdint.h>
#include <stddef.h>

typedef struct ssh_client ssh_client;

typedef struct {
    int  (*send)(void *user, const uint8_t *data, size_t len);     /* -> socket; return len or <0 */
    void (*on_data)(void *user, const uint8_t *data, size_t len);  /* decrypted shell output */
    void (*on_status)(void *user, const char *msg);               /* human-readable progress/errors */
    void (*get_random)(void *user, uint8_t *out, size_t len);     /* entropy source */
    /* host-key trust (called after the server's signature is cryptographically
       verified). Return 1 = known & matches, 0 = unknown -> accept & remember
       (trust-on-first-use), -1 = KNOWN BUT CHANGED -> reject (possible MITM).
       May be NULL to skip the trust check (signature is still verified). */
    int  (*check_host)(void *user, const uint8_t hostkey[32]);
    void *user;
} ssh_io;

/* user/password point to caller-owned storage that outlives the client. */
ssh_client *ssh_new(const ssh_io *io, const char *user, const char *password);
void        ssh_free(ssh_client *c);

/* Optional: provide an Ed25519 private key (32-byte seed) for public-key auth.
   If set, the client tries the key first and falls back to the password. */
void        ssh_set_identity(ssh_client *c, const uint8_t seed[32]);

/* Optional: run a single command instead of an interactive shell (used for scp).
   Must be called before the channel opens (i.e. right after ssh_new). */
void        ssh_set_exec(ssh_client *c, const char *cmd);

/* feed bytes that arrived from the socket */
void ssh_feed(ssh_client *c, const uint8_t *data, size_t len);

/* advance the state machine. `ladder_steps` caps how many X25519 ladder bits to
   grind this call (e.g. 8 on a Plus for a smooth UI, 255 on a fast host).
   returns: 0 = still working, 1 = shell is ready, <0 = error/closed. */
int  ssh_pump(ssh_client *c, int ladder_steps);

/* 0..255: X25519 ladder progress, for a progress bar */
int  ssh_kex_progress(ssh_client *c);

/* once connected (pump returned 1): send keystrokes to the remote shell */
int  ssh_send_data(ssh_client *c, const uint8_t *data, size_t len);

/* last human-readable error, or "" */
const char *ssh_error(ssh_client *c);

#endif
