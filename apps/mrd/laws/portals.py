"""Where each country publishes its law. First entry is the main statute portal;
the rest are courts, gazettes and trusted free collections. Used to steer search
and to mark a source as official."""

PORTALS = {
    "ARG": ["infoleg.gob.ar", "argentina.gob.ar", "boletinoficial.gob.ar", "saij.gob.ar", "csjn.gov.ar"],
    "AUS": ["legislation.gov.au", "austlii.edu.au", "hcourt.gov.au", "homeaffairs.gov.au"],
    "AUT": ["ris.bka.gv.at", "vfgh.gv.at"],
    "BGD": ["bdlaws.minlaw.gov.bd", "supremecourt.gov.bd"],
    "BEL": ["ejustice.just.fgov.be", "juportal.be", "const-court.be", "etaamb.openjustice.be"],
    "BRA": ["planalto.gov.br", "normas.leg.br", "stf.jus.br", "stj.jus.br", "in.gov.br"],
    "CAN": ["laws-lois.justice.gc.ca", "canlii.org", "scc-csc.lexum.com", "gazette.gc.ca"],
    "CHL": ["bcn.cl", "diariooficial.interior.gob.cl", "tribunalconstitucional.cl"],
    "COL": ["secretariasenado.gov.co", "suin-juriscol.gov.co", "corteconstitucional.gov.co", "funcionpublica.gov.co"],
    "DNK": ["retsinformation.dk", "domstol.dk"],
    "ECU": ["registroficial.gob.ec", "cancilleria.gob.ec", "corteconstitucional.gob.ec", "asambleanacional.gob.ec"],
    "ETH": ["hopr.gov.et", "abyssinialaw.com", "lawethiopia.com"],
    "FIN": ["finlex.fi"],
    "FRA": ["legifrance.gouv.fr", "conseil-constitutionnel.fr", "conseil-etat.fr", "courdecassation.fr"],
    "DEU": ["gesetze-im-internet.de", "bundesverfassungsgericht.de", "bverwg.de", "recht.bund.de"],
    "GRC": ["et.gr", "hellenicparliament.gr", "kodiko.gr"],
    "HNG": ["njt.hu", "net.jogtar.hu", "alkotmanybirosag.hu"],
    "IND": ["indiacode.nic.in", "egazette.gov.in", "indiankanoon.org", "sci.gov.in"],
    "IDN": ["peraturan.bpk.go.id", "peraturan.go.id", "putusan3.mahkamahagung.go.id", "mkri.id"],
    "IRL": ["irishstatutebook.ie", "courts.ie", "bailii.org"],
    "ISR": ["knesset.gov.il", "gov.il", "supreme.court.gov.il", "versa.cardozo.yu.edu"],
    "ITA": ["normattiva.it", "gazzettaufficiale.it", "cortecostituzionale.it"],
    "JAP": ["japaneselawtranslation.go.jp", "elaws.e-gov.go.jp", "courts.go.jp"],
    "JOR": ["lob.gov.jo", "moj.gov.jo"],
    "KEN": ["kenyalaw.org", "new.kenyalaw.org"],
    "KOR": ["law.go.kr", "elaw.klri.re.kr", "ccourt.go.kr"],
    "LBN": ["legiliban.ul.edu.lb", "lp.gov.lb"],
    "MEX": ["diputados.gob.mx", "dof.gob.mx", "scjn.gob.mx", "gob.mx"],
    "MAR": ["sgg.gov.ma", "adala.justice.gov.ma"],
    "NLD": ["wetten.overheid.nl", "uitspraken.rechtspraak.nl", "officielebekendmakingen.nl"],
    "NZL": ["legislation.govt.nz", "nzlii.org", "justice.govt.nz"],
    "NGA": ["nigerialii.org", "placng.org", "lawnigeria.com"],
    "PER": ["spij.minjus.gob.pe", "leyes.congreso.gob.pe", "elperuano.pe", "tc.gob.pe", "gob.pe"],
    "RUS": ["pravo.gov.ru", "publication.pravo.gov.ru", "kremlin.ru", "ksrf.ru", "consultant.ru"],
    "SAU": ["laws.boe.gov.sa", "ncar.gov.sa"],
    "SEN": ["jo.gouv.sn", "sec.gouv.sn"],
    "SGP": ["sso.agc.gov.sg", "elitigation.sg", "judiciary.gov.sg"],
    "ZAF": ["gov.za", "saflii.org", "justice.gov.za", "concourt.org.za"],
    "ESP": ["boe.es", "poderjudicial.es", "tribunalconstitucional.es"],
    "SWE": ["riksdagen.se", "lagen.nu", "domstol.se", "regeringen.se"],
    "CHE": ["fedlex.admin.ch", "bger.ch", "admin.ch"],
    "TUR": ["mevzuat.gov.tr", "resmigazete.gov.tr", "anayasa.gov.tr"],
    "USA": ["uscode.house.gov", "ecfr.gov", "govinfo.gov", "law.cornell.edu", "congress.gov",
            "supremecourt.gov", "courtlistener.com", "federalregister.gov", "uscis.gov", "justia.com"],
    "ARE": ["uaelegislation.gov.ae", "u.ae", "mohre.gov.ae", "elaws.moj.gov.ae"],
    "GBR": ["legislation.gov.uk", "caselaw.nationalarchives.gov.uk", "bailii.org", "supremecourt.uk", "gov.uk"],
}

# free collections that are reliable but not the government's own site
TRUSTED = ["refworld.org", "natlex.ilo.org", "ilo.org", "constituteproject.org", "wipo.int",
           "worldlii.org", "commonlii.org", "faolex.fao.org", "ecoi.net", "legislationline.org"]


def is_official(domain, iso):
    d = (domain or "").lower()
    if any(d == p or d.endswith("." + p) for p in PORTALS.get(iso, [])):
        unofficial = {"etaamb.openjustice.be", "kodiko.gr", "lagen.nu", "consultant.ru", "lawethiopia.com",
                      "abyssinialaw.com", "placng.org", "lawnigeria.com", "law.cornell.edu", "justia.com",
                      "courtlistener.com", "indiankanoon.org", "bailii.org", "austlii.edu.au", "nzlii.org",
                      "saflii.org", "canlii.org", "nigerialii.org", "net.jogtar.hu", "versa.cardozo.yu.edu"}
        return not any(d == u or d.endswith("." + u) for u in unofficial)
    return any(d.endswith(s) for s in (".gov", ".gob", ".gouv", ".go.jp", ".go.kr", ".go.id", ".gv.at",
                                       ".gov.uk", ".gov.au", ".govt.nz", ".gc.ca", ".gov.za", ".gov.in",
                                       ".nic.in", ".admin.ch", ".gov.tr", ".gov.sa", ".gov.ae", ".jus.br",
                                       ".gov.br", ".fgov.be", ".overheid.nl", ".gov.il", ".gov.jo"))
