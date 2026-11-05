// Konto-Client: sprechen mit der Server-API (Bearer-Token in localStorage). Ohne Server/Datenbank bleibt alles im Gast-Modus.
import { resolveServerUrl } from './net.js';
import { Progress } from './progress.js';

const KEY = 'nf_token';
export const Account = {
  user: null, inv: null, token: null, available: false, maintenance: false, flags: {}, mutes: new Set(),
  base() { return resolveServerUrl(Progress.d.settings.server).replace(/^ws/, 'http'); },
  load() { try { this.token = localStorage.getItem(KEY); } catch { this.token = null; } },
  async req(method, path, body) {
    const r = await fetch(this.base() + path, { method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch { /* leer */ }
    if (!r.ok) throw Object.assign(new Error(j.error || 'Serverfehler'), { status: r.status, data: j });
    return j;
  },
  async init() {
    this.load();
    try {
      const s = await this.req('GET', '/api/status'); this.available = !!s.accounts; this.maintenance = !!s.maintenance; this.flags = s.flags || {};
      if (this.available && this.token) { try { const m = await this.req('GET', '/api/me'); this.user = m.user; this.mutes = new Set(m.mutes); } catch (e) { if (e.status === 401 || e.status === 403) this.setToken(null); } }
      if (this.user) await this.loadInventory();
    } catch { this.available = false; }
    return this;
  },
  setToken(t) { this.token = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* privater Modus */ } if (!t) { this.user = null; this.inv = null; this.mutes = new Set(); } },
  async register(username, password, ownerCode) { const r = await this.req('POST', '/api/register', { username, password, ownerCode: ownerCode || undefined }); this.setToken(r.token); this.user = r.user; await this.loadInventory(); return r.user; },
  async login(username, password) { const r = await this.req('POST', '/api/login', { username, password }); this.setToken(r.token); this.user = r.user; const m = await this.req('GET', '/api/me'); this.mutes = new Set(m.mutes); await this.loadInventory(); return r.user; },
  async logout() { try { await this.req('POST', '/api/logout', {}); } catch { /* egal */ } this.setToken(null); },
  async loadInventory() { try { this.inv = await this.req('GET', '/api/inventory'); this.syncEquipped(); } catch { /* offline */ } return this.inv; },
  syncEquipped() { if (this.inv) { Progress.d.skin = this.inv.equipped.skin; Progress.d.wskin = this.inv.equipped.wskin; } },
  async buy(item) { this.inv = await this.req('POST', '/api/shop/buy', { item }); await this.refresh(); return this.inv; },
  async equip(skin, wskin) { this.inv = await this.req('POST', '/api/equip', { skin, wskin }); this.syncEquipped(); return this.inv; },
  async claimDaily() { const r = await this.req('POST', '/api/daily/claim', {}); this.inv = r.inventory; await this.refresh(); return r.reward; },
  friends() { return this.req('GET', '/api/friends'); },
  search(q, after) { return this.req('GET', '/api/players/search?q=' + encodeURIComponent(q) + (after ? '&after=' + encodeURIComponent(after) : '')); },
  friendAction(kind, target) { return this.req('POST', '/api/friends/' + kind, { target }); },
  async refresh() { if (!this.token) return; try { const m = await this.req('GET', '/api/me'); this.user = m.user; } catch { /* ignorieren */ } },
  report(target, reason, matchId) { return this.req('POST', '/api/report', { target, reason, matchId }); },
  async mute(target, on) { await this.req('POST', on ? '/api/mute' : '/api/unmute', { target }); on ? this.mutes.add(target) : this.mutes.delete(target); },
};
