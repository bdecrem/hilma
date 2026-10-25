const sharp = require(process.cwd() + '/node_modules/sharp');
const fs = require('fs');
const [svgPath, out] = process.argv.slice(2);
const art = fs.readFileSync(svgPath, 'utf8');
const inner = art.replace(/^[\s\S]*?<title>.*?<\/title>/, '').replace(/<\/svg>\s*$/, '');
const noStaff = inner.replace(/<g id="staff"[\s\S]*?<\/g>/, '');
// iOS: full bleed, the OS masks it.
const ios = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
// macOS: the art scaled into the 824 body (100 margin each side), radius 185, clipped.
const mac = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><clipPath id="c"><rect x="100" y="100" width="824" height="824" rx="185" ry="185"/></clipPath></defs>
<g clip-path="url(#c)"><g transform="translate(100 100) scale(${824/1024})">${body}</g></g></svg>`;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await sharp(Buffer.from(ios), { density: 72 }).flatten({ background: '#0D0D0D' }).removeAlpha().png().toFile(`${out}/icon-1024.png`);
  const images = [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }];
  for (const pt of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
    const px = pt * scale, name = `mac-${pt}@${scale}x.png`;
    const svg = mac(px <= 32 ? noStaff : inner);
    await sharp(Buffer.from(svg), { density: 72 * px / 1024 * 4 }).resize(px, px).png().toFile(`${out}/${name}`);
    images.push({ filename: name, idiom: 'mac', scale: `${scale}x`, size: `${pt}x${pt}` });
  }
  fs.writeFileSync(`${out}/Contents.json`, JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
})();
