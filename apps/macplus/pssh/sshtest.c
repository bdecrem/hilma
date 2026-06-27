/* sshtest.c — host integration test: drive the SSH client against a real server.
 *   cc -O2 -o /tmp/sshtest ssh.c sha256.c aes128.c x25519.c sshtest.c
 *   /tmp/sshtest <host> <port> <user> <password> [command]
 * Exit 0 if it connected and (if a command/expect was given) saw the expected
 * text. With no command it just reports how far the handshake got. */
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

static int g_sock;
static char g_out[1 << 16]; static int g_outn;
static char g_last_status[128];

static int g_reject_host = 0;   /* set via env to simulate a changed/untrusted key */
static int io_check_host(void *u, const uint8_t key[32]) {
    (void)u;
    fprintf(stderr, "[ssh] host key fingerprint: %02x%02x%02x%02x...%02x%02x\n",
            key[0],key[1],key[2],key[3],key[30],key[31]);
    return g_reject_host ? -1 : 0;   /* -1 = changed (reject), 0 = TOFU accept */
}
static int io_send(void *u, const uint8_t *d, size_t n) { (void)u; return (int)write(g_sock, d, n); }
static void io_data(void *u, const uint8_t *d, size_t n) { (void)u; fwrite(d, 1, n, stdout); fflush(stdout); if (g_outn + (int)n < (int)sizeof(g_out)) { memcpy(g_out + g_outn, d, n); g_outn += n; } }
static void io_status(void *u, const char *m) { (void)u; strncpy(g_last_status, m, sizeof(g_last_status)-1); fprintf(stderr, "[ssh] %s\n", m); }
static void io_rand(void *u, uint8_t *o, size_t n) { (void)u; FILE *f = fopen("/dev/urandom", "rb"); if (f){ if(fread(o,1,n,f)!=n){} fclose(f);} }

int main(int argc, char **argv) {
    const char *host, *user, *pass, *cmd = 0;
    int port; struct sockaddr_in sa; ssh_io io; ssh_client *c;
    time_t t0; int sent_cmd = 0; time_t connected_at = 0;
    if (argc < 5) { fprintf(stderr, "usage: %s host port user password [command]\n", argv[0]); return 2; }
    host = argv[1]; port = atoi(argv[2]); user = argv[3]; pass = argv[4]; if (argc > 5) cmd = argv[5];

    g_sock = socket(AF_INET, SOCK_STREAM, 0);
    memset(&sa, 0, sizeof(sa)); sa.sin_family = AF_INET; sa.sin_port = htons(port);
    if (inet_pton(AF_INET, host, &sa.sin_addr) != 1) { fprintf(stderr, "bad host\n"); return 2; }
    if (connect(g_sock, (struct sockaddr*)&sa, sizeof(sa)) != 0) { perror("connect"); return 2; }
    fcntl(g_sock, F_SETFL, O_NONBLOCK);

    g_reject_host = (getenv("PSSH_REJECT_HOSTKEY") != 0);
    io.send = io_send; io.on_data = io_data; io.on_status = io_status; io.get_random = io_rand;
    io.check_host = io_check_host; io.user = 0;
    c = ssh_new(&io, user, pass);
    t0 = time(0);

    for (;;) {
        uint8_t buf[4096]; int r, st;
        r = (int)read(g_sock, buf, sizeof(buf));
        if (r > 0) ssh_feed(c, buf, r);
        else if (r == 0) { fprintf(stderr, "socket closed\n"); break; }
        st = ssh_pump(c, 4096);                      /* host is fast: big slices */
        if (st < 0) { fprintf(stderr, "SSH error: %s\n", ssh_error(c)); ssh_free(c); return 1; }
        if (st == 1) {
            if (!sent_cmd) {
                if (cmd) { char line[256]; snprintf(line, sizeof(line), "%s\n", cmd); ssh_send_data(c, (uint8_t*)line, strlen(line)); }
                sent_cmd = 1; connected_at = time(0);
                if (!cmd) { fprintf(stderr, "\nCONNECTED (shell ready). no command given.\n"); ssh_free(c); return 0; }
            }
            if (connected_at && time(0) - connected_at >= 3) {       /* gave it 3s of output */
                int ok = cmd ? (strstr(g_out, "mac") != 0) : 1;       /* whoami -> mac */
                fprintf(stderr, "\n--- result: %s ---\n", ok ? "PASS (saw expected output)" : "FAIL (expected text not seen)");
                ssh_free(c); return ok ? 0 : 1;
            }
        }
        if (time(0) - t0 > 30) { fprintf(stderr, "timeout. last status: %s\n", g_last_status); ssh_free(c); return 1; }
        usleep(2000);
    }
    ssh_free(c); return 1;
}
