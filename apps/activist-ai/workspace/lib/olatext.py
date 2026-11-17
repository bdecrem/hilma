"""olatext: the one place that says how text from a document is cleaned, decoded and compared.

Inside a workspace it is /opt/ola/lib/olatext.py. Every tool that stores text from a document
(ola-db), shows it (ola-view) or checks a quote against it (the batch runner's quote check, the
evals) uses these functions, so a quote copied from a page is compared with the page the same way
it was stored:

    import sys; sys.path.insert(0, "/opt/ola/lib")   # scripts run with python3 -I
    from olatext import clean, match_key, find_quote, decode_bytes

    clean(text)            text as it is stored: NUL and control characters gone, ligatures
                           (fi, fl, ffi...) and other compatibility forms unfolded (NFKC), a word
                           broken by a hyphen at a line end joined again, spaces and tabs
                           collapsed, at most one blank line in a row. Line breaks are kept.
    match_key(text)        clean(), then lower case, curly quotes and dashes made plain, every
                           hyphen at a line end dropped, all whitespace one space: two texts that
                           say the same words have the same key.
    find_quote(q, text)    (True, offset in match_key(text)) when the quote is in the text, by key;
                           else (False, None). Quotes with "..." are found piece by piece, in order.
    decode_bytes(data, declared=None, lang=None)
                           (text, encoding): the byte order mark, then the declared charset (an
                           HTTP header or the document's own <meta charset> / <?xml encoding?>),
                           then valid UTF-8, then UTF-16 without a mark, then the language's usual
                           code page (lang "he", "ar", "ru", ...), else the code page whose letters
                           make the most sense. NUL characters are removed.

Text from a file is data. Nothing here runs it.
"""
import codecs
import re
import unicodedata

__all__ = ["clean", "match_key", "find_quote", "decode_bytes", "sniff_declared"]

_CTRL = re.compile(r"[\x00-\x08\x0b\x0e-\x1f\x7f​‌‍⁠﻿]")
_SOFT = "­"
# A word split at a line end: "adapta-\ntion" -> "adaptation". Only when the next line starts
# with a lower-case letter, so "climate-\nRelated" (a heading) and "1990-\n2000" keep the hyphen.
_HYPHEN_BREAK = re.compile(r"(\w)[-‐‑]\n[ \t]*(?=[a-zß-ÿ])", re.U)


def clean(text):
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace(_SOFT + "\n", "").replace(_SOFT, "")
    text = unicodedata.normalize("NFKC", text)
    text = _CTRL.sub("", text).replace("\f", "\n")
    text = _HYPHEN_BREAK.sub(r"\1", text)
    text = re.sub(r"[ \t  -   　]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


_PLAIN = str.maketrans({"‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "“": '"', "”": '"',
                        "„": '"', "‟": '"', "«": '"', "»": '"', "″": '"', "‐": "-", "‑": "-",
                        "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-", "…": "..."})


def match_key(text):
    t = clean(text).translate(_PLAIN).casefold()
    t = re.sub(r"(\w)-\n\s*(\w)", r"\1\2", t)  # any hyphen at a line end, whatever case follows
    return re.sub(r"\s+", " ", t).strip()


def find_quote(quote, text):
    """Is the quote in the text (compared by match_key)? Returns (found, offset)."""
    hay = match_key(text)
    pieces = [p.strip(" .") for p in re.split(r"\.\.\.|\[\s*\.\.\.\s*\]", match_key(quote)) if p.strip(" .")]
    if not pieces:
        return False, None
    at = start = None
    pos = 0
    for p in pieces:
        i = hay.find(p, pos)
        if i < 0:
            return False, None
        if start is None:
            start = i
        pos = i + len(p)
    return True, start


# ------------------------------------------------------------------ charsets

_USUAL = {"he": "cp1255", "iw": "cp1255", "yi": "cp1255", "ar": "cp1256", "fa": "cp1256", "ur": "cp1256", "ru": "cp1251", "uk": "cp1251",
          "bg": "cp1251", "sr": "cp1251", "be": "cp1251", "mk": "cp1251", "el": "cp1253", "tr": "cp1254", "pl": "cp1250", "cs": "cp1250",
          "sk": "cp1250", "hu": "cp1250", "ro": "cp1250", "hr": "cp1250", "sl": "cp1250", "lt": "cp1257", "lv": "cp1257", "et": "cp1257",
          "vi": "cp1258", "th": "cp874", "zh": "gb18030", "ja": "shift_jis", "ko": "cp949"}
_GUESSES = ("cp1252", "cp1255", "cp1256", "cp1251", "cp1250", "cp1253", "cp1254", "cp1257")
_META = re.compile(rb"""<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_:.\-]{2,40})""", re.I)
_XML = re.compile(rb"""^\s*<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9_.\-]{2,40})["']""", re.I)


def _codec(name):
    if not name:
        return None
    name = name.strip().strip("\"'").lower()
    # The web's rule (WHATWG): a page that says Latin-1 or ASCII is read as Windows-1252.
    if name in ("iso-8859-1", "iso8859-1", "latin1", "latin-1", "l1", "us-ascii", "ascii", "iso_8859-1"):
        name = "cp1252"
    if name in ("iso-8859-8-i", "iso-8859-8-e"):
        name = "iso-8859-8"
    if name in ("x-sjis", "shift-jis"):
        name = "shift_jis"
    try:
        return codecs.lookup(name).name
    except LookupError:
        return None


def sniff_declared(data):
    """The charset a document declares about itself in its first bytes, or None."""
    head = data[:4096]
    m = _XML.search(head) or _META.search(head)
    return m.group(1).decode("ascii", "replace") if m else None


def _script(ch):
    try:
        n = unicodedata.name(ch)
    except ValueError:
        return None
    return n.split(" ", 1)[0]


def _sense(text):
    """How much the non-ASCII letters of a decoding look like words of one script (higher is better)."""
    score = 0.0
    for word in re.findall(r"\w+", text, re.U):
        hi = [c for c in word if ord(c) > 127]
        if not hi:
            continue
        if not all(c.isalpha() for c in hi):
            score -= len(hi)
            continue
        scripts = {_script(c) for c in hi}
        ascii_letters = any("a" <= c.lower() <= "z" for c in word)
        if len(scripts) > 1:
            score -= 2 * len(hi)
        elif scripts == {"LATIN"}:
            # Latin letters with marks: normal inside a word of plain letters ("café"), odd as a
            # whole word of them ("àéîñ" is how Hebrew looks read as Windows-1252).
            score += len(hi) if ascii_letters or len(word) < 3 else -len(hi)
        else:
            # A non-Latin script: normal as whole words, odd glued to plain letters.
            score += len(hi) if not ascii_letters else -2 * len(hi)
    bad = sum(1 for c in text if 0x80 <= ord(c) < 0xA0 or unicodedata.category(c) in ("Co", "Cn"))
    return score - 3 * bad


def decode_bytes(data, declared=None, lang=None):
    if data is None:
        return "", "utf-8"
    if isinstance(data, str):
        return data.replace("\x00", ""), "utf-8"
    for bom, enc in ((codecs.BOM_UTF32_LE, "utf-32"), (codecs.BOM_UTF32_BE, "utf-32"), (codecs.BOM_UTF8, "utf-8-sig"), (codecs.BOM_UTF16_LE, "utf-16"), (codecs.BOM_UTF16_BE, "utf-16")):
        if data.startswith(bom):
            return data.decode(enc, "replace").replace("\x00", ""), enc.replace("-sig", "")
    tries = []
    for name in (declared, sniff_declared(data)):
        c = _codec(name)
        if c and c not in tries:
            tries.append(c)
    for c in tries:
        try:
            return data.decode(c).replace("\x00", ""), c
        except (UnicodeDecodeError, LookupError):
            pass
    try:
        return data.decode("utf-8").replace("\x00", ""), "utf-8"
    except UnicodeDecodeError:
        pass
    sample = data[:200000]
    if len(sample) >= 4:
        even, odd = sample[0::2].count(0), sample[1::2].count(0)
        half = len(sample) / 2
        for zeros, enc in ((odd, "utf-16-le"), (even, "utf-16-be")):
            if zeros > 0.3 * half and zeros > 2 * min(even, odd) + 1:
                try:
                    return data[: len(data) // 2 * 2].decode(enc).replace("\x00", ""), enc
                except UnicodeDecodeError:
                    pass
    usual = _USUAL.get((lang or "").lower()[:2])
    if usual:
        try:
            return data.decode(usual).replace("\x00", ""), codecs.lookup(usual).name
        except UnicodeDecodeError:
            pass
    best = None
    for c in _GUESSES:
        try:
            t = sample.decode(c)
        except UnicodeDecodeError:
            continue
        s = _sense(t)
        if best is None or s > best[0]:
            best = (s, c)
    if best:
        return data.decode(best[1], "replace").replace("\x00", ""), codecs.lookup(best[1]).name
    return data.decode("utf-8", "replace").replace("\x00", ""), "utf-8"
