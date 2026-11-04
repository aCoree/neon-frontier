// Netzwerk: WebSocket-Client mit Auto-Reconnect + Session-Resume, und LocalNet (läuft die Server-Simulation im Browser, für Offline-Modi).
import { Room } from '../shared/sim/room.js';
import { SERVER_URL } from '../config.js';

class Emitter {
  constructor() { this.h = new Map(); }
  on(k, f) { (this.h.get(k) || this.h.set(k, []).get(k)).push(f); return this; }
  off(k, f) { const l = this.h.get(k); if (l) this.h.set(k, l.filter(x => x !== f)); }
  emit(k, ...a) { for (const f of this.h.get(k) || []) { try { f(...a); } catch (e) { console.error('Handler-Fehler', k, e); } } for (const f of this.h.get('*') || []) { try { f(k, ...a); } catch (e) { console.error(e); } } }
}

export function resolveServerUrl(custom) {
  let u = (custom || '').trim() || SERVER_URL;
  if (!u) {
    const loc = window.location;
    if (loc.protocol === 'file:') return 'ws://localhost:8080';
    u = (loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host;
  }
  u = u.replace(/^http/, 'ws');
  if (!/^wss?:\/\//.test(u)) u = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + u;
  return u;
}

export class Net extends Emitter {
  constructor(url, profile) {
    super(); this.url = url; this.profile = profile; this.kind = 'ws';
    this.ws = null; this.ready = false; this.closedByUs = false; this.session = null; this.retry = 0; this.rtt = 0.08; this.queue = [];
    this.pingTimer = null; this.reconnectTimer = null; this.connectTimeout = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.closedByUs = false; let settled = false;
      const open = () => {
        let ws; try { ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
        this.ws = ws; this.emit('status', this.retry ? 'reconnecting' : 'connecting');
        clearTimeout(this.connectTimeout);
        this.connectTimeout = setTimeout(() => { if (ws.readyState !== 1) { try { ws.close(); } catch { /* ignore */ } } }, 8000);
        ws.onopen = () => {
          clearTimeout(this.connectTimeout); this.ready = true; const wasRetry = this.retry > 0; this.retry = 0;
          this.raw({ k: 'hello', ...this.profile });
          if (wasRetry && this.session) this.raw({ k: 'resume', code: this.session.code, id: this.session.id, token: this.session.token });
          for (const q of this.queue.splice(0)) this.raw(q);
          this.emit('status', 'open'); this.startPing();
          if (!settled) { settled = true; resolve(); }
        };
        ws.onmessage = (ev) => {
          let m; try { m = JSON.parse(ev.data); } catch { return; }
          if (m.k === 'pong') { this.rtt = Math.max(0.005, (performance.now() - m.t) / 1000); this.emit('rtt', this.rtt); this.emit('pong', m); return; }
          if (m.k === 'joined') this.session = { code: m.code, id: m.you, token: m.token };
          this.emit(m.k, m);
        };
        ws.onclose = () => {
          clearTimeout(this.connectTimeout); this.ready = false; this.stopPing();
          if (this.closedByUs) { this.emit('status', 'closed'); return; }
          if (!settled && this.retry === 0) { settled = true; reject(new Error('Verbindung fehlgeschlagen')); this.emit('status', 'failed'); return; }
          this.retry++;
          if (this.retry > 14) { this.emit('status', 'closed'); this.emit('lost'); return; }
          this.emit('status', 'reconnecting');
          this.reconnectTimer = setTimeout(open, Math.min(6000, 600 * this.retry));
        };
        ws.onerror = () => { /* onclose behandelt */ };
      };
      open();
    });
  }
  raw(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); else if (o.k !== 'st' && o.k !== 'fire') this.queue.push(o); }
  startPing() { this.stopPing(); const f = () => this.raw({ k: 'ping', t: performance.now(), rtt: this.rtt }); f(); this.pingTimer = setInterval(f, 2000); }
  stopPing() { clearInterval(this.pingTimer); }
  leave() { this.session = null; this.raw({ k: 'leave' }); }
  close() { this.closedByUs = true; clearTimeout(this.reconnectTimer); this.stopPing(); try { this.ws && this.ws.close(); } catch { /* ignore */ } }
}

// Offline: dieselbe Raum-Simulation lokal im Browser (Training, Solo gegen Bots). Gleiches Protokoll wie Net.
export class LocalNet extends Emitter {
  constructor(profile) {
    super(); this.profile = profile; this.kind = 'local'; this.rtt = 0.01; this.room = null; this.member = null; this.timer = null; this.session = null; this.ready = true;
    this.client = { send: (o, raw) => { const m = raw ? JSON.parse(o) : o; queueMicrotask(() => { if (m.k === 'joined') this.session = { code: m.code, id: m.you, token: m.token }; this.emit(m.k, m); }); } };
  }
  async connect() { setTimeout(() => this.emit('status', 'open'), 0); }
  send(o) {
    if (o.k === 'create') { this.room = new Room('LOCAL', { local: true, settings: o.settings }); this.member = this.room.addMember(this.client, this.profile); this.timer = setInterval(() => { try { this.room.tick(); } catch (e) { console.error('Sim-Fehler', e); } }, 25); return; }
    if (o.k === 'ping') { this.emit('pong', { t: o.t, T: this.room?.T }); return; }
    if (o.k === 'leave') { this.close(); return; }
    if (this.room && this.member) this.room.handle(this.member, o);
  }
  leave() { this.close(); }
  close() { clearInterval(this.timer); if (this.room) this.room.destroy(); this.room = null; this.member = null; }
}
