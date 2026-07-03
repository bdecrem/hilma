# Installing the apps

You can put these apps on your Mac two ways: copy them onto the BlueSCSI SD card
(works for any app, no network needed), or — once The Bridge is installed —
deliver them over the network with no card shuffling.

Classic Mac apps keep their code in the file's **resource fork**, so you can't
just drag a `.bin` onto an HFS volume with a normal copy — you'd lose the fork.
Use MacBinary-aware tools, as below.

## Option A — onto the BlueSCSI SD card (with `hfsutils`)

You need a built app (`AppName.bin`, a MacBinary file — see [BUILDING.md](BUILDING.md),
or grab a release) and [`hfsutils`](https://www.mars.org/home/rob/proj/hfs/)
(`brew install hfsutils`).

```bash
# Work on a local copy of the card's boot image (never edit the card in place).
cp "/Volumes/YOUR_SD/DiskImage.hda" work.hda

hmount work.hda                     # mount the HFS volume (auto-detects the partition)
hcd ":Apps"                         # into wherever you keep apps
hcopy -m AppName.bin ":App Name"    # -m = MacBinary: writes both forks + type/creator
hls -l                              # verify it's there with an APPL type + a resource fork
humount

cp work.hda "/Volumes/YOUR_SD/DiskImage.hda"   # back to the card, SAME filename
sync                                # then eject the card safely
```

Move the card back to the Mac and the app appears in the Finder. The included
`tools/lsrsrc.py` lists a file's resource types (sanity-check a built app), and
`tools/macbin.py` encodes a native-macOS file that carries its resource fork in
an xattr into a `.bin` for `hcopy -m`.

## Option B — over the network (The Bridge)

Once **The Bridge** app is on your Mac and running, you never touch the SD card
again for updates:

1. Run the Bridge agent on your modern Mac (`agent-bridge/`, see
   [RUNNING-THE-BACKEND.md](RUNNING-THE-BACKEND.md)). It watches an outbox folder.
2. Drop a built `AppName.bin` into that outbox.
3. On the Plus, open **The Bridge** app. It streams the app over the network and
   writes it to the boot disk, **overwriting the existing copy in place** (a
   temp file is renamed in only after its checksum verifies, so a dropped
   transfer never clobbers a working app).
4. Relaunch the app to run the new version.

The Bridge app itself is the one exception — it can't overwrite itself while
running, so update *it* via the SD card (Option A).

## Verifying an install

`hls -l` after `hcopy` should show your app with a four-char creator/type of
`APPL/...` and a non-zero resource fork. If an app launches to a blank window or
crashes immediately, the resource fork almost certainly didn't survive the copy
— re-copy with `hcopy -m` (MacBinary mode), not a plain drag.
