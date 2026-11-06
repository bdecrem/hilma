"""Side doors into law portals that defeat a plain fetch, and direct addresses that need no search.

expand(url)         -> alternative URLs that carry the same document as text or PDF (tried before the original)
guess(law, country) -> URLs to try before searching at all: numbered court decisions with predictable addresses,
                       EU instruments by CELEX number, the core human-rights treaties, Austrian law by title
"""
import json, re, urllib.parse, urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def _get(url, timeout=40):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# --- Netherlands: wetten.overheid.nl is a JS app; the Basis Wetten Bestand repository serves every law as XML
def nld(url):
    m = re.search(r"(BWB[RV]\d{7})", url)
    if not m: return []
    bwb = m.group(1)
    try:
        man = _get(f"https://repository.officiele-overheidspublicaties.nl/bwb/{bwb}/").decode("utf-8", "ignore")
    except Exception:
        return []
    latest = re.search(r'_latestItem="([^"]+)"', man)
    return [f"https://repository.officiele-overheidspublicaties.nl/bwb/{bwb}/{latest.group(1)}"] if latest else []


# --- Austria: ris.bka.gv.at answers scripts with 503, but the open-data API and ogd.ris.bka.gv.at documents work
def _ris_docs(params, pages=3):
    urls = []
    for page in range(1, pages + 1):
        q = urllib.parse.urlencode({**params, "DokumenteProSeite": "OneHundred", "Seitennummer": page})
        try:
            d = json.loads(_get(f"https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?{q}"))
        except Exception:
            break
        res = d.get("OgdSearchResult", {}).get("OgdDocumentResults", {})
        refs = res.get("OgdDocumentReference") or []
        if isinstance(refs, dict): refs = [refs]
        for ref in refs:
            crefs = ref.get("Data", {}).get("Dokumentliste", {}).get("ContentReference") or []
            if isinstance(crefs, dict): crefs = [crefs]
            for c in crefs:
                if not isinstance(c, dict) or c.get("ContentType") != "MainDocument": continue
                cu = c.get("Urls", {}).get("ContentUrl") or []
                if isinstance(cu, dict): cu = [cu]
                for u in cu:
                    if isinstance(u, dict) and u.get("DataType") == "Html": urls.append(u["Url"])
        hits = int(res.get("Hits", {}).get("#text") or 0)
        if page * 100 >= hits: break
    return urls


def aut(url):
    m = re.search(r"Gesetzesnummer=(\d+)", url)
    if not m: return []
    return [("ris", m.group(1))]  # resolved by fetch_ris below: the law is one HTML document per paragraph


def ris_text(gesetzesnummer):
    """Concatenate the paragraphs of one Austrian law (consolidated) from the open-data documents."""
    import html as H
    from concurrent.futures import ThreadPoolExecutor
    urls = _ris_docs({"Applikation": "BrKons", "Gesetzesnummer": gesetzesnummer})

    def one(u):
        try:
            raw = _get(u, 30).decode("utf-8", "ignore")
        except Exception:
            return ""
        raw = re.sub(r"<script.*?</script>|<style.*?</style>", "", raw, flags=re.S)
        return re.sub(r"[ \t]+", " ", H.unescape(re.sub(r"<[^>]+>", " ", raw))).strip()
    with ThreadPoolExecutor(8) as ex:
        parts = [t for t in ex.map(one, urls[:150]) if t]
    text = "\n\n".join(parts)
    return (f"https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer={gesetzesnummer}", text)


def ris_by_title(title):
    """Gesetzesnummer of the Austrian federal law whose short title matches, via the API's title search."""
    q = urllib.parse.urlencode({"Applikation": "BrKons", "Titel": title, "DokumenteProSeite": "Ten", "Seitennummer": 1})
    try:
        d = json.loads(_get(f"https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?{q}"))
        refs = d["OgdSearchResult"]["OgdDocumentResults"].get("OgdDocumentReference") or []
        if isinstance(refs, dict): refs = [refs]
        for ref in refs:
            g = ref["Data"]["Metadaten"]["Bundesrecht"]["BrKons"].get("Gesetzesnummer")
            if g: return g
    except Exception:
        return None
    return None


# --- Singapore: Singapore Statutes Online renders by JS; WholeDoc=1 and ViewType=Pdf serve the whole act
def sgp(url):
    if "sso.agc.gov.sg" not in url or "WholeDoc" in url or "ViewType" in url: return []
    base = url.split("?")[0].split("#")[0]
    return [base + "?WholeDoc=1", base + "?ViewType=Pdf"]


# --- Russia: publication.pravo.gov.ru pages are viewers; the PDF is one address away
def rus(url):
    m = re.search(r"publication\.pravo\.gov\.ru/Document/View/(\d+)", url)
    return [f"http://publication.pravo.gov.ru/file/pdf?eoNumber={m.group(1)}"] if m else []


# --- Kenya: kenyalaw.org Akoma Ntoso pages load their text lazily; every document has /source.pdf
def ken(url):
    m = re.match(r"(https?://(?:new\.)?kenyalaw\.org/akn/[^?#]+?)(?:/source\.pdf)?/?$", url)
    return [m.group(1) + "/source.pdf"] if m else []


# --- EU: a CELEX number gives the full text at a fixed address (eur-lex itself needs the browser)
def eu_celex(name, number):
    s = f"{name} {number or ''}"
    m = re.search(r"(Regulation|Directive|Decision)\s*\((?:EU|EC|EEC)\)\s*(?:No\.?\s*)?(\d{2,4})/(\d{1,4})", s, re.I) or \
        re.search(r"(Regulation|Directive|Decision)\s*(?:No\.?\s*)?(\d{2,4})/(\d{1,4})\s*/?\s*\((?:EU|EC|EEC)\)?", s, re.I) or \
        re.search(r"(Regulation|Directive|Decision)\s*(\d{2,4})/(\d{1,4})/(?:EU|EC|EEC)", s, re.I)
    if not m: return []
    kind, a, b = m.group(1).lower(), m.group(2), m.group(3)
    letter = {"regulation": "R", "directive": "L", "decision": "D"}[kind]
    # directives/decisions are year/number; regulations are number/year before 2015 and year/number after
    if len(a) == 4: year, num = a, b
    elif len(b) == 4: year, num = b, a
    else:
        ya, yb = int("19" + a) if int(a) > 50 else int("20" + a), int("19" + b) if int(b) > 50 else int("20" + b)
        year, num = (str(yb), a) if kind == "regulation" else (str(ya), b)
    celex = f"3{year}{letter}{int(num):04d}"
    return [f"https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex}"]


# --- Colombia: Constitutional Court rulings sit at a predictable address
def col_ruling(name, number):
    s = f"{number or ''} {name}"
    m = re.search(r"\b(T|C|SU|A)-\s?(\d{1,4})\s*(?:[/-]|de)\s*(\d{2,4})\b", s)
    if not m: return []
    kind, num, yr = m.group(1), m.group(2), m.group(3)
    year = yr if len(yr) == 4 else ("19" + yr if int(yr) > 60 else "20" + yr)
    return [f"https://www.corteconstitucional.gov.co/relatoria/{year}/{kind}-{num}-{year[2:]}.htm"]


# --- the core treaties, in the depositary's own PDF
TREATIES = [
    (r"european convention (on|for the protection of) human rights|\bECHR\b|convention for the protection of human rights and fundamental freedoms",
     "https://www.echr.coe.int/documents/d/echr/convention_ENG"),
    (r"vienna convention on consular relations", "https://legal.un.org/ilc/texts/instruments/english/conventions/9_2_1963.pdf"),
    (r"covenant on civil and political rights|\bICCPR\b", "https://www.ohchr.org/sites/default/files/ccpr.pdf"),
    (r"covenant on economic, social and cultural rights|\bICESCR\b", "https://www.ohchr.org/sites/default/files/cescr.pdf"),
    (r"convention against torture|\bCAT\b", "https://www.ohchr.org/sites/default/files/Documents/ProfessionalInterest/cat.pdf"),
    (r"optional protocol to the convention on the rights of the child on the sale of children", "https://www.ohchr.org/sites/default/files/Documents/ProfessionalInterest/crc-sale.pdf"),
    (r"convention on the rights of the child|\bCRC\b", "https://www.ohchr.org/sites/default/files/crc.pdf"),
    (r"elimination of all forms of discrimination against women|\bCEDAW\b", "https://www.ohchr.org/sites/default/files/Documents/ProfessionalInterest/cedaw.pdf"),
    (r"elimination of all forms of racial discrimination|\bICERD\b|\bCERD\b", "https://www.ohchr.org/sites/default/files/Documents/ProfessionalInterest/cerd.pdf"),
    (r"rights of all migrant workers|\bICRMW\b", "https://www.ohchr.org/sites/default/files/Documents/ProfessionalInterest/cmw.pdf"),
    (r"rights of persons with disabilities|\bCRPD\b", "https://www.ohchr.org/sites/default/files/Ch_IV_15.pdf"),
    (r"universal declaration of human rights", "https://www.un.org/sites/un2.un.org/files/2021/03/udhr.pdf"),
    (r"african charter on human and peoples", "https://au.int/sites/default/files/treaties/36390-treaty-0011_-_african_charter_on_human_and_peoples_rights_e.pdf"),
    (r"palermo protocol|protocol to prevent, suppress and punish trafficking", "https://www.unodc.org/documents/treaties/UNTOC/Publications/TOC%20Convention/TOCebook-e.pdf"),
    (r"status of refugees|geneva refugee convention|refugee convention", "https://www.unhcr.org/sites/default/files/legacy-pdf/3b66c2aa10.pdf"),
    (r"status of stateless persons", "https://www.unhcr.org/sites/default/files/legacy-pdf/3bbb25729.pdf"),
    (r"ILO Convention (No\.?\s*)?(\d+)|\(No\.?\s*(\d+)\)|\bC(\d{2,3})\b", "ilo"),
]


def treaty(name, number):
    s = f"{name} {number or ''}"
    for pat, url in TREATIES:
        m = re.search(pat, s, re.I)
        if not m: continue
        if url == "ilo":
            n = next(g for g in m.groups()[1:] if g)
            return [f"https://normlex.ilo.org/dyn/nrmlx_en/f?p=NORMLEXPUB:12100:0::NO::P12100_ILO_CODE:C{int(n):03d}"]
        return [url]
    return []


def expand(url):
    out = []
    for f in (nld, aut, sgp, rus, ken):
        try: out += f(url)
        except Exception: pass
    return out


def guess(law, country):
    name, num = law.get("name_en") or "", law.get("number")
    out = []
    if law["kind"] == "treaty" or re.search(r"convention|covenant|protocol|charter|declaration", name, re.I):
        out += treaty(name, num)
    out += eu_celex(name, num)
    if country["iso"] == "COL" and law["kind"] == "court_decision": out += col_ruling(name, num)
    if country["iso"] == "AUT" and law["kind"] in ("statute", "regulation", "constitution") and law.get("name_official"):
        g = ris_by_title(law["name_official"])
        if g: out.append(("ris", g))
    return out
