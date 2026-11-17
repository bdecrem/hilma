#!/usr/bin/env python3
"""Draw one honest chart from a table, and save it with the data behind it.

    python3 /opt/ola/skills/chart/scripts/chart.py draw --csv data.csv --x region --y studies \
        --kind bar --title "Studies per region" --what "Number of studies" --source "studies.csv, uploaded 2026-11-16" \
        --out charts/studies-by-region
    python3 .../chart.py draw --db project.db --sql "SELECT region, COUNT(*) AS studies FROM studies GROUP BY region" ...
    python3 .../chart.py check charts/studies-by-region

`draw` writes <out>.png (1600 x 900), <out>.svg (text kept as text), <out>.csv (exactly the rows that
were drawn, in the order drawn) and <out>.json (the title, the caption, the source, the query, the
values), then runs `check`. `check` reopens all four and proves the drawn numbers equal the data file.

Honest by construction: bars always start at zero; a line starts at zero unless --no-zero, and then
the caption says so; a missing value is a gap, never a zero; rows without a number are left out and
counted in the caption; no pie, no 3D, no second axis.
"""
import argparse, csv, json, math, sqlite3, sys
from datetime import date
from pathlib import Path

KINDS = ("bar", "hbar", "line", "scatter")
# Okabe and Ito's palette: tells apart for the common kinds of color blindness. One series is ink blue.
SERIES = ["#2b4c7e", "#d55e00", "#009e73", "#cc79a7", "#e69f00", "#56b4e9", "#000000"]
INK, MUTED, GRID = "#1f2430", "#596070", "#e3e5ea"


def number(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return None if isinstance(v, float) and math.isnan(v) else float(v)
    t = str(v).strip().replace(",", "").replace("−", "-")
    if t.endswith("%"):
        t = t[:-1]
    if t in ("", "-", "NA", "N/A", "n/a", "na", "null", "None", "NaN", "nan"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def load(a):
    if a.csv:
        with open(a.csv, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        return rows, list(rows[0].keys()) if rows else [], f"the file {a.csv}"
    if a.db:
        con = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        cur = con.execute(a.sql)
        cols = [d[0] for d in cur.description]
        rows = [dict(r) for r in cur.fetchall()]
        return rows, cols, f"{a.db}: {a.sql}"
    sys.exit("chart: give --csv FILE, or --db FILE with --sql QUERY")


def draw(a):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.family": "DejaVu Sans", "svg.fonttype": "none", "font.size": 11, "axes.edgecolor": MUTED,
                         "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED, "text.color": INK})
    rows, cols, origin = load(a)
    for c in [a.x] + a.y:
        if c not in cols:
            sys.exit(f"chart: no column named {c!r}; the columns are: {', '.join(cols)}")
    if a.kind == "pie":
        sys.exit("chart: no pie charts (people misread angles); use --kind bar")
    kept, dropped = [], 0
    for r in rows:
        ys = [number(r.get(c)) for c in a.y]
        if a.kind in ("bar", "hbar", "scatter") and any(v is None for v in ys):
            dropped += 1
            continue
        if a.kind == "scatter" and number(r.get(a.x)) is None:
            dropped += 1
            continue
        kept.append((r.get(a.x), ys))
    gaps = sum(1 for _, ys in kept for v in ys if v is None)
    if a.sort != "none" and a.kind in ("bar", "hbar"):
        kept.sort(key=lambda t: t[1][0], reverse=(a.sort == "desc"))
    if a.limit:
        cut = len(kept) - a.limit
        kept = kept[: a.limit]
        if cut > 0:
            dropped += cut
    if not kept:
        sys.exit("chart: no rows with numbers to draw")
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    labels = ["" if x is None else str(x) for x, _ in kept]

    fig, ax = plt.subplots(figsize=(8, 4.5), dpi=200)
    fig.subplots_adjust(left=0.11 if a.kind != "hbar" else 0.25, right=0.97, top=0.86, bottom=0.2)
    drawn = []  # what matplotlib actually drew, read back from its own objects
    n = len(a.y)
    if a.kind in ("bar", "hbar"):
        width = 0.8 / n
        for i, c in enumerate(a.y):
            pos = [j + (i - (n - 1) / 2) * width for j in range(len(kept))]
            vals = [ys[i] for _, ys in kept]
            bars = (ax.barh if a.kind == "hbar" else ax.bar)(pos, vals, width * 0.92, color=SERIES[i % len(SERIES)], label=c, zorder=2)
            drawn.append([round(b.get_width() if a.kind == "hbar" else b.get_height(), 9) for b in bars])
        if a.kind == "hbar":
            ax.set_yticks(range(len(kept)), labels)
            ax.invert_yaxis()
            ax.set_xlim(left=0)
            ax.xaxis.grid(True, color=GRID, zorder=0)
        else:
            ax.set_xticks(range(len(kept)), labels, rotation=30 if max(map(len, labels)) > 6 else 0, ha="right" if max(map(len, labels)) > 6 else "center")
            ax.set_ylim(bottom=0)
            ax.yaxis.grid(True, color=GRID, zorder=0)
    elif a.kind == "line":
        xs = list(range(len(kept)))
        for i, c in enumerate(a.y):
            vals = [float("nan") if ys[i] is None else ys[i] for _, ys in kept]
            (ln,) = ax.plot(xs, vals, color=SERIES[i % len(SERIES)], linewidth=2.2, marker="o", markersize=3.5, label=c, zorder=2)
            drawn.append([None if math.isnan(v) else round(float(v), 9) for v in ln.get_ydata()])
        step = max(1, len(kept) // 12)
        ax.set_xticks(xs[::step], labels[::step], rotation=30 if len(kept) > 8 else 0, ha="right" if len(kept) > 8 else "center")
        if not a.no_zero:
            lo = min(v for _, ys in kept for v in ys if v is not None)
            ax.set_ylim(bottom=min(0, lo))
        ax.yaxis.grid(True, color=GRID, zorder=0)
    else:
        for i, c in enumerate(a.y):
            xs = [number(x) for x, _ in kept]
            vals = [ys[i] for _, ys in kept]
            sc = ax.scatter(xs, vals, s=18, color=SERIES[i % len(SERIES)], label=c, zorder=2)
            drawn.append([round(float(p[1]), 9) for p in sc.get_offsets()])
        ax.grid(True, color=GRID, zorder=0)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    fmt = matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}" if abs(v) >= 100 or float(v).is_integer() else f"{v:,.2f}".rstrip("0").rstrip("."))
    (ax.xaxis if a.kind == "hbar" else ax.yaxis).set_major_formatter(fmt)
    if a.kind == "scatter":
        ax.set_xlabel(a.x_label or a.x)
    if n > 1:
        ax.legend(frameon=False, loc="upper left", bbox_to_anchor=(0, 1.02), ncol=n, fontsize=10)
    value_label = a.y_label or (a.what if n == 1 else "")
    if value_label:
        (ax.set_xlabel if a.kind == "hbar" else ax.set_ylabel)(value_label, color=MUTED)
    fig.text(0.02, 0.95, a.title, fontsize=15, fontweight="bold", ha="left", va="top")

    notes = []
    if dropped:
        notes.append(f"{dropped} row{'s' if dropped != 1 else ''} without a number {'are' if dropped != 1 else 'is'} not shown.")
    if gaps:
        notes.append(f"{gaps} missing value{'s' if gaps != 1 else ''} {'are' if gaps != 1 else 'is'} shown as a gap.")
    if a.kind == "line" and a.no_zero:
        notes.append("The vertical axis does not start at zero.")
    caption = f"{a.what}, by {a.x_label or a.x}. {len(kept)} {'rows' if len(kept) != 1 else 'row'}. Source: {a.source}." + (" " + " ".join(notes) if notes else "")
    fig.text(0.02, 0.03, caption, fontsize=9, color=MUTED, ha="left", va="bottom", wrap=True)
    fig.savefig(out.with_suffix(".png"), dpi=200)
    fig.savefig(out.with_suffix(".svg"))
    plt.close(fig)

    with open(out.with_suffix(".csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([a.x] + a.y)
        for x, ys in kept:
            w.writerow([x] + ["" if v is None else (int(v) if float(v).is_integer() else v) for v in ys])
    spec = {"title": a.title, "caption": caption, "kind": a.kind, "x": a.x, "y": a.y, "rows": len(kept), "dropped": dropped, "gaps": gaps,
            "source": a.source, "from": origin, "zero_baseline": not (a.kind == "line" and a.no_zero), "drawn": drawn,
            "made": date.today().isoformat(), "files": [out.with_suffix(s).name for s in (".png", ".svg", ".csv")]}
    out.with_suffix(".json").write_text(json.dumps(spec, indent=1))
    return check(out)


def check(out):
    """Reopens what draw wrote; exit 1 with the reasons if anything does not hold."""
    out = Path(out)
    if out.suffix in (".png", ".svg", ".csv", ".json"):
        out = out.with_suffix("")
    problems = []
    try:
        spec = json.loads(out.with_suffix(".json").read_text())
    except Exception as e:
        print(f"chart check: cannot read {out.with_suffix('.json')}: {e}")
        return 1
    png = out.with_suffix(".png").read_bytes() if out.with_suffix(".png").exists() else b""
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        problems.append("the PNG is missing or not a PNG")
    else:
        try:
            from PIL import Image
            with Image.open(out.with_suffix(".png")) as im:
                im.verify()
        except ImportError:
            pass
        except Exception as e:
            problems.append(f"the PNG does not open: {e}")
    try:
        import xml.etree.ElementTree as ET
        root = ET.parse(out.with_suffix(".svg")).getroot()
        text = " ".join(t.text or "" for t in root.iter() if t.tag.endswith("text"))
        if spec["title"] not in text:
            problems.append("the SVG does not carry the title as text")
    except Exception as e:
        problems.append(f"the SVG does not open: {e}")
    with open(out.with_suffix(".csv"), newline="", encoding="utf-8") as f:
        data = list(csv.reader(f))[1:]
    if len(data) != spec["rows"]:
        problems.append(f"the data file has {len(data)} rows, the chart {spec['rows']}")
    for i, series in enumerate(spec["drawn"]):
        col = [number(r[1 + i]) for r in data]
        if len(col) != len(series) or any((a is None) != (b is None) or (a is not None and abs(a - b) > 1e-6 * max(1, abs(a))) for a, b in zip(col, series)):
            problems.append(f"series {spec['y'][i]}: the drawn values differ from the data file")
    if spec["kind"] in ("bar", "hbar") and not spec["zero_baseline"]:
        problems.append("a bar chart must start at zero")
    if "Source:" not in spec["caption"] or len(spec["source"].strip()) < 3:
        problems.append("the caption does not say where the data came from")
    if problems:
        print("chart check FAILED: " + "; ".join(problems))
        return 1
    print(f"chart check passed: {out.name}.png, .svg, .csv and .json agree ({spec['rows']} rows, {len(spec['y'])} series).")
    print(f"Caption: {spec['caption']}")
    return 0


def main():
    ap = argparse.ArgumentParser(prog="chart.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("draw")
    d.add_argument("--csv")
    d.add_argument("--db")
    d.add_argument("--sql")
    d.add_argument("--x", required=True, help="the column for categories or time")
    d.add_argument("--y", required=True, action="append", help="the number column (repeat for more series, at most 4)")
    d.add_argument("--kind", default="bar", choices=KINDS + ("pie",))
    d.add_argument("--title", required=True, help="what the chart shows, in words a reader uses")
    d.add_argument("--what", required=True, help="what the numbers are, with units: 'Number of studies', 'Rainfall (mm)'")
    d.add_argument("--source", required=True, help="where the data came from: the file or table, and when")
    d.add_argument("--x-label")
    d.add_argument("--y-label")
    d.add_argument("--sort", default="none", choices=("none", "asc", "desc"))
    d.add_argument("--limit", type=int, default=0)
    d.add_argument("--no-zero", action="store_true", help="line charts only: let the axis start above zero (the caption says so)")
    d.add_argument("--out", required=True, help="path without extension, e.g. charts/studies-by-region")
    c = sub.add_parser("check")
    c.add_argument("out")
    a = ap.parse_args()
    if a.cmd == "check":
        return check(a.out)
    if len(a.y) > 4:
        sys.exit("chart: at most 4 series; make several charts instead")
    if a.no_zero and a.kind != "line":
        sys.exit("chart: --no-zero is for line charts only; bars always start at zero")
    if a.db and not a.sql:
        sys.exit("chart: --db needs --sql")
    return draw(a)


if __name__ == "__main__":
    sys.exit(main())
