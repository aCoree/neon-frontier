// Rang-System (Server UND Client): ELO-Wertung → Rang. Bronze bis Diamant haben je drei Stufen (I–III), Master und Champion sind je ein einziger Rang.
// Die Wertung ("Rangpunkte") wird nur vom Server berechnet; hier steht nur die Einteilung und die ELO-Formel.
export const TIERS = [
  { key: 'bronze',   name: 'Bronze',   min: 0,    divs: 3, step: 100, color: '#cd7f32', glow: '#ff9d4d' },
  { key: 'silver',   name: 'Silver',   min: 300,  divs: 3, step: 100, color: '#c9d2de', glow: '#e8f0ff' },
  { key: 'gold',     name: 'Gold',     min: 600,  divs: 3, step: 100, color: '#ffd25a', glow: '#ffe9a0' },
  { key: 'platinum', name: 'Platinum', min: 900,  divs: 3, step: 100, color: '#5ee6ff', glow: '#b5f6ff' },
  { key: 'diamond',  name: 'Diamond',  min: 1200, divs: 3, step: 100, color: '#6ea8ff', glow: '#b9d4ff' },
  { key: 'master',   name: 'Master',   min: 1500, divs: 1, step: 500, color: '#c77dff', glow: '#f0b0ff' },
  { key: 'champion', name: 'Champion', min: 2000, divs: 1, step: 0,   color: '#ff4d6a', glow: '#ffd36b' },
];
export const TIER_BY_NAME = Object.fromEntries(TIERS.map(t => [t.name, t]));
const ROMAN = ['I', 'II', 'III'];
export const PLACEMENT_MATCHES = 5;   // die ersten Ranked-Matches bewegen die Wertung stärker

// pts → alle Angaben zum Rang. div: 1–3 (0 bei Master/Champion). next*: nächster Rang (oder null).
export function rankInfo(pts) {
  pts = Math.max(0, Math.floor(Number(pts) || 0));
  let ti = 0; for (let i = 0; i < TIERS.length; i++) if (pts >= TIERS[i].min) ti = i;
  const t = TIERS[ti], single = t.divs === 1;
  const div = single ? 0 : Math.min(t.divs, Math.floor((pts - t.min) / t.step) + 1);
  const from = single ? t.min : t.min + (div - 1) * t.step;
  const nextAt = single ? (TIERS[ti + 1] ? TIERS[ti + 1].min : null) : (div < t.divs ? t.min + div * t.step : (TIERS[ti + 1] ? TIERS[ti + 1].min : null));
  const nextLabel = nextAt === null ? null : single ? TIERS[ti + 1].name : div < t.divs ? `${t.name} ${ROMAN[div]}` : `${TIERS[ti + 1].name}${TIERS[ti + 1].divs > 1 ? ' I' : ''}`;
  return {
    pts, tier: t.name, key: t.key, idx: ti, div, roman: div ? ROMAN[div - 1] : '', label: div ? `${t.name} ${ROMAN[div - 1]}` : t.name, color: t.color, glow: t.glow,
    from, nextAt, nextLabel, into: pts - from, span: nextAt === null ? 0 : nextAt - from, progress: nextAt === null ? 1 : Math.min(1, (pts - from) / (nextAt - from)),
    elite: ti >= 5,
  };
}
export const rankName = (pts) => rankInfo(pts).tier;
export const rankLabel = (pts) => rankInfo(pts).label;

// ELO: Erwartung gegen den Durchschnitt der Gegner, K-Faktor größer in den Platzierungs-Matches.
export const expected = (me, opp) => 1 / (1 + Math.pow(10, (opp - me) / 400));
export function eloDelta({ me, opps, score, played = 99 }) {
  const k = played < PLACEMENT_MATCHES ? 56 : 36;
  const e = opps.length ? opps.reduce((a, o) => a + expected(me, o), 0) / opps.length : 0.5;
  return Math.round(k * (score - e));
}
