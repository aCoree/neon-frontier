import { buildMap } from '../../client/js/shared/mapdata.js';
import { World } from '../../client/js/shared/world.js';
const m = buildMap(); const w = new World(m);
function walk(e, tx, tz, maxT = 12) {
  let t = 0; while (t < maxT) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz); if (d < 0.25) return true;
    e.vx = dx / d * 4.5; e.vz = dz / d * 4.5; e.vy -= 24 * 0.016; w.move(e, 0.016); t += 0.016;
  } return false;
}
const mk = (x, y, z) => ({ x, y, z, vx: 0, vy: 0, vz: 0, r: 0.4, h: 1.8, stepUp: 0.55, grounded: false });
// Shaft E: lane A z=-52.95, from x=50 -> landing x~61 -> lane B z=-51.1 -> back to x=50
let e = mk(50, 0.4, -52.95); for (let i = 0; i < 20; i++) w.move(e, 0.016);
console.log('start', e.y.toFixed(2));
console.log('A ok', walk(e, 61.2, -52.95), e.x.toFixed(1), e.y.toFixed(2));
console.log('turn ok', walk(e, 61.2, -51.1), e.y.toFixed(2));
console.log('B ok', walk(e, 49.5, -51.1), e.x.toFixed(1), e.y.toFixed(2));
console.log('hall', walk(e, 20, -51.1), e.x.toFixed(1), e.y.toFixed(2));
// W shaft (flipped)
e = mk(-50, 0.4, -52.95); for (let i = 0; i < 20; i++) w.move(e, 0.016);
console.log('W start', e.y.toFixed(2), 'walk A', walk(e, -61.2, -52.95), e.x.toFixed(1), e.y.toFixed(2));
console.log('W turn', walk(e, -61.2, -51.1), 'B', walk(e, -49.5, -51.1), e.x.toFixed(1), e.y.toFixed(2));
// Gebäude-Treppe City Hotel (19,-82): bis aufs Dach
e = mk(19, 0.6, -70); for (let i = 0; i < 20; i++) w.move(e, 0.016); console.log('hotel ground', e.y.toFixed(2));
// Cave A
const sa = m.holes.filter(h => h.x0 < -140 && h.x1 > -170 && Math.abs((h.z0+h.z1)/2) < 10); console.log('cave holes', JSON.stringify(sa));
// Gebäudetreppe testen: Hotel (19,-82) w22 d22 floors 6 base 0.4
{
  const B = 0.4, x = 19, z = -82, wd = 22, dd = 22, wt = 0.4, run = 0.62, rise = 0.3, nst = Math.round(3.6 / rise) - 1, holeLen = nst * run;
  const x0 = x - wd / 2 + wt + 1.5, zA = z - dd / 2 + wt;
  let e = mk(19, B + 0.2, -70); for (let i = 0; i < 30; i++) w.move(e, 0.016);
  console.log('enter', walk(e, 19, -80), walk(e, x0 + 0.3, zA + 0.85), e.y.toFixed(2));
  for (let f = 0; f < 6; f++) {
    const lane = f % 2, dir = lane === 0 ? 1 : -1, zl = zA + lane * 1.8 + 0.85;
    if (dir > 0) { walk(e, x0 + 0.3, zl); walk(e, x0 + holeLen + 1.0, zl); walk(e, x0 + holeLen + 1.0, zA + 1.8 + 0.85); }
    else { walk(e, x0 + holeLen + 1.0, zl); walk(e, x0 - 0.9 + 0.5, zl); walk(e, x0 + 0.3, zA + 0.85); }
    console.log('floor', f + 1, 'y', e.y.toFixed(2), 'expected', (B + (f + 1) * 3.6).toFixed(2));
  }
}
