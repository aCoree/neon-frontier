// Party-System (nur angemeldete Spieler, im Arbeitsspeicher): Leiter lädt Freunde ein, Mitglieder folgen dem Leiter in Lobbys,
// Teams in Team-Modi halten die Party zusammen. Reine Logik ohne Netzwerk: Nachrichten gehen über send(userId, msg), Online-Status über isOnline(userId).
export const MAX_PARTY = 4, INVITE_TTL = 60000, GRACE_MS = 30000;

export class Parties {
  constructor({ send = () => false, isOnline = () => true, now = Date.now, graceMs = GRACE_MS, ttl = INVITE_TTL } = {}) {
    this.send = send; this.isOnline = isOnline; this.now = now; this.graceMs = graceMs; this.ttl = ttl;
    this.parties = new Map(); this.of = new Map(); this.info = new Map(); this.pending = new Map(); this.timers = new Map(); this.seq = 0;
  }
  partyIdOf(userId) { return this.of.get(Number(userId)) || 0; }
  get(userId) { const id = this.of.get(Number(userId)); return id ? this.parties.get(id) : null; }
  name(userId) { return this.info.get(Number(userId))?.name || 'Spieler'; }
  // Öffentlicher Zustand aus Sicht eines Mitglieds
  view(p, forId) {
    return { id: p.id, max: MAX_PARTY, isLeader: p.leader === forId, leader: this.name(p.leader),
      members: p.members.map(id => { const i = this.info.get(id) || {}; return { name: i.name || 'Spieler', level: i.level || 1, skin: i.skin || 'vanguard', wskin: i.wskin || 'default', leader: id === p.leader, online: this.isOnline(id) && !this.timers.has(id), you: id === forId }; }) };
  }
  broadcast(p) { for (const id of p.members) this.send(id, { k: 'party', party: this.view(p, id) }); }
  tell(ids, text) { for (const id of ids) this.send(id, { k: 'party_event', text }); }
  // Spieler hat (wieder) eine Social-Verbindung: Profil merken, Wartezeit beenden, Zustand erneut senden
  touch(userId, info) {
    userId = Number(userId); if (info) this.info.set(userId, { ...this.info.get(userId), ...info });
    clearTimeout(this.timers.get(userId)); this.timers.delete(userId);
    const p = this.get(userId); if (p) this.broadcast(p);
  }
  // Letzte Verbindung weg: Kurz warten (Seite neu laden / Netz-Aussetzer), dann aus der Party nehmen
  drop(userId) {
    userId = Number(userId); if (!this.get(userId)) return; clearTimeout(this.timers.get(userId));
    const t = setTimeout(() => { this.timers.delete(userId); this.leave(userId, true); }, this.graceMs); t.unref?.(); this.timers.set(userId, t);
    this.broadcast(this.get(userId));
  }
  prune() { const t = this.now(); for (const [uid, m] of this.pending) { for (const [pid, inv] of m) if (inv.expires < t || !this.parties.has(pid)) m.delete(pid); if (!m.size) this.pending.delete(uid); } }

  invite(leaderId, target) {   // target: { id, name } – Freundschaft/Stummschaltung prüft der Aufrufer
    leaderId = Number(leaderId); const tid = Number(target.id); this.prune();
    if (tid === leaderId) return { ok: false, error: 'Das bist du selbst.' };
    let p = this.get(leaderId);
    if (p && p.leader !== leaderId) return { ok: false, error: 'Nur der Party-Leiter kann einladen.' };
    if (p && p.members.includes(tid)) return { ok: false, error: target.name + ' ist schon in deiner Party.' };
    if (!this.isOnline(tid)) return { ok: false, error: target.name + ' ist gerade offline.' };
    const open = p ? [...(this.pending.get(tid) || new Map()).entries()].find(([pid, inv]) => pid === p.id && inv.expires > this.now()) : null;
    if (open) return { ok: false, error: 'Du hast ' + target.name + ' gerade erst eingeladen.' };
    const pendingHere = p ? [...this.pending.values()].reduce((n, m) => n + (m.has(p.id) ? 1 : 0), 0) : 0;
    if ((p ? p.members.length : 1) + pendingHere >= MAX_PARTY) return { ok: false, error: 'Die Party ist voll.' };
    if (!p) { p = { id: ++this.seq, leader: leaderId, members: [leaderId] }; this.parties.set(p.id, p); this.of.set(leaderId, p.id); }
    const m = this.pending.get(tid) || new Map(); m.set(p.id, { from: this.name(leaderId), expires: this.now() + this.ttl }); this.pending.set(tid, m);
    this.send(tid, { k: 'party_invite', from: this.name(leaderId), size: p.members.length, max: MAX_PARTY, ttl: Math.round(this.ttl / 1000) });
    this.broadcast(p); return { ok: true };
  }
  accept(userId, fromName) {
    userId = Number(userId); this.prune(); const m = this.pending.get(userId); const f = String(fromName || '').toLowerCase();
    const hit = m && [...m.entries()].find(([pid, inv]) => inv.from.toLowerCase() === f && this.parties.has(pid));
    if (!hit) return { ok: false, error: 'Die Einladung ist abgelaufen.' };
    const p = this.parties.get(hit[0]); if (p.members.length >= MAX_PARTY) return { ok: false, error: 'Die Party ist voll.' };
    if (this.partyIdOf(userId) === p.id) return { ok: true };
    if (this.get(userId)) this.leave(userId);   // wie bei Fortnite: aus der alten Party wechseln
    m.delete(p.id); if (!m.size) this.pending.delete(userId);
    p.members.push(userId); this.of.set(userId, p.id); this.broadcast(p); this.tell(p.members.filter(i => i !== userId), this.name(userId) + ' ist der Party beigetreten.'); return { ok: true };
  }
  decline(userId, fromName) {
    userId = Number(userId); const m = this.pending.get(userId), f = String(fromName || '').toLowerCase(); if (!m) return { ok: true };
    for (const [pid, inv] of m) if (inv.from.toLowerCase() === f) { m.delete(pid); const p = this.parties.get(pid); if (p) this.tell([p.leader], this.name(userId) + ' hat die Einladung abgelehnt.'); }
    if (!m.size) this.pending.delete(userId); return { ok: true };
  }
  leave(userId, timedOut = false) {
    userId = Number(userId); const p = this.get(userId); if (!p) return { ok: true };
    clearTimeout(this.timers.get(userId)); this.timers.delete(userId);
    p.members = p.members.filter(i => i !== userId); this.of.delete(userId); this.send(userId, { k: 'party', party: null });
    if (p.members.length < 2) {   // eine Party mit nur einem Spieler gibt es nicht
      for (const id of p.members) { this.of.delete(id); this.send(id, { k: 'party', party: null }); this.tell([id], 'Die Party wurde aufgelöst.'); }
      this.parties.delete(p.id); return { ok: true };
    }
    if (p.leader === userId) { p.leader = p.members[0]; this.tell(p.members, this.name(p.leader) + ' ist jetzt Party-Leiter.'); }
    this.tell(p.members, this.name(userId) + (timedOut ? ' hat die Verbindung verloren.' : ' hat die Party verlassen.')); this.broadcast(p); return { ok: true };
  }
  byName(p, name) { const n = String(name || '').toLowerCase(); return p.members.find(id => this.name(id).toLowerCase() === n); }
  kick(leaderId, name) {
    leaderId = Number(leaderId); const p = this.get(leaderId); if (!p || p.leader !== leaderId) return { ok: false, error: 'Nur der Party-Leiter kann Mitglieder entfernen.' };
    const t = this.byName(p, name); if (!t || t === leaderId) return { ok: false, error: 'Ungültiges Mitglied.' };
    this.leave(t); this.tell([t], 'Du wurdest aus der Party entfernt.'); return { ok: true };
  }
  promote(leaderId, name) {
    leaderId = Number(leaderId); const p = this.get(leaderId); if (!p || p.leader !== leaderId) return { ok: false, error: 'Nur der Party-Leiter kann das.' };
    const t = this.byName(p, name); if (!t || t === leaderId) return { ok: false, error: 'Ungültiges Mitglied.' };
    p.leader = t; this.tell(p.members, this.name(t) + ' ist jetzt Party-Leiter.'); this.broadcast(p); return { ok: true };
  }
  // Leiter ist einer Lobby beigetreten (der Aufrufer hat das geprüft): alle anderen Mitglieder sollen folgen
  follow(leaderId, code) {
    leaderId = Number(leaderId); const p = this.get(leaderId); if (!p || p.leader !== leaderId) return { ok: false, error: 'Nur der Party-Leiter kann die Party mitnehmen.' };
    let n = 0; for (const id of p.members) if (id !== leaderId && this.send(id, { k: 'party_join', code, from: this.name(leaderId) })) n++;
    return { ok: true, notified: n };
  }
}
