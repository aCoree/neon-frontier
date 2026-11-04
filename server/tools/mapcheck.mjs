import { buildMap } from '../../client/js/shared/mapdata.js';
import { World } from '../../client/js/shared/world.js';
import { Nav } from '../../client/js/shared/sim/nav.js';
const m = buildMap(); const w = new World(m); const nav = Nav.for(w);
let bad = [];
const chk = (kind, o) => {
  const y = o.y ?? w.groundAt(o.x, o.z, 200);
  const g = w.groundAt(o.x, o.z, (o.y ?? 200) + 0.8);
  const t = w.terrain(o.x, o.z);
  if (o.y !== undefined && (g < o.y - 1.0 || g > o.y + 0.8)) bad.push(`${kind} ${o.id || ''} (${o.x},${o.z}) y=${o.y} ground=${g.toFixed(2)} terrain=${t.toFixed(2)}`);
};
for (const s of m.spawns) chk('spawn', s);
for (const p of m.pickups) chk('pickup', p);
for (const c of m.chests) chk('chest', c);
console.log('mismatches', bad.length); console.log(bad.slice(0, 40).join('\n'));
let walk = 0; for (let i = 0; i < nav.walk.length; i++) walk += nav.walk[i]; console.log('nav walkable cells', walk, 'of', nav.walk.length);
for (const [x,z] of [[0,-100],[118,18],[166,-112],[0,112],[-135,-98],[-112,96],[-150,0]]) console.log(x,z, m.terrainY(x,z).toFixed(2));
