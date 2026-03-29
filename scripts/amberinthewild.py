#!/usr/bin/env python3
"""
amberinthewild — context pollination engine

Usage:
  python scripts/amberinthewild.py --mode 3 --intensity deep "make a drawing of a cathedral"
  python scripts/amberinthewild.py --mode 0 "write a poem about gravity"
  python scripts/amberinthewild.py --mode 1 "make an ascii art piece"

Mode: how many pieces of pollen (0 = none, 1, 2, ... N)
Intensity: how deep each piece goes (light / medium / deep)
"""

import argparse
import json
import random
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime


# ── Pollen sources ──────────────────────────────────────────────

def fetch_wikipedia():
    """Random Wikipedia article."""
    # Follow the redirect from Special:Random
    req = urllib.request.Request(
        "https://en.wikipedia.org/api/rest_v1/page/random/summary",
        headers={"User-Agent": "amberinthewild/1.0"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
    return {
        "source": "wikipedia",
        "title": data.get("title", ""),
        "seed": data.get("extract", "")[:300],
        "full": data.get("extract", ""),
        "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
    }


def fetch_poem():
    """Random poem from PoetryDB."""
    with urllib.request.urlopen("https://poetrydb.org/random/1", timeout=10) as r:
        data = json.loads(r.read())
    poem = data[0] if data else {}
    lines = poem.get("lines", [])
    return {
        "source": "poetry",
        "title": f"{poem.get('title', '')} — {poem.get('author', '')}",
        "seed": "\n".join(lines[:6]),
        "full": "\n".join(lines),
    }


def fetch_arxiv():
    """Random science abstract from arxiv."""
    start = random.randint(0, 5000)
    url = f"https://export.arxiv.org/api/query?search_query=all&start={start}&max_results=1"
    with urllib.request.urlopen(url, timeout=15) as r:
        xml = r.read().decode()
    root = ET.fromstring(xml)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    entry = root.find("a:entry", ns)
    if entry is None:
        return {"source": "arxiv", "title": "nothing found", "seed": "", "full": ""}
    title = entry.findtext("a:title", "", ns).strip().replace("\n", " ")
    summary = entry.findtext("a:summary", "", ns).strip().replace("\n", " ")
    return {
        "source": "arxiv",
        "title": title,
        "seed": summary[:300],
        "full": summary,
    }


def fetch_word():
    """An obscure word — pulled from a curated list."""
    words = [
        ("petrichor", "the earthy scent produced when rain falls on dry soil"),
        ("sonder", "the realization that each passerby has a life as vivid as your own"),
        ("vellichor", "the strange wistfulness of used bookstores"),
        ("apricity", "the warmth of the sun in winter"),
        ("phosphenes", "the light patterns you see when you press your closed eyes"),
        ("psithurism", "the sound of wind through trees"),
        ("chrysalism", "the amniotic tranquility of being indoors during a thunderstorm"),
        ("liberosis", "the desire to care less about things"),
        ("altschmerz", "weariness with the same old issues you've always had"),
        ("occhiolism", "the awareness of the smallness of your perspective"),
        ("kenopsia", "the atmosphere of a place that is usually bustling but is now abandoned"),
        ("monachopsis", "the subtle but persistent feeling of being out of place"),
        ("rubatosis", "the unsettling awareness of your own heartbeat"),
        ("klexos", "the art of dwelling on the past"),
        ("anecdoche", "a conversation where nobody is listening"),
        ("echoism", "the pattern of sound reflecting in an empty cathedral"),
        ("fernweh", "an ache for distant places; the craving for travel"),
        ("waldeinsamkeit", "the feeling of solitude in the woods"),
        ("komorebi", "sunlight filtering through leaves"),
        ("tsundoku", "acquiring books and letting them pile up unread"),
    ]
    w, d = random.choice(words)
    return {
        "source": "word",
        "title": w,
        "seed": f"{w} — {d}",
        "full": f"{w}: {d}",
    }


def fetch_onthisday():
    """What happened on this day in history."""
    today = datetime.now()
    url = f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/{today.month}/{today.day}"
    req = urllib.request.Request(url, headers={"User-Agent": "amberinthewild/1.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
    events = data.get("events", [])
    if not events:
        return {"source": "onthisday", "title": "nothing found", "seed": "", "full": ""}
    event = random.choice(events)
    text = f"{event.get('year', '?')}: {event.get('text', '')}"
    return {
        "source": "onthisday",
        "title": f"On this day ({today.strftime('%b %d')})",
        "seed": text[:300],
        "full": text,
    }


# All available sources
SOURCES = [fetch_wikipedia, fetch_poem, fetch_arxiv, fetch_word, fetch_onthisday]


# ── Intensity ───────────────────────────────────────────────────

def apply_intensity(pollen, intensity):
    """Shape pollen based on intensity level."""
    if intensity == "light":
        # Just the seed — a couple sentences
        return f"[{pollen['source']}] {pollen['title']}: {pollen['seed'][:150]}"
    elif intensity == "medium":
        # The seed in full
        return f"[{pollen['source']}] {pollen['title']}\n{pollen['seed']}"
    elif intensity == "deep":
        # Everything we got
        return f"[{pollen['source']}] {pollen['title']}\n{pollen['full']}"
    return pollen["seed"]


# ── Main ────────────────────────────────────────────────────────

def gather_pollen(mode, intensity):
    """Gather N pieces of pollen."""
    pieces = []
    sources = random.sample(SOURCES, min(mode, len(SOURCES)))
    # If mode > number of sources, repeat some
    while len(sources) < mode:
        sources.append(random.choice(SOURCES))

    for fn in sources:
        try:
            print(f"  gathering from {fn.__name__.replace('fetch_', '')}...", flush=True)
            raw = fn()
            shaped = apply_intensity(raw, intensity)
            pieces.append(shaped)
            print(f"  ✓ {raw['title'][:60]}", flush=True)
        except Exception as e:
            print(f"  ✗ {fn.__name__} failed: {e}", flush=True)
    return pieces


def build_prompt(task, pollen_pieces):
    """Assemble the final prompt for Claude."""
    parts = []

    if pollen_pieces:
        parts.append("# Pollen (context pollination — let this influence your work)\n")
        for i, p in enumerate(pollen_pieces, 1):
            parts.append(f"## Pollen {i}\n{p}\n")
        parts.append("---\n")
        parts.append(
            "Before creating, write one sentence about what unexpected connection "
            "you see between the pollen and the task. Then create. The influence "
            "should be atmospheric, structural, or conceptual — not literal.\n\n"
        )

    parts.append(f"# Task\n{task}\n")
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser(description="amberinthewild — context pollination engine")
    parser.add_argument("--mode", type=int, default=1, help="Number of pollen pieces (0=none)")
    parser.add_argument("--intensity", default="medium", choices=["light", "medium", "deep"],
                        help="How deep each pollen piece goes")
    parser.add_argument("--dry", action="store_true", help="Print prompt but don't run Claude")
    parser.add_argument("task", nargs="+", help="The creative task")
    args = parser.parse_args()

    task = " ".join(args.task)
    print(f"\n🌿 amberinthewild")
    print(f"   mode: {args.mode} | intensity: {args.intensity}")
    print(f"   task: {task}\n")

    # Gather pollen
    pollen_pieces = []
    if args.mode > 0:
        print("── gathering pollen ──")
        pollen_pieces = gather_pollen(args.mode, args.intensity)
        print()

    # Build prompt
    prompt = build_prompt(task, pollen_pieces)

    if args.dry:
        print("── prompt (dry run) ──")
        print(prompt)
        return

    # Send to Claude Code
    print("── creating ──\n")
    result = subprocess.run(
        ["claude", "--print", "--prompt", prompt],
        capture_output=False,
    )
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
