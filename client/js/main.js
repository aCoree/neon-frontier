// NEON FRONTIER – Einstiegspunkt: lädt die Welt, startet UI & Spielschleife.
import { Engine } from './render/engine.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { Progress } from './game/progress.js';
import { audio } from './game/audio.js';
import { Perf } from './render/perf.js';
import { Account } from './game/account.js';
import { Social } from './game/social.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
window.addEventListener('error', (e) => { const el = $('#load-err'); if (el) el.textContent += '\n' + (e.message || e.error); console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { const el = $('#load-err'); if (el) el.textContent += '\n' + (e.reason && (e.reason.stack || e.reason.message) || e.reason); console.error(e.reason); });

async function boot() {
  Progress.load();
  const S = Progress.d.settings;
  if (params.get('server')) { S.server = params.get('server'); Progress.save(); }
  if (!navigator.gpu && !document.createElement('canvas').getContext('webgl2')) { $('#load-err').textContent = 'WebGL2 wird von diesem Browser nicht unterstützt.'; return; }
  const canvas = $('#c');
  const engine = new Engine(canvas, params.get('q') || S.quality || 'high');
  const setP = (p, t) => { $('#load-bar').style.width = Math.round(p * 100) + '%'; $('#load-text').textContent = t; };
  await engine.init(setP);
  const accInit = Account.init();
  await Promise.race([accInit, new Promise(r => setTimeout(r, 3500))]);   // Konten (optional): Server nicht erreichbar → Gast-Modus
  const game = new Game(engine, canvas); const ui = new UI(game); game.ui = ui; window.game = game;
  ui.init(); ui.checkFriendRequests(); Social.start();
  accInit.then(() => { ui.refreshProfile(); ui.checkFriendRequests(); Social.start(); ui.showBuild(); });   // langsamer Server (z. B. Render-Kaltstart): Konto und Online-Dienst nachziehen
  audio.setVolumes({ master: S.master, music: S.music, sfx: S.sfx, ambient: S.ambient });
  game.enterMenu(); window.__bootMs = Math.round(performance.now());
  $('#loading').classList.add('hide'); setTimeout(() => { $('#loading').style.display = 'none'; }, 900);
  if (!Progress.d.name) { ui.showScreen('menu'); ui.go('name'); setTimeout(() => $('#name-input').focus(), 100); } else ui.showScreen('menu');
  // Einladungslink ?room=ABCD
  const room = (params.get('room') || '').toUpperCase();
  if (room) { const join = () => ui.joinRoom(room); if (Progress.d.name) setTimeout(join, 400); else ui.afterName = join; history.replaceState(null, '', location.pathname); }
  const perf = new Perf(engine, S); engine.perf = perf; engine.applySettings(S);
  let last = performance.now();
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }          // unsichtbarer Tab: nichts rendern (Akku)
    if (!perf.shouldRender(now)) return;                 // Frame-Pacing / FPS-Limit
    const delta = now - last, dt = Math.min(0.05, delta / 1000); last = now;
    const t0 = performance.now();
    try { game.frame(dt); } catch (e) { console.error('Frame-Fehler', e); if (!window.__frameErr) { window.__frameErr = 1; ui.toast('Fehler: ' + e.message, 'bad'); } }
    perf.frameEnd(delta, performance.now() - t0, engine.lastRenderMs);
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { Progress.save(); audio.ctx && audio.ctx.suspend(); } else audio.ctx && audio.ctx.resume(); });
}
boot().catch((e) => { console.error(e); const el = $('#load-err'); if (el) el.textContent = 'Startfehler: ' + (e.stack || e.message || e); });
