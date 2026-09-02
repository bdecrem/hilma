const fs = require('fs');
const buf = fs.readFileSync('dk019.wav');
let p = 12, fmt = null, dataOff = 0, dataLen = 0;
while (p < buf.length) { const id = buf.toString('ascii', p, p+4); const len = buf.readUInt32LE(p+4);
  if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p+10), sr: buf.readUInt32LE(p+12), bits: buf.readUInt16LE(p+22) };
  if (id === 'data') { dataOff = p+8; dataLen = len; break; } p += 8 + len + (len & 1); }
const { ch, sr } = fmt; const n = Math.floor(dataLen / (2*ch));
// exact 1ms bins: bin h covers samples [round(h*sr/1000), round((h+1)*sr/1000))
const nh = Math.floor(n*1000/sr);
const eLow = new Float32Array(nh), eAll = new Float32Array(nh);
const a = Math.exp(-2*Math.PI*120/sr); let lp = 0;
for (let h = 0; h < nh; h++) { const s0 = Math.round(h*sr/1000), s1 = Math.round((h+1)*sr/1000); let sl = 0, sa = 0;
  for (let i = s0; i < s1; i++) { const o = dataOff + i*2*ch; const m = (buf.readInt16LE(o) + buf.readInt16LE(o+2)) / 65536;
    lp = a*lp + (1-a)*m; sl += lp*lp; sa += m*m; }
  eLow[h] = sl/(s1-s0); eAll[h] = sa/(s1-s0); }
fs.writeFileSync('env-1ms.json', JSON.stringify({ low: Array.from(eLow).map(v=>+v.toExponential(3)), all: Array.from(eAll).map(v=>+v.toExponential(3)) }));
const dk = JSON.parse(fs.readFileSync('dkdata.json'));
const kicks = [];
for (const f of dk.kicks) { const c = Math.round(f/dk.fps*1000); let best = -1, bs = -Infinity;
  for (let m = c-40; m <= c+40; m++) { if (m < 8 || m+8 >= nh) continue; let after=0, before=0; for (let i=1;i<=6;i++){ after+=eLow[m+i]; before+=eLow[m-i]; } const rise = after-before; if (rise > bs) { bs = rise; best = m; } }
  kicks.push(best/1000); }
fs.writeFileSync('kicks-ms.json', JSON.stringify(kicks));
function fit(t0, t1, label, beatGuess) {
  const ks = kicks.filter(t => t >= t0 && t < t1);
  const idx = [0]; for (let i = 1; i < ks.length; i++) idx.push(idx[i-1] + Math.max(1, Math.round((ks[i]-ks[i-1])/beatGuess)));
  let keep = ks.map(() => true), slope, icpt;
  for (let pass = 0; pass < 4; pass++) { let N=0,sx=0,sy=0,sxx=0,sxy=0;
    for (let i=0;i<ks.length;i++){ if(!keep[i]) continue; N++; sx+=idx[i]; sy+=ks[i]; sxx+=idx[i]*idx[i]; sxy+=idx[i]*ks[i]; }
    slope = (N*sxy - sx*sy)/(N*sxx - sx*sx); icpt = (sy - slope*sx)/N;
    keep = ks.map((t,i) => Math.abs(t - (icpt + slope*idx[i])) < (pass<2?0.02:0.008)); }
  const res = ks.map((t,i) => Math.abs(t - (icpt + slope*idx[i]))*1000).sort((a,b)=>a-b);
  console.log(`${label}: n=${ks.length} beat=${slope.toFixed(6)} (${(60/slope).toFixed(4)} BPM) phase=${icpt.toFixed(4)} | resid ms p50=${res[res.length>>1].toFixed(1)} p90=${res[Math.floor(res.length*0.9)].toFixed(1)} inliers<8ms=${keep.filter(Boolean).length}`);
  return { slope, icpt };
}
const M1 = fit(26.3, 289, 'M1', 0.4138);
const M2 = fit(289.8, 439.5, 'M2', 0.4348);
const M3 = fit(551.9, 838.5, 'M3', 0.4478);
fs.writeFileSync('grid.json', JSON.stringify({M1,M2,M3}));
const dB = (v) => (10*Math.log10(v+1e-12)).toFixed(0);
function table(t0,t1,step){ let s=''; for (let ms=Math.round(t0*1000); ms<t1*1000; ms+=step){ let a=0,l=0; for(let i=0;i<step;i++){a+=eAll[ms+i]||0; l+=eLow[ms+i]||0;} s+=`${(ms/1000).toFixed(2)}:${dB(a/step)}/${dB(l/step)} `; } return s; }
console.log('brake region all/low dB @20ms:\n'+table(549.4, 553.2, 20));
console.log('ending all/low dB @50ms:\n'+table(836.0, 840.58, 50));
// M2 bar phase candidates: which of the 4 beats is the downbeat? fold env.high/mid onsets (bells, lows) into 16 steps of a bar for phase candidates 0..3 and print mean of env.mid/high per step (dkdata frames)
const env=dk.env, fps=dk.fps;
for (const off of [0,1,2,3]) { const barT = 4*M2.slope, ph = M2.icpt + off*M2.slope; const acc = new Array(16).fill(0), cnt = new Array(16).fill(0);
  for (let f=Math.round(300*fps); f<Math.round(438*fps); f++){ const t=f/fps; const pos=((t-ph)/barT)%1; const st=Math.floor(pos*16); acc[st]+=env.high[f]; cnt[st]++; }
  console.log(`M2 phase+${off} beats: high per 16th:`, acc.map((v,i)=>(v/cnt[i]).toFixed(0)).join(' ')); }
for (const off of [0,1,2,3]) { const barT = 4*M2.slope, ph = M2.icpt + off*M2.slope; const acc = new Array(16).fill(0), cnt = new Array(16).fill(0);
  for (let f=Math.round(300*fps); f<Math.round(438*fps); f++){ const t=f/fps; const pos=((t-ph)/barT)%1; const st=Math.floor(pos*16); acc[st]+=env.mid[f]; cnt[st]++; }
  console.log(`M2 phase+${off} beats: mid per 16th: `, acc.map((v,i)=>(v/cnt[i]).toFixed(0)).join(' ')); }
