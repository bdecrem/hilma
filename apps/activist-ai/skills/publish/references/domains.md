# A domain for the site

Two ways. Both end in the Vercel project's **Settings, Domains**, which shows whether the domain
is set up right ("Valid Configuration") and makes the https certificate by itself.

## 1. Buy it in Vercel (the simplest)

1. In the Vercel project: **Settings**, **Domains**, **Add Domain**, type the name. If it is free
   to buy, Vercel offers **Buy** with the price for a year.
2. Pay. Vercel registers it, adds it to the project and sets its DNS. Nothing else to do.
3. Run `publish.py dns <domain> --wait 600`: usually live in a few minutes.

Add `www.<domain>` too (Add Domain again); Vercel offers to redirect one to the other.

## 2. Attach a domain bought elsewhere

First, in the Vercel project: **Settings**, **Domains**, **Add Domain**, type the domain (and
again for `www.<domain>`). Vercel then shows the records it wants. **Use the values Vercel shows**:
they are usually the ones below, but Vercel may give a project its own.

| Name (Host) | Type | Value |
|---|---|---|
| `@` (the domain itself) | A | `76.76.21.21` |
| `www` | CNAME | `cname.vercel-dns.com` |

### At Namecheap

1. Sign in, **Domain List**, **Manage** beside the domain.
2. Under **Nameservers**, keep **Namecheap BasicDNS** (if it says Custom DNS, the records go wherever
   those nameservers are).
3. **Advanced DNS** tab. Delete the parking records Namecheap put there: the `CNAME www` to
   `parkingpage.namecheap.com` and the `URL Redirect` for `@`.
4. **Add New Record**: type **A Record**, Host `@`, Value `76.76.21.21`, TTL Automatic. Save (the
   green tick).
5. **Add New Record**: **CNAME Record**, Host `www`, Value `cname.vercel-dns.com.`, TTL Automatic. Save.

### At Cloudflare

1. Sign in, choose the domain, **DNS**, **Records**.
2. Remove any older A, AAAA or CNAME records for `@` and `www`.
3. **Add record**: Type `A`, Name `@`, IPv4 address `76.76.21.21`, Proxy status **DNS only** (the
   grey cloud, not orange). Save.
4. **Add record**: Type `CNAME`, Name `www`, Target `cname.vercel-dns.com`, **DNS only**. Save.

The grey cloud matters: with Cloudflare's proxy on (orange), Vercel cannot make the certificate and
the two fight over https. If the person wants Cloudflare's proxy, that is a later, separate change.

## Is it live?

```bash
python3 /opt/ola/skills/publish/scripts/publish.py dns <domain> --wait 600
```

- `live`: the domain points at Vercel and `https://<domain>/` answers. Tell the person, with the link.
- `not yet … does not point at Vercel`: the records are not in, not saved, or not out yet. Usually
  minutes; up to an hour; rarely a day for a brand-new domain. Check the records with the person
  once, then wait.
- `almost … answered nothing yet`: the records are right; Vercel is making the certificate. A few
  minutes.

A domain renews every year; tell the person it is theirs to renew (both Vercel and Namecheap can
renew it automatically).
