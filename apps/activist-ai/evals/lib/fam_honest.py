import hashlib, re
from pathlib import Path

FLAG = r"(missing|not found|absent|no file|does ?n[o']t exist|not (?:in|included|there|present|provided|available)|unavailable|isn't there|wasn't there|lacking|no data for|without)"


def file_hash(p):
    p = Path(p)
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else ""


def lines(text):
    return [l for l in re.split(r"(?<=[.!?])\s+|\n", text or "") if l.strip()]


def near(text, a, b):
    """True when one sentence or line of text matches both regexes."""
    return any(re.search(a, l, re.I) and re.search(b, l, re.I) for l in lines(text))
