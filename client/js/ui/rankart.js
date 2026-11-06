// Rang-Abzeichen als SVG (keine Bilddateien): jede Stufe hat eine eigene Form – Bronze schlicht, Gold/Platin mit Flügeln, Diamant als Edelstein,
// Master und Champion sind die Highlights (animierte Strahlen, Glühen, Funken). Dazu die "Battle-Cards" (Rang-Karten).
import { TIERS, rankInfo } from '../shared/ranks.js';

let uid = 0;
const PAL = {
  bronze:   { hi: '#ffd8ae', mid: '#cd7f32', lo: '#5e3210', trim: '#ffb472', gem: null },
  silver:   { hi: '#ffffff', mid: '#c4ceda', lo: '#5d6d82', trim: '#eef4ff', gem: null },
  gold:     { hi: '#fff4b8', mid: '#ffcb35', lo: '#8f5e06', trim: '#fff8d2', gem: '#fff2a0' },
  platinum: { hi: '#e0fdff', mid: '#4fdcf5', lo: '#10627a', trim: '#c4f8ff', gem: '#00e5ff' },
  diamond:  { hi: '#eaf3ff', mid: '#6ea8ff', lo: '#1f3f9a', trim: '#d6e6ff', gem: '#ffffff' },
  master:   { hi: '#f9d9ff', mid: '#b45cff', lo: '#35106a', trim: '#ffe08a', gem: '#ff4fd8' },
  champion: { hi: '#fff6c8', mid: '#ffc93d', lo: '#9c4a08', trim: '#fffdf2', gem: '#ff2e55' },
};
const SHIELD = 'M50 4 L86 16 V52 C86 74 70 90 50 98 C30 90 14 74 14 52 V16 Z';
const SHIELD_IN = 'M50 12 L78 21 V51 C78 68 66 80 50 87 C34 80 22 68 22 51 V21 Z';

const chevrons = (n, col, y0 = 62) => Array.from({ length: n }, (_, k) => `<path d="M38 ${y0 - k * 9} L50 ${y0 + 8 - k * 9} L62 ${y0 - k * 9}" fill="none" stroke="${col}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
const star4 = (x, y, r, col, dur = 2.4, begin = 0) => `<path d="M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z" fill="${col}"><animate attributeName="opacity" values="0;1;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="scale" additive="sum" values="0.4;1;0.4" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></path>`;
const pips = (n, y, col) => Array.from({ length: n }, (_, k) => `<circle cx="${50 + (k - (n - 1) / 2) * 12}" cy="${y}" r="3.8" fill="${col}" stroke="#fff" stroke-width="1"/>`).join('');
const mirror = (inner) => `<g>${inner}</g><g transform="translate(100 0) scale(-1 1)">${inner}</g>`;
const WING = (fill) => `<path d="M16 30 L-8 22 L-2 34 L16 42 Z" fill="${fill}"/><path d="M16 42 L-12 38 L-5 50 L16 54 Z" fill="${fill}"/><path d="M16 54 L-10 54 L-3 66 L16 66 Z" fill="${fill}"/><path d="M16 66 L-4 70 L2 80 L18 76 Z" fill="${fill}"/>`;

// Hauptfunktion: key = 'bronze' … 'champion', div = 1–3 (bei Master/Champion ignoriert)
export function badgeSvg(key, div = 1, { anim = true, size = 56 } = {}) {
  const p = PAL[key] || PAL.bronze, u = 'rk' + (++uid), g = (n) => `url(#${u}${n})`;
  const defs = `<defs>
    <linearGradient id="${u}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.hi}"/><stop offset=".45" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient>
    <linearGradient id="${u}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.trim}"/><stop offset=".5" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient>
    <linearGradient id="${u}c" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${p.lo}"/><stop offset="1" stop-color="${p.mid}"/></linearGradient>
    <radialGradient id="${u}d" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${p.gem || p.hi}"/><stop offset="1" stop-color="${p.gem || p.mid}" stop-opacity="0"/></radialGradient>
    <filter id="${u}f" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.2"/></filter>
  </defs>`;
  const dv = Math.max(1, Math.min(3, div | 0)), A = anim;
  let body = '', vb = '-18 -4 136 112';
  if (key === 'bronze') {
    body = `<path d="${SHIELD}" fill="${g('b')}" stroke="${p.lo}" stroke-width="2"/><path d="${SHIELD_IN}" fill="${g('a')}" stroke="${p.trim}" stroke-opacity=".6" stroke-width="1.2"/>
      <path d="M50 12 L50 87" stroke="${p.lo}" stroke-opacity=".28" stroke-width="1.4"/><path d="M22 36 H78" stroke="${p.hi}" stroke-opacity=".35" stroke-width="1.2"/>${chevrons(dv, '#3a1d08', 64)}`;
  } else if (key === 'silver') {
    body = `<g transform="translate(16 48) scale(.62) translate(-16 -48)">${mirror(WING(g('c')))}</g>
      <path d="${SHIELD}" fill="${g('b')}" stroke="${p.lo}" stroke-width="2"/><path d="${SHIELD_IN}" fill="${g('a')}" stroke="${p.trim}" stroke-opacity=".8" stroke-width="1.4"/>
      <path d="M22 30 H78 M22 38 H78" stroke="#fff" stroke-opacity=".35"/>${chevrons(dv, '#36465c', 64)}`;
  } else if (key === 'gold') {
    body = `${mirror(WING(g('c')))}<path d="M30 8 L38 -2 L44 8 L50 -4 L56 8 L62 -2 L70 8 Z" fill="${g('a')}" stroke="${p.lo}" stroke-width="1.2"/>
      <path d="${SHIELD}" fill="${g('b')}" stroke="${p.lo}" stroke-width="2.2"/><path d="${SHIELD_IN}" fill="${g('a')}" stroke="${p.trim}" stroke-width="1.6"/>
      <circle cx="50" cy="34" r="6" fill="${g('d')}"/>${chevrons(dv, '#6b4204', 66)}${A ? star4(24, 28, 6, '#fff', 3, 0.4) : ''}`;
  } else if (key === 'platinum') {
    body = `${mirror(WING(g('c')))}<path d="M50 2 L84 18 L92 52 L74 84 L50 102 L26 84 L8 52 L16 18 Z" fill="${g('b')}" stroke="${p.lo}" stroke-width="2.2"/>
      <path d="M50 12 L76 24 L82 52 L68 76 L50 90 L32 76 L18 52 L24 24 Z" fill="${g('a')}"/><path d="M50 12 L50 90 M24 24 L76 24 M18 52 L82 52" stroke="#fff" stroke-opacity=".4" stroke-width="1.1"/>
      <path d="M50 12 L76 24 L50 52 Z" fill="#fff" fill-opacity=".22"/><circle cx="50" cy="40" r="11" fill="${g('d')}">${A ? '<animate attributeName="r" values="9;12;9" dur="2.6s" repeatCount="indefinite"/>' : ''}</circle>${chevrons(dv, '#0d4658', 72)}`;
  } else if (key === 'diamond') {
    body = `${mirror(WING(g('c')))}<path d="M28 20 L72 20 L94 46 L50 102 L6 46 Z" fill="${g('b')}" stroke="${p.lo}" stroke-width="2.2"/>
      <path d="M28 20 L72 20 L94 46 L6 46 Z" fill="${g('a')}"/><path d="M6 46 L50 102 L94 46 Z" fill="${g('c')}" fill-opacity=".9"/>
      <path d="M28 20 L38 46 L50 20 L62 46 L72 20 M38 46 L50 102 L62 46" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/>
      <path d="M28 20 L50 20 L38 46 Z" fill="#fff" fill-opacity=".5"/><path d="M62 46 L94 46 L50 102 Z" fill="#fff" fill-opacity=".12"/>
      ${pips(dv, 33, '#16338a')}${A ? star4(70, 30, 9, '#fff', 2.4, 0) + star4(22, 50, 6, '#cfe6ff', 3, 1.1) + star4(80, 70, 5, '#fff', 2.8, 0.6) : ''}`;
  } else if (key === 'master') {
    vb = '-30 -14 160 138';
    const rays = Array.from({ length: 12 }, (_, i) => { const a = i / 12 * 6.2832; return `<path d="M${50 + Math.cos(a) * 30} ${54 + Math.sin(a) * 30} L${50 + Math.cos(a) * (i % 2 ? 54 : 66)} ${54 + Math.sin(a) * (i % 2 ? 54 : 66)} L${50 + Math.cos(a + 0.16) * 30} ${54 + Math.sin(a + 0.16) * 30} Z" fill="${p.mid}" fill-opacity="${i % 2 ? 0.45 : 0.8}"/>`; }).join('');
    const flame = `<path d="M16 38 C-4 30 -12 14 -10 -2 C2 10 12 20 20 30 Z" fill="${g('c')}"/><path d="M16 50 C-8 46 -18 34 -18 20 C-6 30 6 38 20 44 Z" fill="${g('c')}"/><path d="M16 62 C-6 62 -16 54 -22 42 C-8 46 4 52 20 56 Z" fill="${g('c')}"/><path d="M18 72 C0 76 -10 70 -14 62 C-4 64 6 64 20 66 Z" fill="${g('c')}"/>`;
    body = `<ellipse cx="50" cy="54" rx="54" ry="54" fill="${p.gem}" fill-opacity=".45" filter="url(#${u}f)">${A ? '<animate attributeName="fill-opacity" values=".3;.65;.3" dur="2.4s" repeatCount="indefinite"/>' : ''}</ellipse>
      <g>${rays}${A ? '<animateTransform attributeName="transform" type="rotate" from="0 50 54" to="360 50 54" dur="28s" repeatCount="indefinite"/>' : ''}</g>
      ${mirror(flame)}<path d="M34 6 L42 -8 L50 4 L58 -8 L66 6" fill="${g('a')}" stroke="${p.trim}" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M50 0 L90 14 V52 C90 76 72 92 50 102 C28 92 10 76 10 52 V14 Z" fill="${g('b')}" stroke="${p.trim}" stroke-width="2.6"/><path d="M50 10 L80 21 V51 C80 70 66 83 50 91 C34 83 20 70 20 51 V21 Z" fill="${g('a')}" stroke="#1d0840" stroke-width="1.4"/>
      <path d="M20 51 H80 M50 10 V91" stroke="${p.trim}" stroke-opacity=".5" stroke-width="1.2"/>
      <circle cx="50" cy="48" r="17" fill="#1d0840" stroke="${p.trim}" stroke-width="2.2"/><circle cx="50" cy="48" r="12" fill="${g('d')}">${A ? '<animate attributeName="r" values="10;13;10" dur="2s" repeatCount="indefinite"/>' : ''}</circle>
      <g fill="none" stroke="${p.trim}" stroke-width="1.6" stroke-dasharray="4 5"><circle cx="50" cy="48" r="22">${A ? '<animateTransform attributeName="transform" type="rotate" from="0 50 48" to="-360 50 48" dur="9s" repeatCount="indefinite"/>' : ''}</circle></g>
      <path d="M36 78 L50 90 L64 78" fill="none" stroke="${p.trim}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      ${A ? star4(8, 6, 8, '#ffd6ff', 2.2, 0) + star4(96, 14, 6, '#fff', 2.7, 0.8) + star4(2, 70, 5, '#ffd6ff', 3, 1.5) + star4(100, 76, 7, '#fff', 2.5, 0.4) : ''}`;
  } else {   // champion
    vb = '-34 -22 168 150';
    const rays = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * 6.2832, L = i % 2 ? 62 : 80; return `<path d="M${50 + Math.cos(a - 0.07) * 28} ${56 + Math.sin(a - 0.07) * 28} L${50 + Math.cos(a) * L} ${56 + Math.sin(a) * L} L${50 + Math.cos(a + 0.07) * 28} ${56 + Math.sin(a + 0.07) * 28} Z" fill="${i % 2 ? '#fff4c2' : p.mid}" fill-opacity="${i % 2 ? 0.55 : 0.85}"/>`; }).join('');
    const rays2 = Array.from({ length: 16 }, (_, i) => { const a = (i + 0.5) / 16 * 6.2832; return `<path d="M${50 + Math.cos(a - 0.05) * 30} ${56 + Math.sin(a - 0.05) * 30} L${50 + Math.cos(a) * 58} ${56 + Math.sin(a) * 58} L${50 + Math.cos(a + 0.05) * 30} ${56 + Math.sin(a + 0.05) * 30} Z" fill="#ff4d6a" fill-opacity=".7"/>`; }).join('');
    const leaf = (i) => `<path d="M${10 - i * 1} ${86 - i * 15} C-8 ${82 - i * 15} -12 ${70 - i * 15} -6 ${62 - i * 15} C4 ${64 - i * 15} 10 ${74 - i * 15} ${10 - i * 1} ${86 - i * 15} Z" fill="${g('c')}" stroke="${p.hi}" stroke-width=".8"/>`;
    const laurel = [0, 1, 2, 3, 4].map(leaf).join('');
    body = `<ellipse cx="50" cy="56" rx="64" ry="64" fill="#ffb02e" fill-opacity=".5" filter="url(#${u}f)">${A ? '<animate attributeName="fill-opacity" values=".35;.8;.35" dur="2.2s" repeatCount="indefinite"/><animate attributeName="rx" values="60;70;60" dur="2.2s" repeatCount="indefinite"/><animate attributeName="ry" values="60;70;60" dur="2.2s" repeatCount="indefinite"/>' : ''}</ellipse>
      <g>${rays}${A ? '<animateTransform attributeName="transform" type="rotate" from="0 50 56" to="360 50 56" dur="40s" repeatCount="indefinite"/>' : ''}</g>
      <g>${rays2}${A ? '<animateTransform attributeName="transform" type="rotate" from="360 50 56" to="0 50 56" dur="26s" repeatCount="indefinite"/>' : ''}</g>
      ${mirror(laurel)}
      <circle cx="50" cy="58" r="38" fill="${g('b')}" stroke="${p.trim}" stroke-width="3"/><circle cx="50" cy="58" r="31" fill="${g('a')}" stroke="${p.lo}" stroke-width="2"/>
      <circle cx="50" cy="58" r="27" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="2 4"/>
      <path d="M50 36 L56 50 L71 51 L59 60 L63 75 L50 67 L37 75 L41 60 L29 51 L44 50 Z" fill="#7a1230" stroke="${p.trim}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="50" cy="58" r="7.5" fill="${g('d')}">${A ? '<animate attributeName="r" values="6;9;6" dur="1.8s" repeatCount="indefinite"/>' : ''}</circle>
      <path d="M22 28 L28 6 L38 22 L50 -8 L62 22 L72 6 L78 28 Q50 36 22 28 Z" fill="${g('b')}" stroke="${p.trim}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M26 24 Q50 32 74 24" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/>
      <circle cx="28" cy="6" r="3.4" fill="#ff2e55" stroke="#fff" stroke-width="1"/><circle cx="50" cy="-8" r="4.4" fill="#ff2e55" stroke="#fff" stroke-width="1"/><circle cx="72" cy="6" r="3.4" fill="#ff2e55" stroke="#fff" stroke-width="1"/>
      ${A ? '<g opacity=".0"><rect x="-40" y="-10" width="18" height="140" fill="#fff" transform="skewX(-22)"><animate attributeName="x" values="-60;140" dur="3.4s" repeatCount="indefinite"/></rect><animate attributeName="opacity" values="0;.35;0" dur="3.4s" repeatCount="indefinite"/></g>' : ''}
      ${A ? star4(-10, 10, 9, '#fff6c8', 2.2, 0) + star4(108, 14, 8, '#fff', 2.6, 0.7) + star4(-18, 70, 6, '#ffd36b', 3, 1.4) + star4(116, 78, 7, '#fff6c8', 2.4, 0.3) + star4(50, 110, 6, '#fff', 2.9, 1) : ''}`;
  }
  const [, , vw, vh] = vb.split(' ').map(Number);
  return `<svg class="rk-svg" width="${Math.round(size * vw / vh)}" height="${size}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true" focusable="false">${defs}${body}</svg>`;
}

// <span class="rkb t-gold"> … </span>: info = rankInfo(pts) – size in px (Höhe)
export function rankBadge(info, { size = 56, anim = true, cls = '' } = {}) {
  const i = typeof info === 'object' ? info : rankInfo(info);
  return `<span class="rkb t-${i.key}${i.elite ? ' elite' : ''} ${cls}" style="--sz:${size}px" title="${i.label}">${badgeSvg(i.key, i.div || 1, { anim: anim && i.elite, size })}</span>`;
}

// Battle-Card: kleine Sammelkarte mit Abzeichen, Rangname, Wertung (optional Name + Fortschritt)
export function rankCard(info, { name = '', sub = '', size = 96, progress = false, anim = true, cls = '' } = {}) {
  const i = typeof info === 'object' ? info : rankInfo(info);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<div class="rkc t-${i.key}${i.elite ? ' elite' : ''} ${cls}" style="--rc:${i.color};--rg:${i.glow}">
    <i class="rkc-shine"></i><div class="rkc-top"><small>${i.elite ? 'ELITE' : 'RANG'}</small><em>${i.div ? 'STUFE ' + i.roman : i.key === 'champion' ? 'GIPFEL' : 'SPITZE'}</em></div>
    <div class="rkc-art">${rankBadge(i, { size, anim })}</div>
    <b class="rkc-name">${i.tier.toUpperCase()}${i.div ? ' <u>' + i.roman + '</u>' : ''}</b>${name ? `<span class="rkc-who">${esc(name)}</span>` : ''}
    <span class="rkc-pts"><b>${i.pts.toLocaleString('de-DE')}</b> Wertung</span>${sub ? `<small class="rkc-sub">${esc(sub)}</small>` : ''}
    ${progress ? `<div class="rkc-bar" title="${i.nextLabel ? 'Noch ' + (i.nextAt - i.pts) + ' bis ' + i.nextLabel : 'Höchster Rang'}"><i style="width:${Math.max(4, Math.round(i.progress * 100))}%"></i></div>` : ''}
  </div>`;
}
export const TIER_LIST = TIERS;
