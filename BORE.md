# BORE — Tunnel Service for AI Agents

Expose localhost to the internet. One command. No config.

## Quick Start

```bash
# No install needed
npx bore-tunnel http 3000

# Or install globally
npm i -g bore-tunnel
bore http 3000
```

Output:
```
bore: tunnel ready
bore: https://a7f3c912.bore.pub → localhost:3000
```

## Commands

### `bore http <port>`

Expose a local HTTP server.

```bash
bore http 3000                          # random subdomain
bore http 3000 --subdomain myapp        # custom subdomain → myapp.bore.pub
bore http 3000 --json                   # JSON output for programmatic use
bore http 8080 --relay wss://custom.relay  # custom relay server
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--subdomain`, `-s` | random 8-char hex | Custom subdomain |
| `--relay`, `-r` | `wss://relay.bore.pub` | Relay server URL |
| `--json` | false | Output JSON instead of human text |
| `--quiet`, `-q` | false | Suppress all output except errors |

**JSON output** (`--json`):
```json
{"url": "https://myapp.bore.pub", "subdomain": "myapp", "relay": "wss://relay.bore.pub", "local": "http://localhost:3000"}
```

### `bore ssh`

Expose local SSH server.

```bash
bore ssh                                # random subdomain
bore ssh --subdomain mybox              # ssh user@mybox.bore.pub
```

### `bore login`

Authenticate with your account.

```bash
bore login --token bk_abc123...         # non-interactive (for agents)
bore login                              # interactive prompt
```

Stores credentials in `~/.bore/config.json`.

### `bore status`

Show active tunnels.

### `bore logout`

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
import { createTunnel } from 'bore-tunnel'

const tunnel = await createTunnel({
  port: 3000,
  subdomain: 'myapp',    // optional
  relay: 'wss://relay.bore.pub',  // optional
  token: 'bk_abc123',    // optional
})

console.log(tunnel.url)  // https://myapp.bore.pub
tunnel.close()
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BORE_TOKEN` | API token (alternative to `bore login`) |
| `BORE_RELAY` | Relay server URL |
| `BORE_SUBDOMAIN` | Default subdomain |

## Configuration

Config file: `~/.bore/config.json`

```json
{
  "token": "bk_abc123...",
  "relay": "wss://relay.bore.pub",
  "defaultSubdomain": null
}
```

## How It Works

1. The bore client opens an outbound WebSocket connection to the relay server
2. The relay assigns your subdomain (e.g., `abc123.bore.pub`)
3. When someone visits `abc123.bore.pub`, the relay forwards the HTTP request through the WebSocket to your machine
4. Your bore client proxies the request to `localhost:<port>` and sends the response back
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
