# Moving the Mac Plus + Mac mini to Stanford (2026-08-31)

Bart's office at Stanford becomes the home of the Plus (his dedicated Dodo
machine) and the Mac mini that bridges it.

## What the mini does — and what it needs

- **For the Plus:** runs every `agent-*` service (Dodo :2339, Bridge, diag,
  screen, rsh, …). The Plus, the BlueSCSI (DaynaPORT Wi-Fi) and the RetroWiFi SI
  modem all find the mini at **192.168.7.50**, hard-coded in the apps, on the
  **home Wi-Fi SSID/password** saved in the BlueSCSI and the modem. Neither of
  those can do enterprise (802.1X) Wi-Fi.
- **For feynd.cc:** iMessage sends (BlueBubbles + `agent-imsghttp` :2340) and the
  YouTube fetch proxy (:3000), reached through **outbound tunn3l tunnels**
  (`sh.tunn3l.bart-mini`, `imsg-mini`, `f2-mini` → wss://relay.tunn3l.sh). Needs
  only outbound internet on 443 — works from any network with that.

## Stanford network facts (checked 2026-08-30)

- **Stanford** SSID / wired jacks: device MAC must be registered in NetDB (SUNet
  ID). Full internet, Stanford IP space.
- **eduroam**: 802.1X with SUNet ID — fine for the mini, impossible for the
  BlueSCSI/modem.
- **Stanford Visitor**: captive portal, 12-hour sessions, limited ports/bandwidth
  — not usable for the mini's always-on services.
- Personal routers/APs: School of Medicine bans them; general campus pages only
  require NetDB registration. **Ask the building's IT contact first.**

## Recommended setup

1. **Travel router** (GL.iNet or a spare home router). Wi-Fi = the exact home
   SSID/password; LAN = 192.168.7.0/24; DHCP reservation mini → 192.168.7.50.
   Nothing on the Plus, BlueSCSI, modem, or mini changes.
2. Router WAN → office Ethernet jack; register the router's WAN MAC in NetDB. No
   jack: router as Wi-Fi client on the "Stanford" SSID (register that MAC).
3. **Tailscale** on the mini + the iMac so deploys/debugging (`ssh admin@…`,
   `update.sh`, logs) keep working from home — today they are LAN-only.
4. Mini: auto-login on, never sleep, wired power. tunn3l LaunchAgents restart on
   their own.

Fallback if a router isn't allowed: register the BlueSCSI and RetroWiFi MACs on
the "Stanford" SSID and rebuild every Plus app for the mini's campus IP
(`DODO_IP` etc. — grep `192.168.7.50` in apps/macplus).

Sources: https://uit.stanford.edu/service/wirelessnet ·
https://uit.stanford.edu/service/wirelessnet/access ·
https://uit.stanford.edu/service/registration ·
https://med.stanford.edu/irt/personal-computing/network-access/policies.html
