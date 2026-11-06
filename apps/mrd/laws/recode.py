"""Re-decode the stored HTML originals with the page's real charset and rewrite the texts that change.
The first crawls decoded Latin-1 pages as UTF-8 and dropped every accented letter ("Artculo").
    python3 recode.py [--dry]"""
import sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from lib import SB_URL, SB_KEY, sb, sb_all
from find import decode_html, html_text

DRY = "--dry" in sys.argv


def original(path):
    req = urllib.request.Request(f"{SB_URL}/storage/v1/object/sources/{path}", headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def one(law):
    try:
        data = original(law["storage_path"])
    except Exception as e:
        return law, None, f"download: {e}"
    old = data.decode("utf-8", "ignore")
    new = decode_html(data, lang=law["language"])
    if new == old:
        return law, None, None
    if not new.lstrip("\ufeff \r\n\t").startswith("<") and "<html" not in new[:5000].lower():
        text = new.strip()                     # stored as plain text (RIS, browser worker)
    else:
        text = html_text(new)
    return law, text, None


laws = sb_all("laws?select=id,name_en,storage_path,text_chars,language&find_status=eq.found&source_format=eq.html&storage_path=not.is.null")
print(len(laws), "stored html originals")
fixed = 0
with ThreadPoolExecutor(8) as ex:
    for law, text, err in ex.map(one, laws):
        if err:
            print("  !", law["name_en"], err)
        elif text and len(text) > 200 and "\x00" not in text and len(text) - (law["text_chars"] or 0) >= 20:
            fixed += 1
            print(f"  {law['language']} {law['name_en'][:50]}: {law['text_chars']} → {len(text)} | {' '.join(text[2000:2160].split())}")
            if not DRY:
                sb("PATCH", f"laws?id=eq.{law['id']}", {"text": text}, prefer="return=minimal")
print(("would fix" if DRY else "fixed"), fixed)
