# 5 Services AI Agents Need — Research & Proposals

## Collaboration Process

**Miny** researched: agent infrastructure gaps, developer pain points, MCP ecosystem gaps, Reddit/HN/GitHub complaints. Delivered initial 5 proposals with supporting data.

**Claudia** researched: Moltbook and the agent social network phenomenon, enterprise agent workflow gaps, framework limitations (CrewAI/AutoGen/LangGraph), MCP security and governance gaps.

**Process:** Miny went first with a broad sweep, Claudia did a second pass from different angles, then we merged. Where we overlapped (agent monitoring, agent identity), we combined the strongest version. Where we diverged, we kept the more buildable option.

---

## Context: What Moltbook Proved

Moltbook (acquired by Meta, March 2026) was a Reddit-style social network for AI agents. 1.5M agents, 17K human owners. Agents autonomously visited every 4 hours to post, comment, and interact. Some acquired phone numbers and called their humans.

**Key insight:** Agents WILL use services built for them. The demand is real. The question is which services are most valuable and most buildable.

## The 5 Proposals

### 1. MCP Proxy — "Cloudflare for Agent Traffic"

**What:** A proxy that sits between agents and any REST API. Auto-generates an MCP server from an OpenAPI spec. Adds rate limit awareness, structured error handling, caching, and retry logic.

**Why:** 76% of APIs aren't agent-ready. Agents hit rate limits, get unstructured errors, and waste tokens retrying. Every agent framework (CrewAI, AutoGen, LangGraph) has this problem — none solve it at the infrastructure level.

**Moat:** Network effects — every API wrapped becomes discoverable. First to build a quality registry wins.

**Build estimate:** 2-3 weeks for core proxy + OpenAPI parser. We already have the WebSocket relay infrastructure from tunn3l.

**Revenue:** Freemium. Free for low-volume, pay per request at scale. Like Cloudflare's model.

---

### 2. Agent Wallet — "Stripe for Agents"

**What:** Managed wallets with budget limits, spending alerts, and x402 protocol support. Human owner sets policy ("max $5/day, only these APIs"), agent spends autonomously.

**Why:** Agents increasingly need to pay for services (API calls, compute, storage). Right now humans pre-pay and agents have no spending autonomy or controls. The x402 payment protocol exists but has no consumer-friendly UX layer.

**Moat:** Trust + compliance. Handling money requires getting it right. First mover with a clean UX wins the default position.

**Build estimate:** 3-4 weeks. Stripe Connect for the payment rails, our own policy engine on top.

**Revenue:** Transaction fees (2-3%) like Stripe.

---

### 3. Agent Health Monitor — "Datadog for Agent Owners"

**What:** Not trace-level debugging (that's solved by LangSmith, Arize, etc). Agent-LEVEL monitoring: is it making progress? Stuck in a loop? Over budget? Producing garbage? Dashboard for human owners who have 5-50 agents running.

**Why:** Every agent framework's default logging is "fine for development and painful beyond that" (direct quote from comparison articles). Moltbook proved people run dozens of agents — they need a way to know if they're healthy without reading logs. The EU AI Act (August 2026) requires comprehensive logging for high-risk AI systems.

**Moat:** Data moat — the more agents monitored, the better the anomaly detection. "Your agent is looping" is easy; "your agent is underperforming compared to similar agents" requires scale.

**Build estimate:** 2 weeks for MVP (webhook-based health pings, dashboard). 6 weeks for anomaly detection.

**Revenue:** SaaS. Free for 3 agents, $10/mo for 50, enterprise pricing above that.

---

### 4. Agent Directory — "DNS for Live Agents"

**What:** Registry where agents declare their capabilities, availability, and trust score. Other agents discover and connect to them. Built on Google's A2A protocol (now at Linux Foundation).

**Why:** Agents need to find other agents. Moltbook was basically this but social. A structured, queryable directory with verified capabilities and uptime tracking is the infrastructure version. Only 24.4% of organizations have visibility into which agents are communicating — a directory solves discovery AND observability.

**Moat:** Network effects — the directory is only valuable if agents are listed. First to reach critical mass wins.

**Build estimate:** 2-3 weeks. We have Supabase for the registry, the A2A protocol spec is public.

**Revenue:** Free to list, pay for premium features (verified badges, priority routing, analytics).

---

### 5. Agent Sandbox — "Persistent E2B"

**What:** Sandboxed execution environments for agents that persist across sessions. Unlike E2B (ephemeral only), these environments maintain state — installed packages, databases, file systems. Agents can return to their workspace.

**Why:** E2B proved the demand for agent sandboxes but they're ephemeral — everything is lost when the session ends. Agents doing multi-day research, building projects, or maintaining services need persistent environments. This is the gap between "coding assistant" and "autonomous worker."

**Moat:** Technical — persistent sandboxes with security isolation is genuinely hard. Snapshotting, hibernation, resource management.

**Build estimate:** 4-6 weeks. Docker/Firecracker for isolation, our DigitalOcean infrastructure for hosting.

**Revenue:** Usage-based. $0.01/hour idle, $0.05/hour active. Like a cheaper, agent-optimized cloud VM.

---

## Ranking by Buildability × Impact

| Rank | Service | Build Time | Impact | Why This Ranking |
|------|---------|-----------|--------|-----------------|
| 1 | MCP Proxy | 2-3 weeks | High | Solves a universal pain point, builds on our existing infra |
| 2 | Agent Health Monitor | 2 weeks | High | Clear need, simple MVP, regulatory tailwind |
| 3 | Agent Directory | 2-3 weeks | Medium-High | Network effects make it winner-take-all, needs momentum |
| 4 | Agent Wallet | 3-4 weeks | High | Big market but payments = complexity + compliance |
| 5 | Agent Sandbox | 4-6 weeks | High | Hardest to build, biggest moat if done right |

## Our Recommendation

**Start with #1 (MCP Proxy) or #2 (Agent Health Monitor).** Both are buildable in 2-3 weeks, solve real problems, and complement tunn3l — they're all "infrastructure for agents" and can share a brand/platform story.
