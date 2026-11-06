// Weltdaten für NEON FRONTIER: Gelände, Zonen, alle Bauwerke (Render-Teile + Kollisionen).
// Rein datenbasiert, deterministisch (fester Seed) – Server und Client erzeugen exakt dieselbe Welt.
import { MB } from './mapbuilder.js';
import { fbm, lerp, smoothstep, clamp } from './util.js';
import { buildCityArea } from './locs_city.js';
import { buildIndustryMilitary } from './locs_industry.js';
import { buildWilds } from './locs_wilds.js';
import { buildArena } from './map_arena.js';

// Verfügbare Karten. Ranked (und 1-gegen-1) läuft auf der Arena; die Weltkarte ist für alles andere.
export const MAP_LIST = [
  { id: 'frontier', name: 'Neon Frontier', desc: 'Die große offene Welt mit Stadt, Wald, Küste und Fort.', size: 'Groß' },
  { id: 'arena',    name: 'Arena Zero',    desc: 'Kompakte Neon-Arena für Duelle und kleine Teams – kurze Wege, klare Linien.', size: 'Klein' },
];
export const MAP_IDS = MAP_LIST.map(x => x.id);

export const SEA_LEVEL = -1.0;

export const ZONES = [
  { id: 'city',       name: 'Neon Heights',     cx: 0,    cz: -100, rx: 84, rz: 74, h: 0.4,  amb: 'city' },
  { id: 'industrial', name: 'Ironworks',        cx: 118,  cz: 18,   rx: 56, rz: 66, h: 0.8,  amb: 'industry' },
  { id: 'military',   name: 'Fort Helios',      cx: 128,  cz: -120, rx: 56, rz: 46, h: 3.0,  amb: 'base' },
  { id: 'coast',      name: 'Saltwind Bay',     cx: 0,    cz: 112,  rx: 90, rz: 30, h: 0.8,  amb: 'coast' },
  { id: 'training',   name: 'Proving Grounds',  cx: -112, cz: 96,   rx: 28, rz: 22, h: 0.9,  amb: 'wind' },
  { id: 'station',    name: 'Aurora Station',   cx: -135, cz: -98,  rx: 34, rz: 30, h: 13.0, amb: 'wind' },
  { id: 'forest',     name: 'Whisper Forest',   cx: -112, cz: 14,   rx: 60, rz: 70, h: null, amb: 'forest' },
  { id: 'caveA',      name: 'Crystal Caves',    cx: -150, cz: 0,    rx: 12, rz: 9,  h: 5.0,  amb: 'forest', hidden: 1 },
  { id: 'caveB',      name: 'Crystal Caves',    cx: -146, cz: -60,  rx: 12, rz: 9,  h: 5.0,  amb: 'forest', hidden: 1 },
  { id: 'meadow',     name: 'Heartland',        cx: 8,    cz: 18,   rx: 62, rz: 60, h: null, amb: 'wind' },
];
const FLAT = ZONES.filter(z => z.h !== null);
export const LAKE = { x: -92, z: 66, r: 15 };

export function zoneNorm(z, x, zz) { return Math.hypot((x - z.cx) / z.rx, (zz - z.cz) / z.rz); }
export function zoneAt(x, z) {
  let best = null, bn = 1.0;
  for (const zn of ZONES) { const n = zoneNorm(zn, x, z); if (n < bn) { bn = n; best = zn; } }
  return best;
}

export function terrainY(x, z) {
  let h = (fbm(x * 0.011 + 5.3, z * 0.011 + 1.7, 3) - 0.5) * 17 + (fbm(x * 0.045 + 9, z * 0.045 + 4, 3) - 0.5) * 3.4;
  if (h < 2) h = 2 - (2 - h) * 0.14; // flache Täler statt tiefer Senken
  // Küste
  const sp = 0.8 - smoothstep(128, 162, z) * 9.8;
  h = lerp(h, sp, smoothstep(104, 126, z));
  // See
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = lerp(h, -2.8, 1 - smoothstep(LAKE.r * 0.6, LAKE.r * 1.25, dl));
  // Plateaus
  for (const zn of FLAT) {
    const m = 1 - smoothstep(0.86, 1.4, zoneNorm(zn, x, z));
    if (m > 0) h = lerp(h, zn.h, m * m * (3 - 2 * m));
  }
  // Randgebirge (Norden, Osten, Westen)
  const edge = z < 0 ? Math.max(Math.abs(x), -z) : Math.abs(x);
  const mm = smoothstep(150, 200, edge);
  if (mm > 0) h += mm * mm * (30 + fbm(x * 0.03, z * 0.03, 3) * 34) * smoothstep(0.9, 1.4, minFlatNorm(x, z));
  return h;
}
function minFlatNorm(x, z) { let m = 9; for (const zn of FLAT) m = Math.min(m, zoneNorm(zn, x, z)); return m; }

export function grassMask(x, z) {
  const zn = zoneAt(x, z);
  let d = 0.55;
  if (zn) d = { forest: 1, meadow: 0.95, coast: 0.2, city: 0, industrial: 0, military: 0, training: 0.1, station: 0.5 }[zn.id] ?? 0.5;
  else {
    const f = ZONES.find(q => q.id === 'forest'), m = ZONES.find(q => q.id === 'meadow');
    d = Math.min(zoneNorm(f, x, z), zoneNorm(m, x, z)) < 1.4 ? 0.85 : 0.5;
  }
  if (z > 100) d *= 1 - smoothstep(118, 134, z);
  return d;
}

const cachedMaps = {};
export function buildMap(fresh = false, id = 'frontier') {
  if (id === 'arena') { if (!fresh && cachedMaps.arena) return cachedMaps.arena; const a = buildArena(); if (!fresh) cachedMaps.arena = a; return a; }
  return buildFrontier(fresh);
}
let cached = null;
function buildFrontier(fresh = false) {
  if (cached && !fresh) return cached;
  const mb = new MB(1337);
  mb.terrainY = terrainY;
  buildCityArea(mb);
  buildIndustryMilitary(mb);
  buildWilds(mb);

  // Vegetation filtern: nicht in Gebäuden / auf Straßen
  const obs = mb.boxes.filter(b => b.y0 < 6 && b.y1 - b.y0 > 0.3 && b.x1 - b.x0 > 0.5);
  const cells = new Map();
  const key = (x, z) => Math.floor(x / 10) + ',' + Math.floor(z / 10);
  for (const b of obs) for (let x = Math.floor((b.x0 - 3) / 10); x <= Math.floor((b.x1 + 3) / 10); x++) for (let z = Math.floor((b.z0 - 3) / 10); z <= Math.floor((b.z1 + 3) / 10); z++) {
    const k = x + ',' + z; (cells.get(k) || cells.set(k, []).get(k)).push(b);
  }
  const blocked = (x, z, pad) => {
    const l = cells.get(key(x, z)); if (!l) return false;
    for (const b of l) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    return false;
  };
  for (const h of mb.holes) { // Löcher: Vegetation fernhalten
    const b = { x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z1, y0: 0, y1: 2 };
    for (let x = Math.floor((b.x0 - 3) / 10); x <= Math.floor((b.x1 + 3) / 10); x++) for (let z = Math.floor((b.z0 - 3) / 10); z <= Math.floor((b.z1 + 3) / 10); z++) {
      const k = x + ',' + z; (cells.get(k) || cells.set(k, []).get(k)).push(b);
    }
  }
  const trunkR = { pine: 0.35, oak: 0.45, birch: 0.28, palm: 0.25, dead: 0.3, rock1: 0.9, rock2: 1.1, rock3: 1.5 };
  const props = [];
  for (const p of mb.props) {
    const pad = p.t.startsWith('rock') ? 1.2 : 1.6;
    if (p.nocheck || !blocked(p.x, p.z, pad)) props.push(p);
  }
  // Wälder & Streuobjekte
  const rng = mb.rng;
  const forest = ZONES.find(z => z.id === 'forest');
  const place = (type, n, test, sMin, sMax) => {
    let tries = 0, ok = 0;
    while (ok < n && tries++ < n * 14) {
      const x = (rng() * 2 - 1) * 194, z = (rng() * 2 - 1) * 194;
      if (!test(x, z)) continue;
      if (blocked(x, z, 2.2)) continue;
      const y = terrainY(x, z);
      if (y < SEA_LEVEL + 0.5 || y > 45) continue;
      props.push({ t: type, x, z, s: sMin + rng() * (sMax - sMin), rot: rng() * 6.28 }); ok++;
    }
  };
  const inF = (x, z) => zoneNorm(forest, x, z) < 1.05 && Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r * 1.3;
  const outsk = (x, z) => grassMask(x, z) > 0.4 && zoneNorm(forest, x, z) > 1.0 && !zoneAt(x, z);
  place('pine', 760, (x, z) => inF(x, z) && rng() < 0.9, 0.9, 1.7);
  place('oak', 240, (x, z) => inF(x, z), 0.9, 1.5);
  place('birch', 190, (x, z) => inF(x, z), 0.9, 1.4);
  place('dead', 22, (x, z) => inF(x, z), 0.8, 1.3);
  place('pine', 160, (x, z) => outsk(x, z) && (Math.abs(x) > 85 || z < -170 || z > 0), 1.0, 2.0);
  place('oak', 70, outsk, 0.9, 1.5);
  place('birch', 50, outsk, 0.9, 1.4);
  place('palm', 36, (x, z) => z > 94 && z < 146 && Math.abs(x) < 120 && !zoneAt(x, z)?.id?.startsWith('trainin'), 0.9, 1.4);
  // mountain pines for the rim
  place('pine', 140, (x, z) => (Math.abs(x) > 140 || z < -150) && grassMask(x, z) > 0.3 && z < 95, 1.4, 2.6);
  place('rock1', 90, (x, z) => grassMask(x, z) > 0.3, 0.8, 2.1);
  place('rock2', 60, (x, z) => grassMask(x, z) > 0.3, 0.8, 2.2);
  place('rock3', 46, (x, z) => (Math.abs(x) > 120 || z < -140 || z > 138), 1.2, 3.0);
  place('bush', 320, (x, z) => grassMask(x, z) > 0.35, 0.8, 1.5);
  place('flower', 260, (x, z) => grassMask(x, z) > 0.5, 0.8, 1.2);
  place('mush', 70, (x, z) => inF(x, z), 0.8, 1.3);
  // Stamm-Collider
  for (const p of props) {
    const r = trunkR[p.t];
    if (r) {
      const y = p.y ?? terrainY(p.x, p.z), rr = r * (p.t.startsWith('rock') ? p.s : Math.min(p.s, 1.4));
      mb.cyls.push({ cyl: true, cx: p.x, cz: p.z, r: rr, x0: p.x - rr, x1: p.x + rr, z0: p.z - rr, z1: p.z + rr, y0: y - 1, y1: y + (p.t.startsWith('rock') ? 1.1 * p.s : 7), on: true, prop: 1 });
    }
  }

  // Spawn-Punkte: Fallbacks im Freien
  if (mb.spawns.length < 8) mb.spawn(0, -100);
  const result = {
    id: 'frontier', name: 'Neon Frontier', seed: 1337, size: 400, extent: 200, bound: 196, terrainR: 258, style: 'open', zoneAt, seaLevel: SEA_LEVEL, zones: ZONES, lake: LAKE,
    terrainY, holes: mb.holes, boxes: mb.boxes, cyls: mb.cyls, parts: mb.parts, props,
    spawns: mb.spawns, pickups: mb.pickups, chests: mb.chests, doors: mb.doors, switches: mb.switches,
    movers: mb.movers, pads: mb.pads, tele: mb.tele, lights: mb.lights, glows: mb.glows, anims: mb.anims,
    labels: mb.labels, secrets: mb.secretSpots, zonesFx: mb.zonesFx,
  };
  if (!fresh) cached = result;
  return result;
}

export function moverY(m, t) {
  const travel = Math.abs(m.y1 - m.y0) / m.speed;
  const cycle = 2 * (travel + m.pause);
  let p = ((t + m.phase) % cycle + cycle) % cycle;
  if (p < m.pause) return m.y0;
  p -= m.pause;
  if (p < travel) { const u = p / travel; return m.y0 + (m.y1 - m.y0) * (u * u * (3 - 2 * u)); }
  p -= travel;
  if (p < m.pause) return m.y1;
  p -= m.pause;
  const u = p / travel; return m.y1 + (m.y0 - m.y1) * (u * u * (3 - 2 * u));
}
