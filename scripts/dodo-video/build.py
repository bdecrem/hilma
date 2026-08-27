#!/usr/bin/env python3
"""Builds the Dodo overview video from storyboard.json.

Pipeline: compose each shot as a 1080x1920 frame in the app's visual
language (butter paper, Fredoka captions, rounded phone screenshot), render
per-shot segments with a gentle push-in, crossfade them together, lay the
jambot music bed underneath, and write out/overview.mp4 + a poster.

To change the video: edit storyboard.json (order, captions, timings),
re-capture frames with capture.sh if the UI changed, re-run music.mjs if
the bed should change, then `python3 build.py`. The result is copied to
public/dodo/tour/overview.mp4 for the website.
"""
import json, math, os, shutil, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

SB = json.load(open('storyboard.json'))
W, H = SB['size']
FPS = SB['fps']
XFADE = SB['xfade']

PAPER = '#FBF5E6'
CARD = '#FFFDF7'
BORDER = '#E3D9C2'
INK = '#33383E'
INK2 = '#606C75'
MARIGOLD = '#DD9420'
FREDOKA = '../../apps/feynd/Feynd/Fonts/Fredoka.ttf'

# Screenshot window inside the canvas (phone aspect 1260x2736 ≈ 0.4605).
SHOT_H = 1400
SHOT_W = int(SHOT_H * 1260 / 2736)         # ≈ 644
SHOT_X = (W - SHOT_W) // 2
SHOT_Y = 116
RADIUS = 64
CAPTION_TOP = SHOT_Y + SHOT_H + 96          # caption band baseline area

os.makedirs('composed', exist_ok=True)
os.makedirs('out', exist_ok=True)


def fredoka(size, weight=600):
    f = ImageFont.truetype(FREDOKA, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def rounded_screenshot(path):
    img = Image.open(path).convert('RGB').resize((SHOT_W, SHOT_H), Image.LANCZOS)
    mask = Image.new('L', (SHOT_W, SHOT_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, SHOT_W - 1, SHOT_H - 1], RADIUS, fill=255)
    return img, mask


def draw_caption(draw, text, color=INK):
    if not text:
        return
    font = fredoka(58, 600)
    # Wrap to at most two lines that fit ~940px.
    words, lines, cur = text.split(), [], ''
    for w in words:
        probe = (cur + ' ' + w).strip()
        if draw.textlength(probe, font=font) <= 940:
            cur = probe
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    y = CAPTION_TOP if len(lines) > 1 else CAPTION_TOP + 40
    for line in lines:
        tw = draw.textlength(line, font=font)
        draw.text(((W - tw) / 2, y), line, font=font, fill=color)
        y += 76


def base_canvas():
    return Image.new('RGB', (W, H), PAPER)


def compose_still(src, caption, out):
    canvas = base_canvas()
    shot, mask = rounded_screenshot(src)
    # Soft shadow behind the phone.
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [SHOT_X - 4, SHOT_Y + 14, SHOT_X + SHOT_W + 4, SHOT_Y + SHOT_H + 26],
        RADIUS + 6, fill=(51, 56, 62, 60))
    canvas.paste(Image.new('RGB', (W, H), PAPER), (0, 0))
    canvas = Image.alpha_composite(canvas.convert('RGBA'),
                                   shadow.filter(ImageFilter.GaussianBlur(22))).convert('RGB')
    canvas.paste(shot, (SHOT_X, SHOT_Y), mask)
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([SHOT_X, SHOT_Y, SHOT_X + SHOT_W - 1, SHOT_Y + SHOT_H - 1],
                        RADIUS, outline=BORDER, width=3)
    draw_caption(d, caption)
    canvas.save(out)


def compose_video_frame(caption, out):
    """Cream frame with a transparent rounded window; the video is overlaid
    underneath it, so it inherits the same rounded-card look."""
    canvas = Image.new('RGBA', (W, H), PAPER)
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([SHOT_X, SHOT_Y, SHOT_X + SHOT_W - 1, SHOT_Y + SHOT_H - 1],
                        RADIUS, fill=(0, 0, 0, 0))
    d.rounded_rectangle([SHOT_X, SHOT_Y, SHOT_X + SHOT_W - 1, SHOT_Y + SHOT_H - 1],
                        RADIUS, outline=BORDER, width=3)
    draw_caption(d, caption)
    canvas.save(out)


def compose_card(kind, caption, out):
    canvas = base_canvas()
    d = ImageDraw.Draw(canvas)
    icon = Image.open('../../public/dodo/appicon-tile.png').convert('RGBA')
    icon = icon.resize((360, 360), Image.LANCZOS)
    im = Image.new('L', icon.size, 0)
    ImageDraw.Draw(im).rounded_rectangle([0, 0, 359, 359], 84, fill=255)
    canvas.paste(icon, ((W - 360) // 2, 560), im)
    word = fredoka(170, 600)
    tw = d.textlength('dodo', font=word)
    d.text(((W - tw) / 2, 980), 'dodo', font=word, fill=INK)
    if kind == 'title':
        sub = fredoka(56, 500)
        t = 'Learn anything.'
        d.text((((W - d.textlength(t, font=sub)) / 2), 1220), t, font=sub, fill=INK2)
    else:
        sub = fredoka(64, 600)
        t = caption or 'dodogo.cc'
        d.text((((W - d.textlength(t, font=sub)) / 2), 1220), t, font=sub, fill=MARIGOLD)
    canvas.save(out)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2000:])
        sys.exit(1)


# ---- 1. compose frames + render per-shot segments -------------------------
segments = []
for i, shot in enumerate(SB['shots']):
    kind = shot.get('kind', 'still')
    secs = shot['secs']
    png = f'composed/{i:02d}.png'
    seg = f'out/seg{i:02d}.mp4'
    frames = int(secs * FPS)

    if kind in ('title', 'outro'):
        compose_card(kind, shot.get('caption'), png)
        run(['ffmpeg', '-y', '-loop', '1', '-t', str(secs), '-i', png,
             '-vf', f'fps={FPS},format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', seg])
    elif kind == 'video':
        compose_video_frame(shot['caption'], png)
        run(['ffmpeg', '-y', '-i', shot['src'], '-i', png,
             '-filter_complex',
             f'color=c=0xFBF5E6:s={W}x{H}:r={FPS}[bg];'
             f'[0:v]scale={SHOT_W}:{SHOT_H},setsar=1[vid];'
             f'[bg][vid]overlay={SHOT_X}:{SHOT_Y}:shortest=1[wv];'
             f'[wv][1:v]overlay=0:0,format=yuv420p[out]',
             '-map', '[out]', '-t', str(secs), '-an',
             '-c:v', 'libx264', '-preset', 'fast', seg])
    else:
        compose_still(shot['src'], shot['caption'], png)
        # Gentle push-in: 1.00 → ~1.035 over the shot.
        run(['ffmpeg', '-y', '-loop', '1', '-t', str(secs), '-i', png,
             '-vf', (f'scale={W * 2}:{H * 2},'
                     f"zoompan=z='min(1.035,1+0.0009*on)':d={frames}"
                     f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},"
                     'format=yuv420p'),
             '-c:v', 'libx264', '-preset', 'fast', seg])
    segments.append((seg, secs))
    print(f'segment {i:02d} ({kind}, {secs}s)')

# ---- 2. crossfade chain + music bed ---------------------------------------
n = len(segments)
inputs = []
for seg, _ in segments:
    inputs += ['-i', seg]
inputs += ['-i', 'music.wav']

graph, off, prev = [], 0.0, '[0:v]'
for i in range(1, n):
    off += segments[i - 1][1] - XFADE
    outl = f'[x{i}]' if i < n - 1 else '[vout]'
    graph.append(f'{prev}[{i}:v]xfade=transition=fade:duration={XFADE}:offset={off:.3f}{outl}')
    prev = outl
total = off + segments[-1][1]
graph.append(f'[{n}:a]atrim=0:{total:.3f},afade=t=in:d=1.2,'
             f'afade=t=out:st={total - 2.6:.3f}:d=2.6,volume=-4dB[aout]')

run(['ffmpeg', '-y', *inputs, '-filter_complex', ';'.join(graph),
     '-map', '[vout]', '-map', '[aout]',
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
     '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
     'out/overview.mp4'])

# Poster from the title card.
Image.open('composed/00.png').convert('RGB').save('out/overview-poster.jpg', quality=88)

# ---- 3. publish into the site ---------------------------------------------
shutil.copy('out/overview.mp4', '../../public/dodo/tour/overview.mp4')
shutil.copy('out/overview-poster.jpg', '../../public/dodo/tour/overview-poster.jpg')
print(f'done — {total:.1f}s → public/dodo/tour/overview.mp4')
