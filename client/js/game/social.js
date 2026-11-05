// Social-Verbindung: eine leichte, dauerhafte WebSocket-Verbindung für angemeldete Spieler (auch im Menü).
// Der Server schickt darüber Echtzeit-Hinweise (Freundschaftsanfrage, Annahme, Lobby-Einladung) und nimmt Einladungen entgegen.
// Sie kann keine Räume betreten – das macht weiterhin die normale Spiel-Verbindung.
import { resolveServerUrl } from './net.js';
import { Progress } from './progress.js';
import { Account } from './account.js';

export const Social = {
  ws: null, wanted: false, retry: 0, timer: null, handlers: new Map(), connected: false,
  listen(k, f) { (this.handlers.get(k) || this.handlers.set(k, []).get(k)).push(f); return () => this.handlers.set(k, (this.handlers.get(k) || []).filter(x => x !== f)); },
  emit(m) { for (const f of this.handlers.get(m.k) || []) { try { f(m); } catch (e) { console.error('Social-Handler', m.k, e); } } },
  start() {
    if (!Account.user || !Account.token || !Account.available || this.ws) { this.wanted = !!(Account.user && Account.available); return; }
    this.wanted = true; this.open();
  },
  stop() { this.wanted = false; clearTimeout(this.timer); const ws = this.ws; this.ws = null; this.connected = false; try { ws && ws.close(); } catch { /* ignore */ } },
  open() {
    let ws; try { ws = new WebSocket(resolveServerUrl(Progress.d.settings.server)); } catch { return this.schedule(); }
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; ws.send(JSON.stringify({ k: 'hello', token: Account.token, social: true })); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.k === 'welcome') this.connected = true;
      if (m.k === 'err' && ['banned', 'nosocial', 'maintenance', 'toomany'].includes(m.code)) this.wanted = false;   // dauerhaft abgelehnt → nicht erneut versuchen
      this.emit(m);
    };
    ws.onclose = () => { if (this.ws === ws) this.ws = null; this.connected = false; if (this.wanted) this.schedule(); };
    ws.onerror = () => { /* onclose behandelt */ };
  },
  schedule() { clearTimeout(this.timer); this.retry++; this.timer = setTimeout(() => { if (this.wanted && !this.ws) this.open(); }, Math.min(30000, 1000 * 2 ** Math.min(this.retry, 5))); },
  send(o) { if (this.ws && this.ws.readyState === 1 && this.connected) { this.ws.send(JSON.stringify(o)); return true; } return false; },
  // Einladung an einen Freund → Promise<{ ok, error }>
  invite(target) {
    return new Promise((resolve) => {
      let off = () => {}; const t = setTimeout(() => { off(); resolve({ ok: false, error: 'Keine Antwort vom Server.' }); }, 5000);
      off = this.listen('invite_result', (m) => { if (String(m.target).toLowerCase() === String(target).toLowerCase()) { clearTimeout(t); off(); resolve(m); } });
      if (!this.send({ k: 'invite', target })) { clearTimeout(t); off(); resolve({ ok: false, error: 'Keine Verbindung zum Hinweis-Dienst. Bitte kurz warten.' }); }
    });
  },
};
