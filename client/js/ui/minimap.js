// Minimap: vorgerenderte Karte (Gelände, Straßen, Gebäude) + rotierende Ansicht mit Spielern, Nachschub, Scans.
import { FL, TEAMS } from '../shared/defs.js';

export class Minimap {
  constructor(canvas, game) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.g = game; this.R = 74; this.baseId = game.map.id; this.base = this.makeBase(game); this.t = 0;
  }
  makeBase(g, S = 256) {
    const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), map = g.map, view = g.view;
    const img = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const E = map.extent || 200, wx = -E + (i + 0.5) * 2 * E / S, wz = -E + (j + 0.5) * 2 * E / S, h = map.terrainY(wx, wz);
      let col;
      if (h < map.seaLevel) { const d = Math.min(1, (map.seaLevel - h) / 6); col = [30 - d * 14, 90 - d * 40, 140 - d * 40]; }
      else { const b = view.biome(wx, wz, h, 0.2); col = [b.r * 255 * 0.75, b.g * 255 * 0.75, b.b * 255 * 0.75]; const sh = 0.8 + (h - map.terrainY(wx + 3, wz - 3)) * 0.05; col = col.map(v => Math.max(0, Math.min(255, v * sh))); }
      const k = (j * S + i) * 4; img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const E2 = map.extent || 200, sc = S / (2 * E2), ox = E2;
    for (const p of map.parts) if (p.t === 'b' && p.m === 'asphalt') { x.fillStyle = 'rgba(40,44,52,.9)'; x.fillRect((p.x - p.w / 2 + ox) * sc, (p.z - p.d / 2 + ox) * sc, p.w * sc, p.d * sc); }
    for (const b of map.boxes) { const w = b.x1 - b.x0, d = b.z1 - b.z0, hh = b.y1 - b.y0; if (hh > 2.4 && w * d > 25 && b.y0 < 14) { x.fillStyle = 'rgba(70,82,108,.95)'; x.fillRect((b.x0 + ox) * sc, (b.z0 + ox) * sc, w * sc + 0.4, d * sc + 0.4); } }
    return c;
  }
  draw(g, dt) {
    if (this.baseId !== g.map.id) { this.baseId = g.map.id; this.base = this.makeBase(g); }
    const ctx = this.ctx, W = this.cv.width, p = g.player, now = performance.now() / 1000; this.t += dt;
    const sc = W / 2 / this.R, th = p.yaw - Math.PI, ct = Math.cos(th), st = Math.sin(th);
    ctx.save(); ctx.clearRect(0, 0, W, W); ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, 6.3); ctx.clip();
    ctx.fillStyle = '#0a1020'; ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2); ctx.rotate(th); ctx.scale(sc, sc); ctx.translate(-p.x, -p.z);
    ctx.imageSmoothingEnabled = true; const E = g.map.extent || 200; ctx.drawImage(this.base, -E, -E, 2 * E, 2 * E);
    // Kisten (ungeöffnet) schwach markiert wäre Spoiler – weggelassen. Nachschub:
    ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, 6.3); ctx.clip();
    const proj = (x, z) => { const dx = x - p.x, dz = z - p.z; return [W / 2 + (dx * ct - dz * st) * sc, W / 2 + (dx * st + dz * ct) * sc]; };
    for (const s of g.supplies) { if (s.landed && now - s.t0 > 30) continue; const [sx, sy] = proj(s.x, s.z); ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.t * 2); ctx.fillStyle = '#ffc23d'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 6); ctx.fillRect(-7, -7, 14, 14); ctx.restore(); }
    for (const e of g.ents.values()) {
      if (e.self || !e.alive) continue;
      const ally = e.info.team >= 0 && e.info.team === g.myTeam; const vis = ally || e.reveal > now;
      if (!vis) continue;
      const [sx, sy] = proj(e.pos.x, e.pos.z); const d = Math.hypot(sx - W / 2, sy - W / 2); if (d > W / 2 - 6) { const k = (W / 2 - 8) / d; if (!ally) continue; ctx.globalAlpha = 0.7; }
      ctx.fillStyle = ally ? TEAMS[e.info.team].color : '#ff4d4d'; ctx.beginPath(); ctx.arc(Math.min(W - 8, Math.max(8, sx)), Math.min(W - 8, Math.max(8, sy)), ally ? 7 : 8, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1;
      if (!ally) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    // Spieler
    ctx.translate(W / 2, W / 2); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    // Himmelsrichtung N
    ctx.fillStyle = '#7ee8ff'; ctx.font = '800 22px Orbitron, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', W / 2 + Math.sin(th) * (W / 2 - 20), W / 2 - Math.cos(th) * (W / 2 - 20) + 8);
  }
}
