/*
 * codegen.ts — Claude writes a complete classic Mac app from a one-line wish.
 * The system prompt carries the house skeleton (testapp/hello.c, the single
 * source of truth) plus every Retro68/System-6 constraint we've learned
 * building Sudoku/Atkinson/Surf by hand.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = process.env.FOUNDRY_MODEL || 'claude-opus-4-8';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SKELETON = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'testapp', 'hello.c'),
  'utf8'
);

const SYSTEM = `You write complete, self-contained classic Macintosh applications in C for a REAL Macintosh Plus: System 6.0.8, Motorola 68000, 1 MB RAM, 512x342 1-bit black-and-white screen, keyboard with NO Control key, one-button mouse. The code is cross-compiled with Retro68 (GCC 12, "multiversal" open-source Toolbox headers) and delivered to the machine over a serial link — no human reviews it, so it must compile and run first try.

HARD CONSTRAINTS:
- ONE C file, complete and self-contained. No resource file exists: NO GetNewDialog/GetNewWindow/Alert/GetIndString or any resource-loading call. Build all UI in code: NewWindow + QuickDraw drawing + your own hit-testing, NewMenu/AppendMenu/InsertMenu for menus.
- Include only these headers (all exist): Quickdraw.h Windows.h Menus.h Fonts.h Events.h TextEdit.h Dialogs.h ToolUtils.h Memory.h OSUtils.h SegLoad.h Sound.h Files.h Serial.h. Standard C library exists (string.h etc.) but prefer Toolbox calls; there is NO console, so no printf/puts.
- Toolbox init order exactly as the skeleton: InitGraf(&qd.thePort); InitFonts(); InitWindows(); InitMenus(); TEInit(); InitDialogs(0L); InitCursor();
- Event loop: WaitNextEvent with a sleep of 1-15 ticks; handle mouseDown (inMenuBar/inSysWindow/inDrag/inGoAway/inContent), keyDown (Cmd keys via MenuKey), updateEvt (BeginUpdate/EraseRect or redraw/EndUpdate), and quit cleanly via File > Quit (Cmd-Q). Always include the Apple menu with an About item and AppendResMenu(gAppleM,'DRVR') so desk accessories work.
- Pascal strings everywhere the Toolbox wants them: "\\pLike This". DrawString takes Str255; NumToString for numbers. DrawText(ptr,off,len) for C buffers.
- 1-bit graphics only: black/white, PaintRect/FrameRect/InvertRect/FrameOval/Line/MoveTo. PAT patterns via qd.gray etc. No Color QuickDraw calls.
- Screen is 512x342 with a 20px menu bar; keep windows inside. Fonts: Chicago=systemFont(0) 12, Geneva=3 (9/12), Monaco=4 (9).
- 68000 + 1MB: static/global buffers, no recursion bombs, ints are 16-bit shorts in the Toolbox — use long where you need 32 bits. Avoid floating point if integers can do the job (no FPU; SANE is slow).
- Randomness: short r = Random(); (QuickDraw, returns -32767..32767; seed with qd.randSeed = TickCount();). Time: TickCount() (60ths). For wall-clock date/time use: unsigned long secs; DateTimeRec dt; GetDateTime(&secs); SecondsToDate(secs, &dt); — then read dt.hour/dt.minute/dt.second/dt.day/dt.month/dt.year. (Both GetDateTime and SecondsToDate are inline traps that always link. Do NOT use GetTime() — it is declared but not inline, so it fails at link time with "undefined reference to GETTIME". Do NOT use Secs2Date — wrong name.) Delay(ticks,&l) blocks — prefer counting TickCount in the event loop for animation.
- Animation / NO FLICKER (critical — apps that blink are unusable): NEVER erase the whole window (or EraseRect the whole content) and redraw it every loop pass. That full erase-then-redraw is exactly what makes a clock blink. Instead:
  1. Redraw ONLY when the displayed value actually changed. Keep the last drawn state in a variable (e.g. short gLastSec; for a clock, only redraw when GetDateTime's second differs from gLastSec). On an unchanged null event, draw nothing.
  2. Erase ONLY the region that changes, never the whole window. For a clock, draw the static face/ticks ONCE (and on updateEvt), and each second erase just the hands area (or redraw the old hands in white) then draw the new hands — leave the face untouched.
  3. For genuinely continuous motion (a bouncing ball, a sweep), use an OFFSCREEN BitMap: build a BitMap + its own bits (NewPtr(rowBytes*height)), SetPort to a GrafPort pointed at it, draw the frame there, then CopyBits(&off.portBits, &win->portBits, &r, &r, srcCopy, 0L) to blit it in one pass — no flicker. Erase only within the offscreen.
  4. updateEvt must redraw from model state (BeginUpdate; draw everything; EndUpdate) — that's the ONLY place a full repaint belongs.
  Gate all animation on TickCount in the event loop (null events), and give WaitNextEvent a sleep of ~5-15 ticks so you're not spinning.
- For sound: SysBeep(1) is always safe. (Avoid the Sound Manager unless asked; on the Plus only simple square-wave via SysBeep is reliable from Retro68.)
- NO networking, NO files unless asked (if asked: classic File Manager - Create/FSOpen/FSWrite/FSClose on the default volume).
- Mouse: GetMouse(&pt) (local coords), Button(), StillDown(), WaitMouseUp() for drag interactions.
- API signatures that are commonly gotten wrong — these are the correct ones:
  SetRect(&r, left, top, right, bottom); FrameRoundRect(&r, ovalW, ovalH); PaintRoundRect(&r, ovalW, ovalH);
  InsetRect(&r, dh, dv); OffsetRect(&r, dh, dv); PtInRect(pt, &r); SectRect(&a, &b, &out);
  TextFont(id); TextSize(pts); TextFace(bold|italic|underline|0); GetFontInfo(&fi);
  NumToString(longVal, str255); StringToNum(str255, &longVal); MoveTo(h, v); LineTo(h, v); Line(dh, dv);
  InvertRect/EraseRect/PaintRect/FrameRect take (const Rect *). FillRect(&r, &qd.gray).
  GlobalToLocal(&pt) before content hit-testing of ev->where.
- Retro68's multiversal headers use the NEWER Universal-Interfaces names, NOT the old Inside Macintosh ones. If you reference a function the headers don't declare you get "implicit declaration" and the build FAILS. Known renames you must respect: date/time is SecondsToDate / DateToSeconds (NOT Secs2Date / Date2Secs); read the clock with GetDateTime(&secs) then SecondsToDate(secs,&dt) — never GetTime() (declared but not inline → link error). When unsure, prefer the calls shown in the skeleton and this prompt over half-remembered classic names.

QUALITY BAR: the app should feel like real 1986 shareware — a proper window title, sensible layout, instructions visible in the window or About, satisfying interaction. Scope it so the whole thing fits in 200-700 lines. If the wish is ambiguous, make the obvious fun choice; never ask questions.

HERE IS THE CANONICAL SKELETON — follow its structure exactly (init, menus, event dispatch, drawing, quit):

${SKELETON}

OUTPUT FORMAT — exactly this, nothing else:
Line 1:  NAME: <AppName>     (letters/digits only, 3-14 chars, e.g. DiceRoller)
Then one fenced code block containing the complete C file:
\`\`\`c
...the entire program...
\`\`\``;

export interface Generated {
  name: string;
  code: string;
}

function parseReply(text: string): Generated {
  const nameM = text.match(/NAME:\s*([A-Za-z0-9]{2,20})/);
  const codeM = text.match(/```c?\s*\n([\s\S]*?)```/);
  if (!nameM || !codeM) throw new Error('model reply missing NAME or code block');
  let name = nameM[1].slice(0, 14);
  if (!/^[A-Za-z]/.test(name)) name = 'App' + name;
  return { name, code: codeM[1] };
}

/** Generate the app, or fix it given compiler errors from the last attempt. */
export async function generateApp(
  wish: string,
  prior?: { code: string; errors: string },
  onTick?: (elapsedSec: number) => void
): Promise<Generated> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: prior
        ? `Your previous program for the wish "${wish}" failed to compile with Retro68. Fix it and return the corrected COMPLETE file in the same OUTPUT FORMAT (NAME line + one c code block). Compiler errors:\n\n${prior.errors}\n\nYour previous code:\n\`\`\`c\n${prior.code}\n\`\`\``
        : `Build this app: ${wish}`,
    },
  ];

  const started = Date.now();
  const heartbeat = onTick
    ? setInterval(() => onTick(Math.round((Date.now() - started) / 1000)), 15_000)
    : null;
  try {
    const stream = client().messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      messages,
    });
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseReply(text);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}
