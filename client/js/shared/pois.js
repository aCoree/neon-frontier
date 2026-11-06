// Benannte Orte der Karte (wie „Tilted Towers“ in Fortnite). major = große Gebiete, sonst kleine Orte/Gebäude.
// Koordinaten in Weltmetern (Karte −200…200). Die Namen stehen auch als Schilder in der Welt.
import { zoneAt } from './mapdata.js';

export const POIS = [
  { n: 'Neon Heights', x: 0, z: -100, major: 1 }, { n: 'Ironworks', x: 118, z: 18, major: 1 }, { n: 'Fort Helios', x: 128, z: -120, major: 1 },
  { n: 'Saltwind Bay', x: 0, z: 112, major: 1 }, { n: 'Proving Grounds', x: -112, z: 96, major: 1 }, { n: 'Aurora Station', x: -135, z: -98, major: 1 },
  { n: 'Whisper Forest', x: -112, z: 14, major: 1 }, { n: 'Heartland', x: 8, z: 18, major: 1 },
  { n: 'Nexus Tower', x: -52, z: -70 }, { n: 'Cyber Bar', x: -19, z: -107 }, { n: 'Data Hub', x: 19, z: -107 }, { n: 'Arcade', x: 54, z: -107 },
  { n: 'Central Station', x: 0, z: -52 }, { n: 'Alte Kapelle', x: 30, z: 51 }, { n: 'Aussichtsturm', x: -92, z: -16 }, { n: 'Baumhaus', x: -130, z: -30 },
  { n: 'Roter Anker', x: 0, z: 101 },
];

// Name des Ortes für eine Position: erst kleine Orte in der Nähe, sonst das Gebiet (oder „U-Bahn“ / „Höhlen“ unter der Erde).
export function placeName(x, z, underground = false) {
  if (underground) { const zn = zoneAt(x, z); return zn && zn.id === 'city' ? 'der U-Bahn' : 'den Höhlen'; }
  let best = null, bd = 16 * 16; for (const p of POIS) if (!p.major) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  if (best) return best.n;
  const zn = zoneAt(x, z); if (zn && !zn.hidden) return zn.name;
  let m = POIS[0], md = Infinity; for (const p of POIS) if (p.major) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < md) { md = d; m = p; } }
  return 'der Nähe von ' + m.n;
}
