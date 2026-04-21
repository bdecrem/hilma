#!/usr/bin/env python3
"""
Pull transcripts for the Feynd "Frontier AI Models in 2026" course and emit
a single course JSON that the iOS app bundles.

Run:
    scripts/feynd/.venv/bin/python scripts/feynd/pull_transcripts.py

Output:
    apps/feynd/Feynd/Resources/courses/frontier-ai-2026.json
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/feynd/Feynd/Resources/courses/frontier-ai-2026.json"

COURSE = {
    "id": "frontier-ai-2026",
    "title": "Frontier AI Models in 2026",
    "subtitle": "How today's frontier AI models are actually built.",
    "description": (
        "A curated tour through recent talks and interviews by the people "
        "building frontier models in 2025 and 2026. Watch each video, then "
        "ask Feynd anything about what you just heard."
    ),
    "estimatedHours": 14,
    "accentHex": "#FA8C33",  # Feynd orange
    # Concept map — grouped for UI display order. Each concept is referenced
    # by videos via concept id.
    "concepts": [
        # Pretraining & scaling
        {"id": "scaling_laws", "group": "Pretraining & scaling",     "label": "Scaling laws"},
        {"id": "data_curation", "group": "Pretraining & scaling",    "label": "Data curation & tokenization"},
        {"id": "end_of_scaling", "group": "Pretraining & scaling",   "label": "End-of-scaling thesis"},
        {"id": "bitter_lesson", "group": "Pretraining & scaling",    "label": "The Bitter Lesson"},
        # Architecture
        {"id": "attention_variants", "group": "Architecture",        "label": "Attention variants"},
        {"id": "moe", "group": "Architecture",                        "label": "Mixture of Experts"},
        {"id": "long_context_multimodal", "group": "Architecture",    "label": "Long context & multimodality"},
        {"id": "world_models", "group": "Architecture",               "label": "World models"},
        # Post-training
        {"id": "sft", "group": "Post-training",                       "label": "SFT"},
        {"id": "rlhf", "group": "Post-training",                      "label": "RLHF"},
        {"id": "dpo", "group": "Post-training",                       "label": "DPO"},
        {"id": "rlvr_grpo", "group": "Post-training",                 "label": "RLVR & GRPO"},
        {"id": "continual_learning", "group": "Post-training",        "label": "Continual learning"},
        # Reasoning
        {"id": "chain_of_thought", "group": "Reasoning",              "label": "Chain-of-thought"},
        {"id": "o1_o3_reasoning", "group": "Reasoning",               "label": "o1/o3 deliberate reasoning"},
        {"id": "test_time_search", "group": "Reasoning",              "label": "Test-time search & refinement"},
        {"id": "verifier_gated", "group": "Reasoning",                "label": "Verifier-gated synthesis"},
        # Alignment & interpretability
        {"id": "circuits_features", "group": "Alignment & interp",    "label": "Circuits, features, superposition"},
        {"id": "saes", "group": "Alignment & interp",                 "label": "Sparse autoencoders"},
        {"id": "reward_hacking", "group": "Alignment & interp",       "label": "Reward hacking & deceptive alignment"},
        # Agents
        {"id": "computer_use", "group": "Agents",                     "label": "Computer-use agents"},
        {"id": "agentic_coding", "group": "Agents",                   "label": "Agentic coding & tool calling"},
        # Evals
        {"id": "arc_agi", "group": "Evals",                           "label": "ARC-AGI"},
        {"id": "benchmark_saturation", "group": "Evals",              "label": "Benchmark saturation"},
        # Lab view
        {"id": "lab_perspectives", "group": "Lab-level view",         "label": "Lab research strategies"},
        {"id": "us_china_frontier", "group": "Lab-level view",        "label": "US–China frontier (DeepSeek, Kimi, Qwen)"},
    ],
    # Video list in suggested viewing order. `concepts` is the set of concept
    # ids this video covers — used to light up the concept map as videos are
    # marked complete.
    "videos": [
        {
            "id": "karpathy-dwarkesh-2025-10",
            "order": 1,
            "title": "We're summoning ghosts, not building animals",
            "author": "Andrej Karpathy",
            "host": "Dwarkesh Patel",
            "publishedOn": "2025-10-17",
            "durationMin": 145,
            "youtubeId": "lXUZvyajciY",
            "url": "https://www.youtube.com/watch?v=lXUZvyajciY",
            "blurb": (
                "The broad frame. A former Tesla/OpenAI founding member gives "
                "a candid take on what's actually working — and breaking — in "
                "today's frontier training stack."
            ),
            "concepts": ["continual_learning", "rlvr_grpo", "agentic_coding", "lab_perspectives"],
        },
        {
            "id": "sutskever-dwarkesh-2025-11",
            "order": 2,
            "title": "We're moving from the age of scaling to the age of research",
            "author": "Ilya Sutskever",
            "host": "Dwarkesh Patel",
            "publishedOn": "2025-11-25",
            "durationMin": 96,
            "youtubeId": "aR20FWCCjAs",
            "url": "https://www.youtube.com/watch?v=aR20FWCCjAs",
            "blurb": (
                "The thesis. SSI's founder argues that pure scaling is "
                "returning diminishing marginal capability and the next era "
                "needs new research ideas, not more FLOPs."
            ),
            "concepts": ["scaling_laws", "end_of_scaling", "lab_perspectives"],
        },
        {
            "id": "lexfridman-490-2026-02",
            "order": 3,
            "title": "State of AI in 2026: LLMs, Coding, Scaling, China, Agents, AGI",
            "author": "Nathan Lambert & Sebastian Raschka",
            "host": "Lex Fridman",
            "publishedOn": "2026-02-01",
            "durationMin": 270,
            "youtubeId": "EV7WhVT270Q",
            "url": "https://www.youtube.com/watch?v=EV7WhVT270Q",
            "blurb": (
                "The technical spine. Nathan Lambert (RLHF Book / Ai2) and "
                "Sebastian Raschka walk through how modern frontier models are "
                "actually trained in 2026."
            ),
            "concepts": [
                "scaling_laws", "data_curation", "moe", "sft", "rlhf",
                "dpo", "rlvr_grpo", "agentic_coding", "us_china_frontier",
            ],
        },
        {
            "id": "sutton-dwarkesh-2025-09",
            "order": 4,
            "title": "Father of RL thinks LLMs are a dead end",
            "author": "Richard Sutton",
            "host": "Dwarkesh Patel",
            "publishedOn": "2025-09-26",
            "durationMin": 66,
            "youtubeId": "21EYKqUsPfg",
            "url": "https://www.youtube.com/watch?v=21EYKqUsPfg",
            "blurb": (
                "Foundations. The Turing Award winner argues LLMs lack "
                "on-the-job continual learning and that RL, not language "
                "modelling, is the substrate AGI will need."
            ),
            "concepts": ["bitter_lesson", "continual_learning", "rlvr_grpo"],
        },
        {
            "id": "chollet-dwarkesh-2025-08",
            "order": 5,
            "title": "I've updated my AGI timeline",
            "author": "François Chollet",
            "host": "Dwarkesh Patel",
            "publishedOn": "2025-08-11",
            "durationMin": 70,
            "youtubeId": "1if6XbzD5Yg",
            "url": "https://www.youtube.com/watch?v=1if6XbzD5Yg",
            "blurb": (
                "Reasoning & evals. Chollet revises his AGI timeline in "
                "response to o3-style test-time search — a direct window into "
                "how evals and reasoning systems co-evolve."
            ),
            "concepts": [
                "arc_agi", "o1_o3_reasoning", "test_time_search",
                "verifier_gated", "benchmark_saturation",
            ],
        },
        {
            "id": "nanda-iaseai-2025-08",
            "order": 6,
            "title": "An Introduction to Mechanistic Interpretability",
            "author": "Neel Nanda",
            "host": "IASEAI '25",
            "publishedOn": "2025-08-12",
            "durationMin": 50,
            "youtubeId": "0704iLc55Fs",
            "url": "https://www.youtube.com/watch?v=0704iLc55Fs",
            "blurb": (
                "Opening the hood. DeepMind's mech interp lead gives a clean, "
                "lecture-style intro to reverse-engineering what a neural "
                "network is doing."
            ),
            "concepts": ["circuits_features", "saes", "reward_hacking"],
        },
        {
            "id": "hassabis-gdm-2025-12",
            "order": 7,
            "title": "The Future of Intelligence",
            "author": "Demis Hassabis",
            "host": "Hannah Fry (Google DeepMind Podcast)",
            "publishedOn": "2025-12-16",
            "durationMin": 52,
            "youtubeId": "PqVbypvxDto",
            "url": "https://www.youtube.com/watch?v=PqVbypvxDto",
            "blurb": (
                "The post-LLM direction. Hassabis on Gemini 3, world models "
                "as the next architectural step, and automated scientific "
                "discovery."
            ),
            "concepts": ["world_models", "long_context_multimodal", "lab_perspectives"],
        },
        {
            "id": "amodei-dwarkesh-2026-02",
            "order": 8,
            "title": "We are near the end of the exponential",
            "author": "Dario Amodei",
            "host": "Dwarkesh Patel",
            "publishedOn": "2026-02-13",
            "durationMin": 120,
            "youtubeId": "n1E9IZfvGMA",
            "url": "https://www.youtube.com/watch?v=n1E9IZfvGMA",
            "blurb": (
                "The finale. Anthropic's CEO on what the RL post-training "
                "regime looks like from inside a frontier lab, and when "
                "computer-using agents are plausible."
            ),
            "concepts": [
                "rlvr_grpo", "computer_use", "agentic_coding",
                "lab_perspectives", "benchmark_saturation",
            ],
        },
    ],
}


def yt_id(url_or_id: str) -> str:
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url_or_id):
        return url_or_id
    p = urlparse(url_or_id)
    if p.hostname in ("youtu.be",):
        return p.path.lstrip("/")
    return parse_qs(p.query).get("v", [""])[0]


def pull_transcript(video_id: str) -> dict:
    """Return {status, text, segments[], language} for a video id."""
    api = YouTubeTranscriptApi()
    try:
        # The new API (v1.x): fetch() returns a FetchedTranscript whose
        # snippets each have .text/.start/.duration.
        fetched = api.fetch(video_id, languages=["en", "en-US", "en-GB"])
        snippets = list(fetched)
        segments = [
            {"t": round(s.start, 2), "d": round(s.duration, 2), "text": s.text}
            for s in snippets
        ]
        return {
            "status": "ok",
            "language": getattr(fetched, "language_code", None),
            "segments": segments,
            "text": " ".join(s["text"] for s in segments),
        }
    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        return {"status": "unavailable", "error": type(e).__name__, "segments": [], "text": ""}
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {e}", "segments": [], "text": ""}


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out_videos = []
    totals = {"ok": 0, "unavailable": 0, "error": 0}
    for v in COURSE["videos"]:
        vid = yt_id(v["youtubeId"])
        print(f"  pulling {v['id']} ({vid}) …", file=sys.stderr)
        t = pull_transcript(vid)
        totals[t["status"]] = totals.get(t["status"], 0) + 1
        print(
            f"    {t['status']:<11} segments={len(t['segments'])} "
            f"chars={len(t['text'])}",
            file=sys.stderr,
        )
        # Store transcript inline on the video object so the iOS app can
        # load one JSON and not juggle files. Text is the concatenated form
        # we'll feed Opus; segments preserve timing for future scrubbing.
        vv = dict(v)
        vv["transcript"] = {
            "status": t["status"],
            "language": t.get("language"),
            "text": t["text"],
            "segments": t["segments"],
            "error": t.get("error"),
        }
        out_videos.append(vv)

    course_out = dict(COURSE, videos=out_videos)
    OUT.write_text(json.dumps(course_out, ensure_ascii=False, indent=2))
    total_chars = sum(len(v["transcript"]["text"]) for v in out_videos)
    print(
        f"\nwrote {OUT.relative_to(ROOT)}  videos={len(out_videos)} "
        f"ok={totals.get('ok', 0)} unavail={totals.get('unavailable', 0)} "
        f"err={totals.get('error', 0)}  total_chars={total_chars}",
        file=sys.stderr,
    )
    return 0 if totals.get("ok", 0) == len(out_videos) else 1


if __name__ == "__main__":
    sys.exit(main())
