#!/usr/bin/env python3
"""Build the two silt pages from the template:
  silt.html          — DK-style standalone page (audio from silt.m4a next to it)
  silt-artifact.html — same page with the audio embedded as a data URI (claude.ai artifact)
usage: python3 build-page.py <dir with silt-page-data.json + silt-112k.m4a>"""
import sys, json, base64, os
D = sys.argv[1]
tpl = open(os.path.join(os.path.dirname(__file__), 'page-template.html')).read()
data = open(os.path.join(D, 'silt-page-data.json')).read()
page = tpl.replace('__DATA__', data)
head = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta property="og:title" content="Das Kollektiv — silt">\n<meta property="og:description" content="HALLMAN × DK — silt. Dub techno with tribal percussion: a minor-seventh stab into a delay that darkens every repeat, a cascara and tom choir in fourths underneath, two basses in conversation. 126 BPM, G minor, 8:10, all jambot. The visualizer reads the score.">\n<meta property="og:url" content="https://daskollektiv.rip/dk020.html">\n<meta property="og:type" content="website">\n'
standalone = head + page.replace('__AUDIO_SRC__', 'silt.m4a').replace('<title>SILT</title>', '<title>Das Kollektiv — silt</title>', 1) + '\n</head>\n</html>\n'
# the template's body elements sit after the head tags; a browser tolerates the head/body split we get here — make it explicit instead:
standalone = standalone.replace('</style>\n<canvas', '</style>\n</head>\n<body>\n<canvas', 1).replace('</script>\n</head>\n</html>\n', '</script>\n</body>\n</html>\n')
open(os.path.join(D, 'silt.html'), 'w').write(standalone)
b64 = base64.b64encode(open(os.path.join(D, 'silt-112k.m4a'), 'rb').read()).decode()
art = page.replace('__AUDIO_SRC__', 'data:audio/mp4;base64,' + b64)
open(os.path.join(D, 'silt-artifact.html'), 'w').write(art)
print('silt.html', len(standalone) // 1024, 'KB; silt-artifact.html', len(art) // 1024 // 1024, 'MB')
