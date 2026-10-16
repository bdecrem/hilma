"""Step 9, part 1: the SFT dataset — short questions about 1985–1991 computing,
answered the way a helpful Usenet regular would.

Claude writes them: 60 topics, 50 pairs per topic, one `claude -p` call per
topic (the CLI on this machine's login, structured output, no tools), eight
calls at a time. Answers are kept short and plain (one to four sentences, no
headers, quotes or signatures) because a 10 M model can learn a narrow,
consistent format and not much more. Nothing after 1991 may appear.

Writes 09-sft/qa.jsonl: one {"topic", "q", "a"} per line, duplicates dropped.

Run:  .venv/bin/python 09-sft/gen.py        (about ten minutes)
"""

import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "qa.jsonl")
MODEL = "claude-sonnet-5-5"
PER_TOPIC = 50

TOPICS = [
    "the Mac Plus and Mac SE", "the Mac II and color Macs", "System 6, the Finder and MultiFinder", "HyperCard",
    "the Amiga 500 and 2000", "AmigaDOS and Workbench", "the Atari ST", "the Commodore 64 and 128",
    "the Apple II and IIgs", "the IBM PC, XT and AT", "MS-DOS 3.3 and 4.0", "Windows 2 and Windows 3.0",
    "OS/2", "286, 386 and 486 processors", "memory: 640K, expanded and extended memory, RAM upgrades",
    "hard disks, SCSI, MFM and RLL", "floppy disks and disk drives", "monitors and graphics cards: CGA, EGA, VGA, Hercules",
    "printers: dot matrix, daisy wheel, LaserWriter, PostScript", "modems, baud rates and Hayes AT commands",
    "bulletin board systems (BBSes)", "file transfer: Xmodem, Ymodem, Zmodem, Kermit", "FidoNet",
    "Usenet itself: newsgroups, posting, newsreaders like rn", "netiquette and flame wars",
    "email, UUCP and bang paths", "the ARPANET and the early Internet: FTP, telnet, anonymous FTP",
    "Unix basics: files, directories, ls, cd, permissions", "the vi editor", "Emacs", "Unix shells: sh and csh",
    "grep, awk, sed and pipes", "VAX and VMS", "Sun workstations", "the NeXT computer", "C programming",
    "Pascal and Turbo Pascal", "BASIC", "assembly language", "Lisp and AI research",
    "computer viruses: Brain, Stoned, nVIR, the Internet worm", "backups and tape drives",
    "word processors: WordPerfect, WordStar, MacWrite, Word", "spreadsheets: Lotus 1-2-3, Excel, VisiCalc",
    "databases: dBase and FileMaker", "desktop publishing: PageMaker, fonts, laser printing",
    "computer games: Infocom, flight simulators, arcade ports", "music: MIDI, synthesizers, sound chips",
    "computer graphics: MacPaint, Deluxe Paint, ray tracing", "portable and laptop computers",
    "networks: AppleTalk, Ethernet, Novell NetWare", "buying a used computer and what things cost",
    "accelerator cards and upgrades", "keyboards, mice and joysticks",
    "online services: CompuServe, GEnie, Prodigy, The Source", "shareware and public domain software",
    "copy protection and software piracy", "computer magazines and books", "the X Window System",
    "TeX and LaTeX",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "pairs": {
            "type": "array",
            "items": {"type": "object", "properties": {"q": {"type": "string"}, "a": {"type": "string"}}, "required": ["q", "a"]},
        }
    },
    "required": ["pairs"],
}

PROMPT = """Write {n} question-and-answer pairs about {topic}, set between 1985 and 1991.

The questions are what an ordinary computer user of the time would ask on Usenet: one sentence, plain, varied (how do I, what is, which is better, is it worth it, why does, what does X mean, can I). Mix beginners and experienced users. Every question is different.

The answers are written by a helpful, knowledgeable Usenet regular of the time:
- one to four short sentences, 15 to 60 words
- plain text only: no greeting, no "Re:", no quoted text, no signature, no lists, no markdown
- concrete and correct for the period: real products, real commands, real numbers
- the voice of the time, casual and direct, but no jokes that need explaining
- nothing that happened or existed after 1991; never mention the future

Return exactly {n} pairs."""


def ask(topic):
    cmd = [
        "claude", "-p", PROMPT.format(n=PER_TOPIC, topic=topic),
        "--model", MODEL, "--output-format", "json", "--json-schema", json.dumps(SCHEMA),
        "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence",
    ]
    env = {k: v for k, v in os.environ.items() if k != "ANTHROPIC_API_KEY"}  # use the login, not an API key
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd="/tmp", timeout=900)
        try:
            pairs = json.loads(r.stdout)["structured_output"]["pairs"]
            if len(pairs) >= PER_TOPIC * 0.8:
                return topic, pairs
        except (json.JSONDecodeError, KeyError, TypeError):
            pass
        print(f"  retry {topic} ({attempt + 1})", flush=True)
    raise RuntimeError(f"no pairs for {topic}: {r.stderr[-500:]}")


def clean(s):
    return " ".join(s.split())


if __name__ == "__main__":
    seen, rows = set(), []
    with ThreadPoolExecutor(8) as pool:
        for fut in as_completed([pool.submit(ask, t) for t in TOPICS]):
            topic, pairs = fut.result()
            kept = 0
            for p in pairs:
                q, a = clean(p["q"]), clean(p["a"])
                if not q or not a or q.lower() in seen:
                    continue
                seen.add(q.lower())
                rows.append({"topic": topic, "q": q, "a": a})
                kept += 1
            print(f"{len(rows):5d}  +{kept:2d}  {topic}", flush=True)
    rows.sort(key=lambda r: (TOPICS.index(r["topic"]), r["q"]))
    with open(OUT, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(f"wrote {len(rows)} pairs to {OUT}")
