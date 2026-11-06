// Darstellung von Profil-Anpassungen: Namensfarbe, Avatar (Hintergrund + Symbol oder Skin-Büste).
import { NAME_COLORS, AVATAR_BGS, AVATAR_ICONS } from '../shared/defs.js';
import { TIERS } from '../shared/ranks.js';
import { skinThumb } from '../render/thumbs.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIER_COLOR = Object.fromEntries(TIERS.map(t => [t.key, t.color]));

// → { color, cls } für <span class="…" style="color:…">
export function nameLook(id, rankKey) {
  const c = NAME_COLORS.find(x => x.id === id);
  if (!c || id === 'white' || id === '') return { color: '', cls: '' };
  if (id === 'rainbow') return { color: '', cls: 'nm-rainbow' };
  if (id === 'rank') return { color: TIER_COLOR[rankKey] || '', cls: '' };
  return { color: c.color || '', cls: '' };
}
export function nameHtml(name, id, rankKey) { const l = nameLook(id, rankKey); return `<span class="nm-c ${l.cls}"${l.color ? ` style="color:${l.color}"` : ''}>${esc(name)}</span>`; }
export function applyName(el, name, id, rankKey) { const l = nameLook(id, rankKey); el.textContent = name; el.classList.remove('nm-rainbow'); if (l.cls) el.classList.add(l.cls); el.style.color = l.color || ''; }

// Avatar: runder Farbverlauf + Symbol (oder Büste des ausgerüsteten Skins)
export function avatarHtml(av, skinId = 'vanguard', size = 44, cls = '') {
  const bg = AVATAR_BGS.find(x => x.id === av?.bg) || AVATAR_BGS[0], ic = AVATAR_ICONS.find(x => x.id === (av?.icon || 'skin')) || AVATAR_ICONS[0];
  let inner;
  if (ic.id === 'skin') { let src = ''; try { src = skinThumb(skinId || 'vanguard'); } catch { /* ohne Bild */ } inner = src ? `<img src="${src}" alt="" draggable="false">` : '<i>?</i>'; }
  else inner = `<i>${ic.ch}</i>`;
  return `<span class="av ${ic.id === 'skin' ? 'av-skin' : ''} ${cls}" style="--s:${size}px;background:radial-gradient(circle at 30% 25%,${bg.c1},${bg.c2} 85%)">${inner}</span>`;
}
