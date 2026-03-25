# TUNN3L — Tunnel Service for AI Agents

Expose localhost to the internet. One command. No config. HTTP and SSH.

## Quick Start

```bash
# Install
curl -sSf https://tunn3l.sh/install | sh

# Use
tunn3l http 3000
```

Output:
```
tunn3l: tunnel ready
tunn3l: https://a7f3c912.tunn3l.sh → localhost:3000
```

## Commands

### `tunn3l http <port>`

Expose a local HTTP server.

```bash
tunn3l http 3000                          # random subdomain
tunn3l http 3000 --subdomain myapp        # custom subdomain → myapp.tunn3l.sh
tunn3l http 3000 --json                   # JSON output for programmatic use
tunn3l http 8080 --relay wss://custom.relay  # custom relay server
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--subdomain`, `-s` | random 8-char hex | Custom subdomain |
| `--relay`, `-r` | `wss://relay.tunn3l.sh` | Relay server URL |
| `--json` | false | Output JSON instead of human text |
| `--quiet`, `-q` | false | Suppress all output except errors |

**JSON output** (`--json`):
```json
{"url": "https://myapp.tunn3l.sh", "subdomain": "myapp", "relay": "wss://relay.tunn3l.sh", "local": "http://localhost:3000"}
```

### `tunn3l ssh`

Expose local SSH server.

```bash
tunn3l ssh                                # random subdomain
tunn3l ssh --subdomain mybox              # ssh user@mybox.tunn3l.sh
```

### `tunn3l login`

Authenticate with your account.

```bash
tunn3l login --token bk_abc123...         # non-interactive (for agents)
tunn3l login                              # interactive prompt
```

Stores credentials in `~/.tunn3l/config.json`.

### `tunn3l status`

Show active tunnels.

### `tunn3l logout`

Clear stored credentials.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (tunnel closed gracefully) |
| 1 | Authentication error (invalid or expired token) |
| 2 | Connection failed (relay unreachable) |
| 3 | Subdomain taken |
| 4 | Local port not responding |

## Programmatic Usage

```typescript
import { createTunnel } from 'tunn3l'

const tunnel = await createTunnel({
  port: 3000,
  subdomain: 'myapp',    // optional
  relay: 'wss://relay.tunn3l.sh',  // optional
  token: 'bk_abc123',    // optional
})

console.log(tunnel.url)  // https://myapp.tunn3l.sh
tunnel.close()
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TUNN3L_TOKEN` | API token (alternative to `tunn3l login`) |
| `TUNN3L_RELAY` | Relay server URL |
| `TUNN3L_SUBDOMAIN` | Default subdomain |

## Configuration

Config file: `~/.tunn3l/config.json`

```json
{
  "token": "bk_abc123...",
  "relay": "wss://relay.tunn3l.sh",
  "defaultSubdomain": null
}
```

## How It Works

1. The tunn3l client opens an outbound WebSocket connection to the relay server
2. The relay assigns your subdomain (e.g., `abc123.tunn3l.sh`)
3. When someone visits `abc123.tunn3l.sh`, the relay forwards the HTTP request through the WebSocket to your machine
4. Your tunn3l client proxies the request to `localhost:<port>` and sends the response back
5. The connection is outbound-only — works through firewalls and NAT

## Pricing

- **Free trial**: 90 days, no credit card
- **Pro**: $5/month — custom subdomains, SSH tunnels, priority support

## Self-Hosting the Relay

The relay server is open source. Run your own:

```bash
cd apps/tunnel/relay
npm install
npm start
```

Set up wildcard DNS for your domain pointing to the relay server IP.
