// Fortschritt & Einstellungen (localStorage): XP, Level, Skins, Erfolge, Statistiken.
import { xpForLevel, SKINS, WSKINS, ACHIEVEMENTS } from '../shared/defs.js';

const KEY = 'neon_frontier_v1';
const DEFAULT = {
  name: '', xp: 0, level: 1, skin: 'vanguard', wskin: 'default', ach: {}, stats: { kills: 0, headshots: 0, botKills: 0, shards: 0, chests: 0, wins: 0, matches: 0, deaths: 0 }, seenSkins: {},
  settings: { quality: 'high', sens: 1.0, fov: 74, master: 0.8, music: 0.5, sfx: 0.9, ambient: 0.6, invertY: false, server: '', shake: 1, dmgNumbers: true, hints: true, fpsCap: 60, dynRes: true, batterySaver: false, shadows: 'auto', particles: 1, viewDist: 380, renderScale: 1 },
};

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
export const Progress = {
  data: null,
  load() {
    let d = null; try { d = safeParse(localStorage.getItem(KEY)); } catch { /* privater Modus */ }
    this.data = { ...DEFAULT, ...(d || {}), stats: { ...DEFAULT.stats, ...(d?.stats || {}) }, settings: { ...DEFAULT.settings, ...(d?.settings || {}) }, ach: d?.ach || {}, seenSkins: d?.seenSkins || {} };
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
  get d() { return this.data || this.load(); },
  xpInLevel() { const d = this.d; return { cur: d.xp, need: xpForLevel(d.level) }; },
  addXP(n) {
    const d = this.d; d.xp += n; const ups = [];
    while (d.xp >= xpForLevel(d.level)) { d.xp -= xpForLevel(d.level); d.level++; ups.push(d.level); }
    if (ups.length && d.level >= 10) this.grant('level10');
    this.save(); return ups;
  },
  grant(id) {
    const d = this.d; if (d.ach[id]) return null;
    const a = ACHIEVEMENTS.find(x => x.id === id); if (!a) return null;
    d.ach[id] = Date.now(); this.save();
    const ups = this.addXP(a.xp); return { a, ups };
  },
  skinUnlocked(id) { const s = SKINS.find(s => s.id === id); return !!s && this.d.level >= s.level; },
  wskinUnlocked(id) { const s = WSKINS.find(s => s.id === id); return !!s && (this.d.level >= s.level || (id === 'gold' && this.d.ach.duck)); },
  stat(k, n = 1) { this.d.stats[k] = (this.d.stats[k] || 0) + n; },
};
