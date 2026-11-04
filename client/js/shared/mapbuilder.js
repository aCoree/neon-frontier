// MapBuilder: erzeugt gleichzeitig Render-Teile und Kollisionskörper (Server + Client teilen dieselbe Welt).
import { mulberry32 } from './util.js';

export class MB {
  constructor(seed) {
    this.rng = mulberry32(seed);
    this.parts = []; this.boxes = []; this.cyls = []; this.props = []; this.holes = [];
    this.spawns = []; this.pickups = []; this.chests = []; this.doors = []; this.switches = [];
    this.movers = []; this.pads = []; this.tele = []; this.lights = []; this.glows = []; this.anims = [];
    this.zonesFx = []; this.labels = []; this.secretSpots = [];
    this._id = 0;
  }
  r(a = 0, b = 1) { return a + this.rng() * (b - a); }
  ri(a, b) { return Math.floor(this.r(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length) % arr.length]; }
  id(p) { return p + (this._id++); }

  // --- Basis-Primitive ---
  // Box: x,z = Mitte; y = Unterkante
  box(m, x, y, z, w, h, d, o = {}) {
    const p = { t: 'b', m, x, y, z, w, h, d };
    if (o.ry) p.ry = o.ry; if (o.rx) p.rx = o.rx; if (o.rz) p.rz = o.rz;
    if (o.tile) p.tile = o.tile; if (o.tint) p.tint = o.tint; if (o.noao) p.noao = 1;
    if (o.dyn) p.dyn = o.dyn; if (o.cast === false) p.nocast = 1;
    this.parts.push(p);
    let c = null;
    if (o.solid !== false && !o.ry && !o.rx && !o.rz) c = this.col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, o);
    p.col = c;
    return p;
  }
  vis(m, x, y, z, w, h, d, o = {}) { return this.box(m, x, y, z, w, h, d, { ...o, solid: false }); }
  col(x0, y0, z0, x1, y1, z1, o = {}) {
    const c = { x0, y0, z0, x1, y1, z1, on: true };
    if (o.noray) c.noray = 1; if (o.nowall) c.nowall = 1; if (o.nogr) c.nogr = 1;
    this.boxes.push(c);
    return c;
  }
  // Zylinder / Kegelstumpf (y = Unterkante)
  cyl(m, x, y, z, r, h, o = {}) {
    const p = { t: 'c', m, x, y, z, r, r2: o.r2 ?? r, h, seg: o.seg || (r > 3 ? 20 : 12) };
    if (o.tile) p.tile = o.tile; if (o.open) p.open = 1; if (o.dyn) p.dyn = o.dyn; if (o.rx) p.rx = o.rx; if (o.rz) p.rz = o.rz; if (o.ry) p.ry = o.ry;
    this.parts.push(p);
    if (o.solid !== false && !o.rx && !o.rz) {
      const c = { cyl: true, cx: x, cz: z, r: Math.max(r, o.r2 ?? r) * (o.crf || 1), x0: x - r, x1: x + r, z0: z - r, z1: z + r, y0: y, y1: y + h, on: true };
      this.cyls.push(c); p.col = c;
    }
    return p;
  }
  visc(m, x, y, z, r, h, o = {}) { return this.cyl(m, x, y, z, r, h, { ...o, solid: false }); }
  sph(m, x, y, z, r, o = {}) {
    const p = { t: 's', m, x, y, z, r, sx: o.sx || 1, sy: o.sy || 1, sz: o.sz || 1 };
    if (o.half) p.half = 1; this.parts.push(p); return p;
  }
  prop(t, x, z, s = 1, rot = 0, y) { this.props.push({ t, x, z, s, rot, y }); }
  label(text, x, y, z, ry = 0, size = 3, color = '#7ee8ff', bg = null) { this.labels.push({ text, x, y, z, ry, size, color, bg }); }
  gable(m, x, y, z, w, d, hRoof = 2.4, alongX = true) { // Satteldach (visuell)
    const half = (alongX ? d : w) / 2, L = Math.hypot(half, hRoof), ang = Math.atan2(hRoof, half);
    for (const sg of [-1, 1]) {
      if (alongX) this.vis(m, x, y + hRoof / 2 - 0.08, z + sg * half / 2, w + 0.9, 0.22, L + 0.5, { rx: sg * ang, noao: 1, tile: 3 });
      else this.vis(m, x + sg * half / 2, y + hRoof / 2 - 0.08, z, L + 0.5, 0.22, d + 0.9, { rz: -sg * ang, noao: 1, tile: 3 });
    }
    // Giebel
    if (alongX) { for (const sg of [-1, 1]) this.vis('plaster', x + sg * (w / 2 - 0.1), y, z, 0.2, hRoof - 0.1, d * 0.6, { noao: 1 }); }
  }
  car(x, z, y, color = 'carRed', rot90 = false) {
    const L = 4.4, W = 1.9;
    const sx = rot90 ? W : L, sz = rot90 ? L : W;
    this.box(color, x, y + 0.35, z, sx, 0.75, sz, { tile: 4 });
    this.vis('glass', x, y + 1.1, z, rot90 ? W - 0.2 : 2.3, 0.62, rot90 ? 2.3 : W - 0.2, { noao: 1 });
    this.vis(color, x, y + 1.72, z, rot90 ? W - 0.1 : 2.1, 0.08, rot90 ? 2.1 : W - 0.1, { noao: 1 });
    for (const a of [-1, 1]) for (const b of [-1, 1]) this.cyl('tire', rot90 ? x + a * (W / 2 - 0.05) : x + b * 1.35, y + 0.0, rot90 ? z + b * 1.35 : z + a * (W / 2 - 0.05), 0.36, 0.3, { solid: false, seg: 10, rz: rot90 ? Math.PI / 2 : 0, rx: rot90 ? 0 : Math.PI / 2 });
  }
  ribbon(m, pts, w, o = {}) { this.parts.push({ t: 'r', m, pts, w, off: o.off ?? 0.07, tile: o.tile || 6 }); }
  light(x, y, z, color, intensity = 1.2, dist = 14, flicker = 0) { this.lights.push({ x, y, z, color, i: intensity, d: dist, f: flicker }); }
  glow(x, y, z, color, size = 2.2, a = 0.9) { this.glows.push({ x, y, z, c: color, s: size, a }); }
  anim(type, o) { this.anims.push({ type, ...o }); }
  spawn(x, z, y, yaw = 0) { this.spawns.push({ x, z, y, yaw }); }
  pickup(kind, item, x, z, y, respawn = 30) { this.pickups.push({ id: this.id('p'), kind, item, x, z, y, respawn }); }
  chest(x, z, y, tier = 1, ry = 0) { if (y === undefined) y = this.terrainY(x, z); const id = this.id('c'); this.chests.push({ id, x, z, y, tier, ry }); this.col(x - 0.6, y, z - 0.45, x + 0.6, y + 0.8, z + 0.45); return id; }
  hole(x0, z0, x1, z1) { this.holes.push({ x0, z0, x1, z1 }); }

  // --- Türen & Schalter ---
  door(o) {
    // o: x,y(unten),z,w,h,d, mat, id, auto, locked, dir('up'|'x'|'z')
    const id = o.id || this.id('d');
    const part = this.box(o.mat || 'techDark', o.x, o.y, o.z, o.w, o.h, o.d, { dyn: 'door:' + id, noao: 1 });
    const d = { id, x: o.x, y: o.y, z: o.z, w: o.w, h: o.h, d: o.d, auto: !!o.auto, locked: !!o.locked, dir: o.dir || 'up', col: part.col, open: false, mat: o.mat };
    this.doors.push(d);
    return d;
  }
  switchObj(o) { // kind lever|button|panel
    const id = o.id || this.id('s');
    const s = { id, x: o.x, y: o.y, z: o.z, ry: o.ry || 0, kind: o.kind || 'panel', targets: o.targets || [], label: o.label || 'Schalter', event: o.event || null, once: !!o.once, color: o.color || 0x4de1ff };
    this.switches.push(s); return s;
  }
  mover(o) { // vertikale Plattform (Aufzug)
    const id = this.id('m');
    const part = this.box(o.mat || 'techWhite', o.x, o.y0, o.z, o.w, o.th || 0.4, o.d, { dyn: 'mover:' + id, noao: 1 });
    const m = { id, x: o.x, z: o.z, w: o.w, d: o.d, y0: o.y0, y1: o.y1, th: o.th || 0.4, speed: o.speed || 3, pause: o.pause ?? 3, phase: o.phase || 0, col: part.col };
    this.movers.push(m); return m;
  }
  pad(x, z, y, vy = 17, vx = 0, vz = 0, r = 1.6) {
    this.pads.push({ x, z, y, vy, vx, vz, r });
    this.cyl('techDark', x, y, z, r, 0.15, { solid: false, seg: 18 });
    this.cyl('neonGreen', x, y + 0.15, z, r * 0.78, 0.04, { solid: false, seg: 18 });
    this.glow(x, y + 0.4, z, 0x66ff88, 3.2, 0.7);
  }

  // --- Zusammengesetzte Strukturen ---
  // Wand entlang x (axis 'x') oder z mit Türöffnungen. Sichtfassade außen + Innenputz innen.
  wall(o) {
    // o: x,z (Mitte der Wand), len, y(unten), h, th, axis('x'|'z'), outMat, inMat, out(+1/-1 Richtung nach außen), gaps:[{c:Mitte-Offset, w, h}]
    const { x, z, len, y, h, th, axis } = o;
    const gaps = (o.gaps || []).slice().sort((a, b) => a.c - b.c);
    const seg = (c0, c1, yy, hh) => { // Intervall entlang der Achse
      const l = c1 - c0; if (l < 0.05 || hh < 0.05) return;
      const cm = (c0 + c1) / 2;
      const px = axis === 'x' ? x + cm : x, pz = axis === 'x' ? z : z + cm;
      const sx = axis === 'x' ? l : th, sz = axis === 'x' ? th : l;
      this.box(o.inMat, px, yy, pz, sx, hh, sz, { noao: o.noao });
      const t2 = 0.12, off = (th / 2 + t2 / 2 - 0.02) * o.out;
      const ox = axis === 'x' ? px : px + off, oz = axis === 'x' ? pz + off : pz;
      this.vis(o.outMat, ox, yy, oz, axis === 'x' ? l : t2, hh, axis === 'x' ? t2 : l, { noao: o.noao, tile: o.tile });
    };
    let cur = -len / 2;
    for (const g of gaps) {
      seg(cur, g.c - g.w / 2, y, h);
      if (g.h < h) seg(g.c - g.w / 2, g.c + g.w / 2, y + g.h, h - g.h);
      cur = g.c + g.w / 2;
    }
    seg(cur, len / 2, y, h);
  }

  // Betretbares Gebäude mit Stockwerken, Treppenhaus, Dachterrasse.
  building(o) {
    const { x, z, w, d, floors = 2, fh = 3.6, base = 0 } = o;
    const outMat = o.mat || 'concrete', inMat = o.inMat || 'plaster';
    const wt = 0.4, top = base + floors * fh + 0.3;
    const stairs = o.stairs ?? (w >= 12 && d >= 8 && floors > 1 || (o.roofAccess && w >= 12));
    // Boden
    this.box(o.floorMat || 'concreteDark', x, base - 0.4, z, w, 0.55, d, { noao: 1 });
    const gaps = { n: [], s: [], e: [], w: [] };
    for (const dr of (o.doors || [{ side: 's' }, { side: 'n' }])) gaps[dr.side].push({ c: dr.off || 0, w: dr.w || 2.8, h: dr.h || 2.9 });
    for (const dr of (o.windows || [])) gaps[dr.side].push({ c: dr.off || 0, w: dr.w || 2.2, h: dr.h || 2.2, y: 0.9 });
    const wallMat = (lvl) => (lvl === 0 && o.baseMat) ? o.baseMat : outMat;
    for (let f = 0; f < floors; f++) {
      const y = base + f * fh + (f === 0 ? 0.15 : 0.3), hh = fh - (f === 0 ? 0.15 : 0.3);
      const om = wallMat(f);
      const g = (s) => (f === 0 ? gaps[s] : (o.upperGaps?.[s] || []));
      // Nord/Süd (Achse x), Ost/West (Achse z)
      this.wall({ x, z: z - d / 2 + wt / 2, len: w, y, h: hh, th: wt, axis: 'x', outMat: om, inMat, out: -1, gaps: g('n'), tile: o.tile });
      this.wall({ x, z: z + d / 2 - wt / 2, len: w, y, h: hh, th: wt, axis: 'x', outMat: om, inMat, out: 1, gaps: g('s'), tile: o.tile });
      this.wall({ x: x - w / 2 + wt / 2, z, len: d - 2 * wt, y, h: hh, th: wt, axis: 'z', outMat: om, inMat, out: -1, gaps: g('w'), tile: o.tile });
      this.wall({ x: x + w / 2 - wt / 2, z, len: d - 2 * wt, y, h: hh, th: wt, axis: 'z', outMat: om, inMat, out: 1, gaps: g('e'), tile: o.tile });
    }
    // Treppen
    const run = 0.62, rise = 0.3, nst = Math.round(fh / rise) - 1; // 11 Stufen + Podest
    const holeLen = nst * run;
    const x0 = x - w / 2 + wt + 1.5, zA = z - d / 2 + wt;
    const laneW = 1.7;
    const holes = []; // [floorIndex, rect]
    if (stairs) {
      for (let f = 0; f < floors; f++) {
        const lane = f % 2, dir = f % 2 === 0 ? 1 : -1;
        const zl = zA + lane * (laneW + 0.1);
        const fy = base + f * fh + (f === 0 ? 0.15 : 0.3);
        for (let k = 1; k <= nst; k++) {
          const sx0 = dir > 0 ? x0 + (k - 1) * run : x0 + holeLen - k * run;
          this.box('stairs', sx0 + run / 2, fy, zl + laneW / 2, run, k * rise, laneW, { noao: 1 });
        }
        holes.push({ f: f + 1, x0, x1: x0 + holeLen, z0: zl, z1: zl + laneW });
      }
      // Geländer-Wand zwischen den Lanes im Dach (nicht nötig)
    }
    // Decken
    for (let f = 1; f <= floors; f++) {
      const yy = base + f * fh;
      const roof = f === floors;
      const mat = roof ? (o.roofMat || 'roofGray') : 'concreteDark';
      const ho = holes.find(h => h.f === f);
      const ix0 = x - w / 2 + wt, ix1 = x + w / 2 - wt, iz0 = z - d / 2 + wt, iz1 = z + d / 2 - wt;
      const th = 0.3;
      if (!ho || (roof && o.roofAccess === false)) {
        this.box(mat, x, yy, z, w, th, d, { noao: 1 });
      } else {
        const rects = [
          [ix0 - wt, iz0 - wt, ho.x0, iz1 + wt], [ho.x1, iz0 - wt, ix1 + wt, iz1 + wt],
          [ho.x0, iz0 - wt, ho.x1, ho.z0], [ho.x0, ho.z1, ho.x1, iz1 + wt],
        ];
        for (const r of rects) { const rw = r[2] - r[0], rd = r[3] - r[1]; if (rw > 0.05 && rd > 0.05) this.box(mat, (r[0] + r[2]) / 2, yy, (r[1] + r[3]) / 2, rw, th, rd, { noao: 1 }); }
      }
      if (!roof && o.lamps !== false) {
        const lx = x + (f % 2 ? 2.5 : -2.5), lz = z + d * 0.15;
        this.vis('lamp', lx, yy - 0.08, lz, 1.6, 0.06, 0.5, { noao: 1 });
        if (f === 1 || f === floors - 1) this.light(lx, yy - 0.6, lz, 0xfff0d8, 0.9, 10);
      }
    }
    if (o.lamps !== false) { this.vis('lamp', x, base + fh - 0.08, z, 1.6, 0.06, 0.5, { noao: 1 }); this.light(x, base + fh - 0.8, z, 0xfff0d8, 1.0, 11); }
    // Dachkante (Brüstung)
    if (o.parapet !== false) {
      const ph = 1.0, pt = 0.3;
      this.box(o.parMat || outMat, x, top, z - d / 2 + pt / 2, w, ph, pt, { tile: o.tile });
      this.box(o.parMat || outMat, x, top, z + d / 2 - pt / 2, w, ph, pt, { tile: o.tile });
      this.box(o.parMat || outMat, x - w / 2 + pt / 2, top, z, pt, ph, d - 2 * pt, { tile: o.tile });
      this.box(o.parMat || outMat, x + w / 2 - pt / 2, top, z, pt, ph, d - 2 * pt, { tile: o.tile });
    }
    return { top, x, z, w, d, base, stairs };
  }

  // Hohes Stufen-Hochhaus: begehbarer Sockel + massiver Schaft.
  tower(o) {
    const b = this.building({ ...o, roofAccess: true, parapet: false });
    const sx = o.w * 0.78, sz = o.d * 0.78;
    let y = b.top;
    const tiers = o.tiers || [{ h: o.height * 0.55, s: 0.78 }, { h: o.height * 0.3, s: 0.56 }, { h: o.height * 0.15, s: 0.34 }];
    // Dachterrasse am Sockel
    const pt = 0.3, ph = 1.1;
    this.box('metalDark', o.x, y, o.z - o.d / 2 + pt / 2, o.w, ph, pt); this.box('metalDark', o.x, y, o.z + o.d / 2 - pt / 2, o.w, ph, pt);
    this.box('metalDark', o.x - o.w / 2 + pt / 2, y, o.z, pt, ph, o.d - 2 * pt); this.box('metalDark', o.x + o.w / 2 - pt / 2, y, o.z, pt, ph, o.d - 2 * pt);
    let cx = o.x + (o.shift || 0), cz = o.z;
    for (const t of tiers) {
      const w = o.w * t.s, d = o.d * t.s;
      this.box(o.towerMat || 'glassTower', cx, y, cz, w, t.h, d, { tile: 12 });
      // Neon-Kante
      this.vis(o.neon || 'neonCyan', cx, y + t.h - 0.2, cz, w + 0.2, 0.2, d + 0.2, { noao: 1 });
      y += t.h;
    }
    const topY = y;
    this.cyl('metalDark', cx, topY, cz, 0.18, 12, { solid: false, seg: 6 });
    this.glow(cx, topY + 12, cz, 0xff3355, 5, 1);
    this.light(cx, topY + 12, cz, 0xff3355, 0.9, 20, 0.6);
    return { ...b, topY };
  }

  // Container
  container(x, z, y, ry, mat) {
    const mats = ['containerRed', 'containerBlue', 'containerGreen', 'containerYellow', 'containerGray'];
    const m = mat || this.pick(mats);
    const w = 6.1, d = 2.45, h = 2.6;
    if (ry) {
      // 90° gedreht -> achsparallel
      this.box(m, x, y, z, d, h, w, { tile: 2.6 });
    } else this.box(m, x, y, z, w, h, d, { tile: 2.6 });
  }

  // Treppenschacht nach unten (zwei Läufe, Ausgang im Westen auf Lane B). Gibt Eckdaten zurück.
  shaft(o) {
    const { x, z, n = 12, flip = false } = o;
    const surf = o.surf ?? 0, run = 0.6, rise = 0.375, w = 3.6, laneW = 1.7;
    const depth = 2 * n * rise, len = n * run, floorY = surf - depth, midY = surf - n * rise;
    const sx0 = x - len / 2 - 1.2, landX = sx0 + len, sx1 = landX + 1.8;
    const F = (v) => (flip ? 2 * x - v : v);           // Spiegelung um x
    const hxa = Math.floor(sx0 / 2) * 2, hxb = Math.ceil(sx1 / 2) * 2;
    const hz0 = Math.floor((z - w / 2 - 0.2) / 2) * 2, hz1 = Math.ceil((z + w / 2 + 0.2) / 2) * 2;
    const hx0 = flip ? 2 * x - hxb : hxa, hx1 = flip ? 2 * x - hxa : hxb;
    this.hole(Math.floor(hx0 / 2) * 2, hz0, Math.ceil(hx1 / 2) * 2, hz1);
    const cxm = (hx0 + hx1) / 2, czm = (hz0 + hz1) / 2, H = depth + 1.2, W = hx1 - hx0;
    this.box('concreteDark', cxm, floorY - 0.6, czm, W + 1, 0.6, hz1 - hz0 + 1);
    this.box('concrete', cxm, floorY, hz0 - 0.2, W + 0.8, H, 0.4);
    this.box('concrete', cxm, floorY, hz1 + 0.2, W + 0.8, H, 0.4);
    const zA = z - w / 2, zB = z + 0.05, zAm = zA + laneW / 2, zBm = zB + laneW / 2;
    const wallX = flip ? hx0 : hx1, exitX = flip ? hx1 : hx0, sgn = flip ? -1 : 1;
    this.box('concrete', wallX + 0.2 * sgn, floorY, czm, 0.4, H, hz1 - hz0); // geschlossene Rückwand
    // Ausgangswand: Lane A voll, Lane B offen (3 m hoch)
    this.box('concrete', exitX - 0.2 * sgn, floorY, (hz0 + zA + laneW + 0.02) / 2, 0.4, depth, (zA + laneW + 0.02) - hz0);
    this.box('concrete', exitX - 0.2 * sgn, floorY + 3.2, (zB + hz1) / 2, 0.4, depth - 3.2, hz1 - zB);
    for (let k = 1; k <= n; k++) { // Lane A: hinab
      const top = surf - k * rise;
      this.box('stairs', F(sx0 + (k - 0.5) * run), floorY, zAm, run, top - floorY, laneW, { noao: 1 });
    }
    this.box('concreteDark', F((landX + sx1) / 2), floorY, czm, sx1 - landX, midY - floorY, w, { noao: 1 });
    for (let k = 1; k <= n; k++) { // Lane B: hinab, zurück
      const top = midY - k * rise;
      this.box('stairs', F(landX - (k - 0.5) * run), floorY, zBm, run, Math.max(0.05, top - floorY), laneW, { noao: 1 });
    }
    const fill = (xa, xb, za, zb) => { // Rand-Füllung bündig mit der Oberfläche (kein Absturz neben der Treppe)
      const lo = Math.min(F(xa), F(xb)), hi = Math.max(F(xa), F(xb));
      if (hi - lo > 0.05 && zb - za > 0.05) this.box('concrete', (lo + hi) / 2, floorY, (za + zb) / 2, hi - lo, surf - floorY, zb - za, { noao: 1 });
    };
    fill(hxa, sx0, hz0, zB); fill(sx1, hxb, hz0, hz1);
    { const lo = Math.min(F(hxa), F(sx0)), hi = Math.max(F(hxa), F(sx0)); if (hi - lo > 0.05) this.box('concrete', (lo + hi) / 2, floorY + 3.2, (zB + hz1) / 2, hi - lo, surf - floorY - 3.2, hz1 - zB, { noao: 1 }); }
    fill(sx0, sx1, hz0, zA); fill(sx0, sx1, zB + laneW, hz1);
    this.light(cxm, floorY + 2.8, czm, 0xffe6b0, 1.1, 12);
    this.glow(cxm, floorY + 2.9, czm, 0xffe6b0, 2.2, 0.6);
    this.vis('lamp', cxm, floorY + 3.0, czm, 1.4, 0.06, 0.4, { noao: 1 });
    return { floorY, surf, hx0, hx1, hz0, hz1, exitX, exitZ: zBm, entX: F(sx0 - 1.5), entZ: zAm };
  }

  // Straße (flaches Band) mit Markierung
  road(x0, z0, x1, z1, w, o = {}) {
    const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const y = o.y ?? 0.04;
    const m = o.mat || 'asphalt';
    this.vis(m, cx, y - 0.04, cz, horiz ? len : w, 0.1, horiz ? w : len, { noao: 1, cast: false });
    if (o.lines !== false) {
      this.vis('roadLine', cx, y + 0.055, cz, horiz ? len : 0.18, 0.015, horiz ? 0.18 : len, { noao: 1, cast: false, tile: 8 });
    }
  }
  fence(x0, z0, x1, z1, h = 2.2, mat = 'metalDark', gap) {
    const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.box(mat, cx, 0, cz, horiz ? len : 0.15, h, horiz ? 0.15 : len, { tile: 2 });
    for (let i = 0; i <= n; i++) { const t = i / n; this.vis('metal', x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.3, h + 0.3, 0.3, { noao: 1 }); }
  }
  lamp(x, z, y = 0, h = 6.5, color = 0xffe2a8, glowIt = true) {
    this.cyl('metalDark', x, y, z, 0.12, h, { solid: false, seg: 6 });
    this.vis('lamp', x, y + h - 0.05, z, 0.9, 0.12, 0.4, { noao: 1 });
    this.col(x - 0.15, y, z - 0.15, x + 0.15, y + h, z + 0.15);
    if (glowIt) { this.glow(x, y + h - 0.3, z, color, 3.2, 0.85); this.light(x, y + h - 0.6, z, color, 1.0, 17); }
  }
  crate(x, z, y, s = 1.2, mat = 'wood', ry = 0) { this.box(mat, x, y, z, s, s, s, { ry, tile: 1.4 }); }
  barrel(x, z, y, mat = 'barrelRed') { this.cyl(mat, x, y, z, 0.45, 1.0, { seg: 10, tile: 1.4 }); }
  jersey(x, z, y, ry90 = false) { this.box('concrete', x, y, z, ry90 ? 0.6 : 3.0, 0.95, ry90 ? 3.0 : 0.6, { tile: 2 }); }
  sandbags(x, z, y, ry90 = false) { this.box('sand', x, y, z, ry90 ? 0.9 : 3, 0.9, ry90 ? 3 : 0.9, { tile: 1 }); }
}
