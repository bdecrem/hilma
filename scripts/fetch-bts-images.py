#!/usr/bin/env python3
"""Fetch BTS member photos from Wikimedia Commons into public/bts/<slug>/.

Photos come pre-labeled by member (Commons category), so no manual identification.
Excludes group shots (filename mentions another member) and non-photo items.
Writes public/bts/manifest.json used by the quiz page.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "hilma-bts-quiz/1.0 (personal project)"}
ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "bts")
PER_MEMBER = 24
THUMB_WIDTH = 800

MEMBERS = [
    {"slug": "rm",       "name": "RM",       "cat": "Category:RM"},
    {"slug": "jin",      "name": "Jin",      "cat": "Category:Jin (vocalist)"},
    {"slug": "suga",     "name": "Suga",     "cat": "Category:Suga"},
    {"slug": "jhope",    "name": "J-Hope",   "cat": "Category:J-Hope"},
    {"slug": "jimin",    "name": "Jimin",    "cat": "Category:Jimin"},
    {"slug": "v",        "name": "V",        "cat": "Category:V (vocalist)"},
    {"slug": "jungkook", "name": "Jungkook", "cat": "Category:Jung Kook"},
]

# tokens that mean "this file is probably not a clean solo photo of the member"
BAD = re.compile(
    r"autograph|signature|logo|drawing|sketch|fan\s?art|fanart|cartoon|mural|graffiti|"
    r"doll|figurine|figure|cake|album|lightstick|light stick|billboard|advert|poster|"
    r"exhibition|store|cup ?sleeve|banner|handprint|wax|statue|birthday ?ad|메뉴|"
    r"merch|goods|photocard|standee|cutout|display|subway|bus |screen|projection",
    re.I,
)
# other-member name tokens (to drop group shots from a member's category)
OTHER_NAMES = {
    "rm": r"\bjin\b|suga|j-?hope|jimin|\bv\b|jung\s?kook|jungkook|taehyung|seokjin|yoongi|hoseok",
    "jin": r"\brm\b|rap\s?monster|suga|j-?hope|jimin|jung\s?kook|jungkook|taehyung|yoongi|hoseok|namjoon",
    "suga": r"\brm\b|rap\s?monster|\bjin\b|j-?hope|jimin|jung\s?kook|jungkook|taehyung|seokjin|hoseok|namjoon",
    "jhope": r"\brm\b|rap\s?monster|\bjin\b|suga|jimin|jung\s?kook|jungkook|taehyung|seokjin|yoongi|namjoon",
    "jimin": r"\brm\b|rap\s?monster|\bjin\b|suga|j-?hope|jung\s?kook|jungkook|taehyung|seokjin|yoongi|hoseok|namjoon",
    "v": r"\brm\b|rap\s?monster|\bjin\b|suga|j-?hope|jimin|jung\s?kook|jungkook|seokjin|yoongi|hoseok|namjoon",
    "jungkook": r"\brm\b|rap\s?monster|\bjin\b|suga|j-?hope|jimin|taehyung|seokjin|yoongi|hoseok|namjoon",
}


def api(params):
    params = dict(params, format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(6):
        try:
            time.sleep(1.0)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 10 * (attempt + 1)
                print(f"   429, waiting {wait}s")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("too many 429s")


def category_files(cat, depth=2, seen=None):
    """All file titles in cat and subcats up to depth."""
    if seen is None:
        seen = set()
    files, subcats = [], []
    cont = {}
    while True:
        data = api({
            "action": "query", "list": "categorymembers", "cmtitle": cat,
            "cmtype": "file|subcat", "cmlimit": "500", **cont,
        })
        for m in data["query"]["categorymembers"]:
            if m["ns"] == 6:
                files.append(m["title"])
            elif m["ns"] == 14:
                subcats.append(m["title"])
        cont = data.get("continue", {})
        if not cont:
            break
    if depth > 0:
        for sc in subcats:
            if sc in seen or re.search(r"signature|autograph|artwork|drawing", sc, re.I):
                continue
            seen.add(sc)
            files.extend(category_files(sc, depth - 1, seen))
    return files


def thumb_urls(titles):
    """title -> thumb url (batch of <=50)."""
    out = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        data = api({
            "action": "query", "titles": "|".join(batch),
            "prop": "imageinfo", "iiprop": "url|size|mime",
            "iiurlwidth": str(THUMB_WIDTH),
        })
        for page in data["query"]["pages"].values():
            ii = (page.get("imageinfo") or [None])[0]
            if not ii:
                continue
            if ii.get("mime") not in ("image/jpeg", "image/png"):
                continue
            if ii.get("width", 0) < 400 or ii.get("height", 0) < 400:
                continue
            out[page["title"]] = ii.get("thumburl") or ii["url"]
        time.sleep(0.3)
    return out


def main():
    manifest = {"members": [], "images": []}
    for m in MEMBERS:
        outdir = os.path.join(ROOT, m["slug"])
        existing = len(os.listdir(outdir)) if os.path.isdir(outdir) else 0
        if existing >= 10:
            print(f"== {m['name']}: {existing} already on disk, skipping")
            manifest["members"].append({"slug": m["slug"], "name": m["name"]})
            continue
        print(f"== {m['name']} ({m['cat']})")
        titles = sorted(set(category_files(m["cat"], depth=2)))
        other = re.compile(OTHER_NAMES[m["slug"]], re.I)
        keep = [t for t in titles if not BAD.search(t) and not other.search(t)]
        # spread-sample candidates across the (year-sorted) list BEFORE the
        # imageinfo queries — one API batch instead of four
        cand = int(PER_MEMBER * 1.8)
        if len(keep) > cand:
            step = len(keep) / cand
            keep = [keep[int(i * step)] for i in range(cand)]
        print(f"   {len(titles)} files, sampling {len(keep)}")
        urls = thumb_urls(keep)
        picked = list(urls.items())
        if len(picked) > PER_MEMBER:
            step = len(picked) / PER_MEMBER
            picked = [picked[int(i * step)] for i in range(PER_MEMBER)]
        os.makedirs(outdir, exist_ok=True)
        count = 0
        for title, url in picked:
            ext = ".png" if url.lower().endswith(".png") else ".jpg"
            fname = f"{count:02d}{ext}"
            dest = os.path.join(outdir, fname)
            ok = False
            for attempt in range(4):
                try:
                    req = urllib.request.Request(url, headers=UA)
                    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
                        f.write(r.read())
                    ok = True
                    break
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        time.sleep(10 * (attempt + 1))
                        continue
                    print(f"   skip {title}: {e}")
                    break
                except Exception as e:
                    print(f"   skip {title}: {e}")
                    break
            if not ok:
                if os.path.exists(dest):
                    os.remove(dest)
                continue
            manifest["images"].append({
                "member": m["slug"], "file": f"/bts/{m['slug']}/{fname}",
                "source": title,
            })
            count += 1
            time.sleep(0.2)
        print(f"   downloaded {count}")
        manifest["members"].append({"slug": m["slug"], "name": m["name"]})
    # manifest reflects what's actually on disk (curation deletes files)
    manifest = {
        "members": [{"slug": m["slug"], "name": m["name"]} for m in MEMBERS],
        "images": [
            {"member": m["slug"], "file": f"/bts/{m['slug']}/{fn}"}
            for m in MEMBERS
            for fn in sorted(os.listdir(os.path.join(ROOT, m["slug"])))
            if re.search(r"\.(jpe?g|png)$", fn, re.I)
        ],
    }
    with open(os.path.join(ROOT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"total images: {len(manifest['images'])}")


if __name__ == "__main__":
    sys.exit(main())
