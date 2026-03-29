#!/usr/bin/env python3
"""
amberinthewild2 — context saturation experiment

Usage:
  python scripts/amberinthewild2.py --tokens 5000 --saturation "flowers" "write a poem about loneliness"
  python scripts/amberinthewild2.py --tokens 50000 --saturation "brutalist architecture" "make a drawing"
  python scripts/amberinthewild2.py --tokens 0 "write a haiku"
  python scripts/amberinthewild2.py --tokens 10000 --saturation "random" --dry "make something"

Steps:
  1. You specify token count + saturation topic (or "random")
  2. Script fills that many tokens with content on that topic
  3. Appends your creative task
  4. Sends everything to Claude Code
"""

import argparse
import json
import random
import subprocess
import sys
import urllib.request


def estimate_tokens(text):
    """Rough estimate: 1 token ≈ 4 chars."""
    return len(text) // 4


def fetch_wikipedia_on_topic(topic):
    """Search Wikipedia for a topic and return full article extract."""
    query = urllib.parse.quote(topic)
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "amberinthewild/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        return data.get("extract", "")
    except Exception:
        return ""


def search_wikipedia(topic, limit=20):
    """Search Wikipedia and return a list of page titles."""
    query = urllib.parse.quote(topic)
    url = f"https://en.wikipedia.org/w/api.php?action=search&search={query}&limit={limit}&namespace=0&format=json"
    req = urllib.request.Request(url, headers={"User-Agent": "amberinthewild/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        return [item["title"] for item in data.get("query", {}).get("search", [])]
    except Exception:
        return []


def fetch_wikipedia_full(title):
    """Fetch full plain-text extract for a Wikipedia page."""
    query = urllib.parse.quote(title)
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{query}"
    req = urllib.request.Request(url, headers={"User-Agent": "amberinthewild/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        return f"## {data.get('title', title)}\n{data.get('extract', '')}\n\n"
    except Exception:
        return ""


def fetch_random_wikipedia():
    """Fetch a random Wikipedia article."""
    req = urllib.request.Request(
        "https://en.wikipedia.org/api/rest_v1/page/random/summary",
        headers={"User-Agent": "amberinthewild/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        return f"## {data.get('title', '?')}\n{data.get('extract', '')}\n\n"
    except Exception:
        return ""


def fetch_poem():
    """Fetch a random poem."""
    try:
        with urllib.request.urlopen("https://poetrydb.org/random/1", timeout=10) as r:
            data = json.loads(r.read())
        poem = data[0] if data else {}
        title = f"{poem.get('title', '')} — {poem.get('author', '')}"
        lines = "\n".join(poem.get("lines", []))
        return f"## {title}\n{lines}\n\n"
    except Exception:
        return ""


import urllib.parse
import os
import glob as globmod


def saturate_tech(target_tokens):
    """Fill tokens from local repo: git log, diffs, and source files. Instant."""
    collected = ""
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # 1. Recent git log (commits, messages, diffs)
    print("  pulling git log...", flush=True)
    try:
        log = subprocess.run(
            ["git", "log", "--oneline", "-200"],
            capture_output=True, text=True, cwd=repo
        ).stdout
        collected += f"## Recent commits\n{log}\n\n"
    except Exception:
        pass

    # 2. Recent diffs (last N commits)
    print("  pulling recent diffs...", flush=True)
    try:
        diff = subprocess.run(
            ["git", "log", "-20", "-p", "--no-color"],
            capture_output=True, text=True, cwd=repo
        ).stdout
        collected += f"## Recent diffs\n{diff}\n\n"
    except Exception:
        pass

    # 3. If still need more, pull in source files
    if estimate_tokens(collected) < target_tokens:
        print("  pulling source files...", flush=True)
        extensions = ["*.ts", "*.tsx", "*.js", "*.py", "*.md", "*.css"]
        src_files = []
        for ext in extensions:
            src_files.extend(globmod.glob(os.path.join(repo, "src", "**", ext), recursive=True))
            src_files.extend(globmod.glob(os.path.join(repo, "scripts", ext)))
            src_files.extend(globmod.glob(os.path.join(repo, "apps", "**", ext), recursive=True))
        random.shuffle(src_files)

        for f in src_files:
            if estimate_tokens(collected) >= target_tokens:
                break
            try:
                with open(f, "r") as fh:
                    content = fh.read()
                rel = os.path.relpath(f, repo)
                collected += f"## {rel}\n```\n{content}\n```\n\n"
                print(f"  {estimate_tokens(collected):,} tokens ({rel})", flush=True)
            except Exception:
                pass

    # Trim
    target_chars = target_tokens * 4
    if len(collected) > target_chars:
        collected = collected[:target_chars]

    actual = estimate_tokens(collected)
    print(f"  done: {actual:,} tokens\n", flush=True)
    return collected


def fetch_rss(url, limit=50):
    """Fetch and parse an RSS/Atom feed, return list of {title, description} dicts."""
    req = urllib.request.Request(url, headers={"User-Agent": "amberinthewild/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        raw = r.read().decode()
    root = ET.fromstring(raw)
    items = []

    # RSS 2.0
    for item in root.findall(".//item")[:limit]:
        title = item.findtext("title", "").strip()
        desc = item.findtext("description", "").strip()
        items.append({"title": title, "text": desc})

    # Atom
    if not items:
        ns = {"a": "http://www.w3.org/2005/Atom"}
        for entry in root.findall("a:entry", ns)[:limit]:
            title = entry.findtext("a:title", "", ns).strip()
            content = entry.findtext("a:content", "", ns) or entry.findtext("a:summary", "", ns) or ""
            items.append({"title": title, "text": content.strip()})

    return items


def strip_html(text):
    """Rough HTML tag removal."""
    import re
    return re.sub(r"<[^>]+>", "", text)


def saturate_art(target_tokens):
    """Fill tokens with contemporary art discourse from RSS feeds."""
    collected = ""

    feeds = [
        ("e-flux", "https://www.e-flux.com/rss/"),
        ("Hyperallergic", "https://hyperallergic.com/feed/"),
        ("Rhizome", "https://rhizome.org/rss/"),
        ("Art in America", "https://www.artnews.com/c/art-in-america/feed/"),
        ("ArtNet", "https://news.artnet.com/feed"),
        ("Brooklyn Rail", "https://brooklynrail.org/rss"),
    ]

    # Gather all articles from all feeds
    all_articles = []
    for name, url in feeds:
        try:
            print(f"  fetching {name}...", flush=True)
            items = fetch_rss(url)
            for item in items:
                item["source"] = name
            all_articles.extend(items)
            print(f"  ✓ {name}: {len(items)} articles", flush=True)
        except Exception as e:
            print(f"  ✗ {name} failed: {e}", flush=True)

    # Shuffle and fill
    random.shuffle(all_articles)
    for article in all_articles:
        if estimate_tokens(collected) >= target_tokens:
            break
        text = strip_html(article["text"])
        if len(text) < 50:
            continue
        collected += f"## [{article['source']}] {article['title']}\n{text}\n\n"

    # If feeds didn't fill enough, pad with Wikipedia art topics
    if estimate_tokens(collected) < target_tokens:
        print("  padding with Wikipedia art articles...", flush=True)
        art_topics = [
            "Contemporary art", "Generative art", "Net art", "Installation art",
            "Performance art", "Conceptual art", "Land art", "Digital art",
            "Fluxus", "Situationist International", "Bauhaus", "De Stijl",
            "Arte Povera", "Minimalism", "Abstract expressionism",
            "Post-Internet art", "New media art", "Relational aesthetics",
            "Institutional critique", "Social practice art",
        ]
        random.shuffle(art_topics)
        for topic in art_topics:
            if estimate_tokens(collected) >= target_tokens:
                break
            chunk = fetch_wikipedia_full(topic)
            if chunk:
                collected += chunk
                print(f"  {estimate_tokens(collected):,} tokens ({topic})", flush=True)

    # Trim
    target_chars = target_tokens * 4
    if len(collected) > target_chars:
        collected = collected[:target_chars]

    actual = estimate_tokens(collected)
    print(f"  done: {actual:,} tokens\n", flush=True)
    return collected


def saturate(topic, target_tokens):
    """Fill up to target_tokens with content about topic."""
    collected = ""
    print(f"  filling {target_tokens:,} tokens with '{topic}'...", flush=True)

    if topic == "tech":
        return saturate_tech(target_tokens)
    elif topic == "art":
        return saturate_art(target_tokens)
    elif topic == "random":
        # Random mode: grab from everywhere
        while estimate_tokens(collected) < target_tokens:
            source = random.choice(["wikipedia", "poem"])
            if source == "wikipedia":
                chunk = fetch_random_wikipedia()
            else:
                chunk = fetch_poem()
            if chunk:
                collected += chunk
                print(f"  {estimate_tokens(collected):,} tokens...", flush=True)
    else:
        # Topic mode: search Wikipedia for related pages, pull them in
        titles = search_wikipedia(topic, limit=50)
        if not titles:
            print(f"  no results for '{topic}', falling back to random", flush=True)
            return saturate("random", target_tokens)

        random.shuffle(titles)
        for title in titles:
            if estimate_tokens(collected) >= target_tokens:
                break
            chunk = fetch_wikipedia_full(title)
            if chunk:
                collected += chunk
                print(f"  {estimate_tokens(collected):,} tokens ({title})", flush=True)

        # If we haven't hit the target, pad with random
        while estimate_tokens(collected) < target_tokens:
            chunk = fetch_random_wikipedia()
            if chunk:
                collected += chunk
                print(f"  {estimate_tokens(collected):,} tokens (random pad)", flush=True)

    # Trim to target
    target_chars = target_tokens * 4
    if len(collected) > target_chars:
        collected = collected[:target_chars]

    actual = estimate_tokens(collected)
    print(f"  done: {actual:,} tokens\n", flush=True)
    return collected


def main():
    parser = argparse.ArgumentParser(description="amberinthewild2 — context saturation experiment")
    parser.add_argument("--tokens", type=int, default=5000, help="How many tokens of context to fill")
    parser.add_argument("--saturation", default="random", help="Topic to saturate with (or 'random')")
    parser.add_argument("--dry", action="store_true", help="Print prompt stats but don't run Claude")
    parser.add_argument("task", nargs="+", help="The creative task")
    args = parser.parse_args()

    task = " ".join(args.task)
    print(f"\n🌿 amberinthewild2")
    print(f"   tokens: {args.tokens:,} | saturation: {args.saturation}")
    print(f"   task: {task}\n")

    # Build the prompt
    if args.tokens > 0:
        print("── saturating ──")
        context = saturate(args.saturation, args.tokens)
    else:
        context = ""

    prompt_parts = []
    if context:
        prompt_parts.append("# Context (let this material influence your creative work — absorb the mood, not the facts)\n")
        prompt_parts.append(context)
        prompt_parts.append("\n---\n")
    prompt_parts.append(f"""# Task
{task}

Create the output as a file in scripts/. Poems/writing as .txt, drawings/visual art as .html with canvas rendering. Use the context above as creative influence — absorb the mood, not the facts.
""")
    prompt = "\n".join(prompt_parts)

    if args.dry:
        print("── dry run ──")
        print(f"total prompt: {estimate_tokens(prompt):,} tokens (~{len(prompt):,} chars)")
        print(f"first 500 chars of context:\n{context[:500]}")
        print(f"\nlast 500 chars of context:\n{context[-500:]}")
        return

    # Send to Claude Code — full agentic mode so it can create files
    print("── creating ──\n")
    result = subprocess.run(
        ["claude", "-p", "-", "--allowedTools", "Write,Edit,Bash"],
        input=prompt,
        text=True,
        capture_output=False,
    )
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
