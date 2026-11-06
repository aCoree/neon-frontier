// Z-Fighting-Korrektur: Wo zwei Flächen verschiedener Materialien exakt in derselben Ebene liegen und sich überlappen (Dach + Neonstreifen,
// Straße + Markierung, Sockel + Boden …), kann die Grafikkarte nicht entscheiden, welche vorne liegt – es flackert. Beim Laden wird jede Gruppe gestaffelt:
// Neon/Markierungen und kleinere Flächen bleiben, die größere Basisfläche wird je Stufe 3 cm nach INNEN gesetzt (Details werden also nie begraben).
// Gleiche Materialien bleiben unberührt (dort ist kein Unterschied sichtbar).
// Nur Darstellung – die Kollision bleibt unverändert.
const EPS = 0.03, MAX_LEVEL = 3;
const TOP_MATS = /^(neon|roadLine|glow|lamp|decal|sign)/i;   // Auflagen, die immer oben liegen sollen

function faces(p) {
  const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, y0 = p.y, y1 = p.y + p.h, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
  return [
    { ax: 'y', dir: 1, pl: y1, a0: x0, a1: x1, b0: z0, b1: z1 }, { ax: 'y', dir: -1, pl: y0, a0: x0, a1: x1, b0: z0, b1: z1 },
    { ax: 'x', dir: 1, pl: x1, a0: y0, a1: y1, b0: z0, b1: z1 }, { ax: 'x', dir: -1, pl: x0, a0: y0, a1: y1, b0: z0, b1: z1 },
    { ax: 'z', dir: 1, pl: z1, a0: x0, a1: x1, b0: y0, b1: y1 }, { ax: 'z', dir: -1, pl: z0, a0: x0, a1: x1, b0: y0, b1: y1 },
  ];
}
const overlap = (a, b) => Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0) > 0.05 && Math.min(a.b1, b.b1) - Math.max(a.b0, b.b0) > 0.05;
const area = (f) => (f.a1 - f.a0) * (f.b1 - f.b0);
const prio = (f) => (TOP_MATS.test(f.p.m) ? 0 : 1e9) + area(f);   // klein = Detail (bleibt); groß = Basis (wird nach innen gesetzt)

// Fläche des Teils um d nach INNEN setzen (nie dünner als 5 cm). Dünne Teile werden verschoben, dicke gekürzt.
function push(p, ax, dir, d) {
  if (ax === 'y') {
    if (dir > 0) { if (p.h <= 0.35) p.y -= d; else if (p.h - d > 0.05) p.h -= d; }
    else if (p.h - d > 0.05) { p.y += d; p.h -= d; }
  } else if (ax === 'x') { if (p.w - d > 0.05) { p.w -= d; p.x -= dir * d / 2; } }
  else if (p.d - d > 0.05) { p.d -= d; p.z -= dir * d / 2; }
}

export function fixCoplanar(parts) {
  const boxes = parts.filter(p => p.t === 'b' && !p.rx && !p.ry && !p.rz && !p.dyn && !p._zf);
  const all = []; for (const p of boxes) for (const f of faces(p)) { f.p = p; all.push(f); }
  const want = new Map();   // Fläche → höchste Stufe
  for (const shift of [0, 0.5]) {   // zwei versetzte Rasterungen, damit knapp getrennte Ebenen nie durchs Raster fallen
    const buckets = new Map();
    for (const f of all) { const k = f.ax + f.dir + ':' + Math.floor(f.pl * 40 + shift); (buckets.get(k) || buckets.set(k, []).get(k)).push(f); }
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const seen = new Set();
      for (const s of list) {
        if (seen.has(s)) continue; const grp = [s], q = [s]; seen.add(s);
        while (q.length) { const c = q.pop(); for (const o of list) if (!seen.has(o) && o.p !== c.p && Math.abs(o.pl - c.pl) < 0.012 && overlap(c, o)) { seen.add(o); grp.push(o); q.push(o); } }
        if (new Set(grp.map(f => f.p.m)).size < 2) continue;   // nur gleiche Materialien → kein sichtbarer Unterschied
        grp.sort((a, b) => prio(a) - prio(b));   // Details zuerst (bleiben), Basis später (wird gestaffelt nach innen gesetzt)
        let level = 0, lastMat = grp[0].p.m;
        for (let i = 1; i < grp.length; i++) {
          if (grp[i].p.m !== lastMat) { level = Math.min(MAX_LEVEL, level + 1); lastMat = grp[i].p.m; }
          if (level > 0) { const cur = want.get(grp[i]); if (!cur || cur.level < level) want.set(grp[i], { f: grp[i], level }); }
        }
      }
    }
  }
  for (const { f, level } of want.values()) push(f.p, f.ax, f.dir, EPS * level);
  for (const p of boxes) p._zf = 1;
  return want.size;
}
