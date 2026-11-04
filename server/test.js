// Headless-Test der Raum-Simulation (ohne Netzwerk): Match mit Bots starten, simulieren, Ereignisse prüfen.
import { Room } from '../client/js/shared/sim/room.js';
const msgs = [];
const mk = (name) => ({ name, msgs: [], send(o, raw) { this.msgs.push(raw ? JSON.parse(o) : o); } });
const room = new Room('TEST', { settings: { mode: 'ffa', bots: 5, diff: 'hard', scoreLimit: 8, timeLimit: 2 } });
const c1 = mk('Aurelio');
const m = room.addMember(c1, { name: 'Aurelio', skin: 'vanguard' });
room.start();
console.log('state', room.state, 'ents', room.ents.size, 'bots', [...room.ents.values()].filter(e => e.isBot).length);
let tickMs = 0, ticks = 0, events = {};
// simulierte Zeit: Date.now überschreiben
let fake = Date.now(); const realNow = Date.now; Date.now = () => fake;
room.last = fake;
for (let i = 0; i < 40 * 90; i++) {
  fake += 25;
  const t0 = process.hrtime.bigint(); room.tick(); tickMs += Number(process.hrtime.bigint() - t0) / 1e6; ticks++;
  // Spieler-Eingabe simulieren: laufen im Kreis
  if (room.state !== 'lobby' && m.ent && m.ent.alive && i % 2 === 0) {
    const e = m.ent; const a = i * 0.01; room.handle(m, { k: 'st', x: e.x + Math.cos(a) * 0.1, y: e.y, z: e.z + Math.sin(a) * 0.1, yaw: a, pitch: 0, fl: 0, w: e.w });
  }
  for (const msg of c1.msgs.splice(0)) if (msg.k === 'snap') for (const ev of msg.ev) events[ev.k] = (events[ev.k] || 0) + 1;
}
Date.now = realNow;
console.log('avg tick ms', (tickMs / ticks).toFixed(3), 'max entities', room.ents.size);
console.log('events', events);
console.log('state', room.state, 'T', room.T.toFixed(1));
const sc = [...room.ents.values()].map(e => `${e.name}:${e.kills}/${e.deaths}`).join(' ');
console.log(sc);
