/* generate porthole/test_frame.h (packed 1bpp, for PORT_TEST) and
 * porthole/test_frame_z.h (the real 'F' frame, node deflateSync, for rxtest). */
import { go, shot, CW, CH, CRB, shutdown } from './browser.ts';
import { frameFull } from './frame.ts';
import { writeFileSync } from 'node:fs';
function carr(name: string, buf: Uint8Array): string {
  let s = `static unsigned char ${name}[${buf.length}] = {\n`;
  for (let i = 0; i < buf.length; i++) s += (i % 16 === 0 ? '  ' : '') + buf[i] + (i < buf.length - 1 ? ',' : '') + (i % 16 === 15 ? '\n' : '');
  return s + '\n};\n';
}
async function main() {
  const title = await go('file://' + process.cwd() + '/test/test.html');
  const packed = await shot();
  const frame = frameFull(packed, CW, CH, CRB);
  writeFileSync('../porthole/test_frame.h',
    `/* generated: dither of test/test.html, 512x300 1bpp */\n#define PORT_TEST_W ${CW}\n#define PORT_TEST_H ${CH}\n#define PORT_TEST_RB ${CRB}\n` + carr('gTestFrame', packed));
  writeFileSync('../porthole/test_frame_z.h',
    `/* generated: real 'F' frame (node deflateSync) of the same render, for rxtest */\n` + carr('gTestFrameZ', frame));
  console.log('wrote test_frame.h (packed', packed.length, ') + test_frame_z.h (frame', frame.length, ') title:', title);
  await shutdown();
}
main();
