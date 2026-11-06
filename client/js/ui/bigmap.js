// Große Karte (Taste M): Gelände, benannte Orte, du selbst und deine Teammates – Gegner sieht man hier nie.
// Unten/rechts: Team-Nachrichten wie „Ich bin in Heartland“ (nur das eigene Team bekommt sie).
import { TEAMS } from '../shared/defs.js';
import { POIS, placeName } from '../shared/pois.js';
import { Minimap } from './minimap.js';

const $ = (s) => document.querySelector(s);

export class BigMap {
  constructor(game) {
    this.g = game; this.open = false; this.sel = null; this.base = null; this.cv = $('#bm-cv'); this.ctx = this.cv.getContext('2d'); this.last = 0;
    $('#bm-close').onclick = () => this.close();
    this.cv.onclick = (e) => this.pick(e);
    $('#bm-in').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { this.say($('#bm-in').value); $('#bm-in').value = ''; } else if (e.key === 'Escape' || (e.code === 'KeyM' && !$('#bm-in').value)) this.close(); });
  }
  teamMode() { return this.g.myTeam >= 0; }
  myPlace() { const g = this.g, p = g.player; return placeName(p.x, p.z, p.y < g.world.terrain(p.x, p.z) - 3 && p.y < 4, g.map); }
  toggle() { this.open ? this.close() : this.show(); }
  show() {
    const g = this.g; if (!g.inMatch || g.matchEnded || !g.alive) return;
    if (!this.base || this.baseId !== g.map.id) { this.baseId = g.map.id; this.base = Minimap.prototype.makeBase.call(null, g, 512); }
    this.open = true; g.mapOpen = true; $('#bigmap').classList.add('show'); g.input.unlock(); this.sel = null; this.buildQuick(); this.loop();
  }
  close() {
    if (!this.open) return; this.open = false; this.g.mapOpen = false; $('#bigmap').classList.remove('show'); $('#bm-in').blur();
    try { this.g.input.lock(); } catch { /* Klick ins Spiel holt die Maus zurück */ }
  }
  loop() { if (!this.open) return; this.draw(); const now = performance.now(); if (now - this.last > 400) { this.last = now; this.team(); } requestAnimationFrame(() => this.loop()); }
  // Welt (x,z) ↔ Bild: Norden oben (−z), Karte −200…200
  pois() { return this.g.map.pois || POIS; }
  toPx(x, z) { const E = this.g.map.extent || 200, s = this.cv.width / (2 * E); return [(x + E) * s, (z + E) * s]; }
  pick(e) {
    const r = this.cv.getBoundingClientRect(), k = this.cv.width / r.width, px = (e.clientX - r.left) * k, py = (e.clientY - r.top) * k; let best = null, bd = 34 * 34;
    for (const p of this.pois()) { const [x, y] = this.toPx(p.x, p.z), d = (x - px) ** 2 + (y - py) ** 2; if (d < bd) { bd = d; best = p; } }
    this.sel = best === this.sel ? null : best; this.buildQuick();
  }
  say(text) { text = String(text || '').trim(); if (!text) return; if (!this.teamMode()) { this.g.ui.toast('Team-Nachrichten gibt es nur in Team-Modi.', 'bad'); return; } this.g.send({ k: 'chat', text, scope: 'team' }); }
  buildQuick() {
    const box = $('#bm-quick'); box.replaceChildren(); const here = this.myPlace(), add = (t, f) => { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t; b.disabled = !this.teamMode(); b.onclick = () => { this.say(f); }; box.appendChild(b); };
    add('📍 Ich bin in ' + here, 'Ich bin in ' + here); add('⚠ Gegner in ' + here + '!', 'Achtung, Gegner in ' + here + '!'); add('🆘 Brauche Hilfe in ' + here, 'Ich brauche Hilfe in ' + here + '!');
    if (this.sel) { add('➜ Wir gehen nach ' + this.sel.n, 'Wir gehen nach ' + this.sel.n); add('📌 Treffpunkt: ' + this.sel.n, 'Treffpunkt: ' + this.sel.n); }
    $('#bm-note').textContent = this.teamMode() ? (this.sel ? 'Ausgewählt: ' + this.sel.n + ' (nochmal klicken = abwählen)' : 'Klicke auf einen Ort der Karte, um ihn für Nachrichten zu wählen.') : 'In diesem Modus gibt es keine Teams – nur du bist auf der Karte.';
  }
  team() {
    const g = this.g, box = $('#bm-team'); box.replaceChildren(); this.buildQuick();
    const mates = [...g.ents.values()].filter(e => !e.self && e.alive && this.teamMode() && e.info.team === g.myTeam);
    const add = (name, place, col) => { const r = document.createElement('div'); r.className = 'bm-m'; const d = document.createElement('i'); d.style.background = col; const n = document.createElement('b'); n.textContent = name; const p = document.createElement('small'); p.textContent = place; r.append(d, n, p); box.appendChild(r); };
    add('Du', this.myPlace(), '#ffffff');
    for (const e of mates) add(e.info.name, placeName(e.pos.x, e.pos.z, e.pos.y < g.world.terrain(e.pos.x, e.pos.z) - 3 && e.pos.y < 4, g.map), TEAMS[e.info.team].color);
    if (this.teamMode() && !mates.length) { const r = document.createElement('div'); r.className = 'bm-m'; r.textContent = 'Keine lebenden Teammates'; box.appendChild(r); }
  }
  draw() {
    const g = this.g, ctx = this.ctx, W = this.cv.width, p = g.player; ctx.clearRect(0, 0, W, W); ctx.fillStyle = '#08101e'; ctx.fillRect(0, 0, W, W);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.base, 0, 0, W, W);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; const E = g.map.extent || 200, GS = E > 100 ? 50 : 10; for (let i = -Math.floor(E * 0.75 / GS) * GS; i <= E * 0.75; i += GS) { const [a] = this.toPx(i, 0), [, b] = this.toPx(0, i); ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, W); ctx.moveTo(0, b); ctx.lineTo(W, b); ctx.stroke(); }
    // Orte
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (const o of this.pois()) {
      const [x, y] = this.toPx(o.x, o.z), sel = this.sel === o; ctx.font = (o.major ? '800 20px' : '700 13px') + ' "Trebuchet MS", Arial, sans-serif';
      if (!o.major) { ctx.fillStyle = sel ? '#ffd25a' : 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x, y, sel ? 5 : 3, 0, 6.3); ctx.fill(); }
      const txt = o.major ? o.n.toUpperCase() : o.n, ty = o.major ? y : y - 8; ctx.lineWidth = o.major ? 5 : 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(txt, x, ty); ctx.fillStyle = sel ? '#ffd25a' : (o.major ? '#ffffff' : '#cfe9ff'); ctx.fillText(txt, x, ty);
      if (sel) { ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.3); ctx.stroke(); }
    }
    // Teammates (nur eigenes Team) mit Namen
    if (this.teamMode()) for (const e of g.ents.values()) {
      if (e.self || !e.alive || e.info.team !== g.myTeam) continue; const [x, y] = this.toPx(e.pos.x, e.pos.z);
      ctx.fillStyle = TEAMS[e.info.team].color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.font = '800 14px "Trebuchet MS", Arial, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.strokeText(e.info.name, x, y - 15); ctx.fillStyle = '#fff'; ctx.fillText(e.info.name, x, y - 15);
    }
    // Du selbst: Pfeil in Blickrichtung (Norden oben; yaw 0 blickt nach +z)
    const [mx, my] = this.toPx(p.x, p.z); ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.PI - p.yaw); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(10, 11); ctx.lineTo(0, 5); ctx.lineTo(-10, 11); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
    ctx.font = '800 22px Orbitron, sans-serif'; ctx.fillStyle = '#7ee8ff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText('N', W / 2, 26); ctx.fillText('N', W / 2, 26);
  }
}
