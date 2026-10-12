import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'Dodo motion: explainer videos the Claude Motion way';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Bundled font (./fonts): this image is prerendered at build time, and a
// Google Fonts fetch has failed builds before. Never fetch here.
async function loadFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), 'src/app/dodo-motion/fonts', file));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

const PAPER = '#f7efdf';
const INK = '#16121c';
const RED = '#ff4b1f';
const BLUE = '#3d3bff';

// The seven scenes of "One unit apart" as a strip, widths = durations.
const SCENES: { d: number; blue?: boolean }[] = [{ d: 5 }, { d: 7 }, { d: 8 }, { d: 7 }, { d: 6 }, { d: 8, blue: true }, { d: 4 }];
const TOTAL = SCENES.reduce((a, s) => a + s.d, 0);

export default async function OgImage() {
  const bricolage = await loadFont('BricolageGrotesque-800.ttf');
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: PAPER,
          color: INK,
          padding: '64px 72px 56px',
          fontFamily: 'Bricolage',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: '0.16em', color: 'rgba(22,18,28,0.7)' }}>
            DODO MOTION
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontSize: 92,
              lineHeight: 0.98,
              letterSpacing: '-0.03em',
              maxWidth: 1000,
            }}
          >
            Explainer videos, the Claude Motion way.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 8, height: 76 }}>
            {SCENES.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  width: `${(s.d / TOTAL) * 100}%`,
                  borderRadius: 10,
                  border: `4px solid ${s.blue ? BLUE : INK}`,
                  background: s.blue ? BLUE : '#fff',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, fontSize: 26, color: 'rgba(22,18,28,0.7)' }}>
            <div style={{ display: 'flex' }}>
              <span style={{ color: RED }}>Storyboard first.</span>
              <span style={{ marginLeft: 14 }}>One script holds every word, number and timing.</span>
            </div>
            <div style={{ display: 'flex' }}>ola.cx/dodo-motion</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Bricolage', data: bricolage, weight: 800, style: 'normal' }],
    },
  );
}
