// A/V sync: per-frame luma spikes (kick flash + shockwave births) vs audio low-band onsets, in the muxed file.
const { execSync } = require('child_process'); const fs = require('fs');
const out = execSync(`ffmpeg -v error -i dk019-30s.mp4 -vf "scale=192:108,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>/dev/null | grep YAVG`).toString();
const y = out.trim().split('\n').map(l => parseFloat(l.split('=')[1]));
execSync('ffmpeg -v error -y -i dk019-30s.mp4 -vn -ac 1 -ar 8000 -f s16le mux8k.raw');
const b = fs.readFileSync('mux8k.raw'); const sr = 8000, fps = 60;
const a = Math.exp(-2*Math.PI*120/sr); let lp = 0; const nF = Math.min(y.length, Math.floor(b.length/2/(sr/fps)));
const low = new Float64Array(nF);
for (let f = 0; f < nF; f++) { let s = 0; const s0 = Math.round(f*sr/fps), s1 = Math.round((f+1)*sr/fps); for (let i = s0; i < s1; i++) { const v = b.readInt16LE(i*2)/32768; lp = a*lp + (1-a)*v; s += lp*lp; } low[f] = s/(s1-s0); }
// onset-ish signals: positive deltas
const dy = y.map((v,i) => Math.max(0, v - (y[i-1] ?? v))); const da = Array.from(low).map((v,i) => Math.max(0, v - (low[i-1] ?? v)));
function corr(lag) { let n=0,sx=0,sy=0,sxx=0,syy=0,sxy=0; for (let i = 0; i < nF; i++) { const j = i + lag; if (j < 0 || j >= nF) continue; const p = dy[i], q = da[j]; n++; sx+=p; sy+=q; sxx+=p*p; syy+=q*q; sxy+=p*q; } return (n*sxy - sx*sy)/Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy)); }
const lags = []; for (let l = -12; l <= 12; l++) lags.push([l, corr(l)]);
lags.sort((p,q) => q[1]-p[1]);
console.log('frames', y.length, 'audio frames', nF);
console.log('best lags (video-vs-audio, frames @60fps):', lags.slice(0,4).map(([l,c]) => `${l}:${c.toFixed(3)}`).join('  '));
console.log('corr at lag 0:', corr(0).toFixed(3), ' lag +6:', corr(6).toFixed(3), ' lag -6:', corr(-6).toFixed(3));
// mean luma per segment
const segs = [['A',0,6.62],['B1',6.62,13.58],['B2',13.58,19.0],['C',19.0,28.0],['end',28,30]];
for (const [n,t0,t1] of segs) { const s = y.slice(Math.floor(t0*fps), Math.floor(t1*fps)); console.log(`${n} mean luma ${(s.reduce((p,q)=>p+q,0)/s.length).toFixed(2)} max ${Math.max(...s).toFixed(1)}`); }
