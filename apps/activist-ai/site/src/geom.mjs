const bez = (p0, p1, p2, p3, n = 40) => {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return pts
}
const chain = (start, segs, n) => {
  let p = start, pts = [start]
  for (const [c1, c2, e] of segs) { pts = pts.concat(bez(p, c1, c2, e, n).slice(1)); p = e }
  return pts
}
const f1 = (v) => Math.round(v * 10) / 10

function brush(pts, o = {}) {
  const base = o.base ?? 26, min = o.min ?? 4, dirMix = o.dirMix ?? 1
  const tin = o.tin ?? 0.1, tout = o.tout ?? 0.14, w0 = o.w0 ?? 0.5, w1 = o.w1 ?? 0.35
  const seed = o.seed ?? 1, wob = o.wob ?? 0.07
  const n = pts.length
  const s = [0]
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const L = s[n - 1]
  const L_ = [], R_ = [], W = []
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
    let tx = b[0] - a[0], ty = b[1] - a[1]
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl
    const t = s[i] / L
    let pr = 1
    if (t < tin) pr = w0 + (1 - w0) * Math.sin((t / tin) * Math.PI / 2)
    else if (t > 1 - tout) pr = w1 + (1 - w1) * Math.cos(((t - (1 - tout)) / tout) * Math.PI / 2)
    if (o.press) pr = o.press(t)
    const down = Math.pow((ty + 1) / 2, 1.4)
    const dir = 1 - dirMix + dirMix * (0.22 + 0.78 * down)
    const noise = 1 + wob * Math.sin(s[i] * 0.045 + seed) + wob * 0.6 * Math.sin(s[i] * 0.11 + seed * 2.3)
    const w = Math.max(min, base * pr * dir * noise)
    const nx = -ty, ny = tx
    const skew = (o.skew ?? 0.06) * w * Math.sin(s[i] * 0.03 + seed)
    L_.push([pts[i][0] + nx * (w / 2 + skew), pts[i][1] + ny * (w / 2 + skew)])
    R_.push([pts[i][0] - nx * (w / 2 - skew), pts[i][1] - ny * (w / 2 - skew)])
    W.push(w)
  }
  const r1 = W[n - 1] / 2, r0 = W[0] / 2
  let d = `M${f1(L_[0][0])} ${f1(L_[0][1])}`
  for (let i = 1; i < n; i++) d += `L${f1(L_[i][0])} ${f1(L_[i][1])}`
  d += `A${f1(r1)} ${f1(r1)} 0 0 0 ${f1(R_[n - 1][0])} ${f1(R_[n - 1][1])}`
  for (let i = n - 2; i >= 0; i--) d += `L${f1(R_[i][0])} ${f1(R_[i][1])}`
  d += `A${f1(r0)} ${f1(r0)} 0 0 0 ${f1(L_[0][0])} ${f1(L_[0][1])}Z`
  return d
}
function spiralO(cx, cy) {
  const pts = [], rot = (11 * Math.PI) / 180, N = 170
  const a0 = (-38 * Math.PI) / 180, a1 = a0 - 2 * Math.PI - (34 * Math.PI) / 180
  for (let i = 0; i <= N; i++) {
    const k = i / N, a = a0 + (a1 - a0) * k
    const rx = 70 + 5 * k, ry = 93 - 9 * k
    const x = rx * Math.cos(a), y = ry * Math.sin(a)
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)])
  }
  return pts
}

export { bez, chain, f1, brush, spiralO }
