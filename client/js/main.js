// NEON FRONTIER – Einstiegspunkt: lädt die Welt, startet UI & Spielschleife.
import { Engine } from './render/engine.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import { Progress } from './game/progress.js';
import { audio } from './game/audio.js';

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
  const game = new Game(engine, canvas); const ui = new UI(game); game.ui = ui; window.game = game;
  ui.init();
  audio.setVolumes({ master: S.master, music: S.music, sfx: S.sfx, ambient: S.ambient });
  game.enterMenu();
  $('#loading').classList.add('hide'); setTimeout(() => { $('#loading').style.display = 'none'; }, 900);
  if (!Progress.d.name) { ui.showScreen('menu'); ui.go('name'); setTimeout(() => $('#name-input').focus(), 100); } else ui.showScreen('menu');
  // Einladungslink ?room=ABCD
  const room = (params.get('room') || '').toUpperCase();
  if (room) { const join = () => ui.joinRoom(room); if (Progress.d.name) setTimeout(join, 400); else ui.afterName = join; history.replaceState(null, '', location.pathname); }
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { game.frame(dt); } catch (e) { console.error('Frame-Fehler', e); if (!window.__frameErr) { window.__frameErr = 1; ui.toast('Fehler: ' + e.message, 'bad'); } }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) Progress.save(); });
}
boot().catch((e) => { console.error(e); const el = $('#load-err'); if (el) el.textContent = 'Startfehler: ' + (e.stack || e.message || e); });
