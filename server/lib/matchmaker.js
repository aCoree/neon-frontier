// Matchmaking: Warteschlange pro Spielmodus (nur angemeldete Spieler, im Arbeitsspeicher).
// Ein „Ticket“ ist ein Spieler oder eine ganze Party. Der Matchmaker bildet aus Tickets mit ähnlichem Rang eine Gruppe; das erlaubte Rang-Fenster
// wird mit der Wartezeit größer. Findet sich nach einer Weile niemand, startet das Match mit den vorhandenen Menschen und füllt mit Bots auf
// (ehrlich in der Oberfläche angezeigt). Reine Logik ohne Netzwerk: Rückmeldungen laufen über Callbacks.
export const MM_MODES = {
  ffa:  { name: 'Free for All',     cap: 8, minStart: 4, team: 0, bots: 6 },    // bots = Ziel-Gesamtzahl der Figuren
  tdm:  { name: 'Team Deathmatch',  cap: 8, minStart: 4, team: 0, bots: 8 },
  duel: { name: '1 gegen 1',        cap: 2, minStart: 2, team: 1 },
  v2:   { name: '2 gegen 2',        cap: 4, minStart: 4, team: 2 },
  v3:   { name: '3 gegen 3',        cap: 6, minStart: 6, team: 3 },
};
export const SOFT_WAIT = 6000;     // mit „minStart“ Spielern darf nach so langer Wartezeit gestartet werden
export const MAX_WAIT = 18000;     // spätestens dann startet das Match mit Bots als Auffüllung
const WINDOW0 = 150, WINDOW_PER_SEC = 40;   // erlaubter Rang-Unterschied (Rangpunkte): 150 + 40 pro Wartesekunde

export class Matchmaker {
  // onMatch({ mode, tickets, humans, bots }), onStatus(ticket, status), onCancel(ticket, reason), valid(ticket) → false = Ticket verwerfen
  constructor({ now = Date.now, onMatch = () => {}, onStatus = () => {}, onCancel = () => {}, valid = () => true, soft = SOFT_WAIT, max = MAX_WAIT } = {}) {
    this.now = now; this.onMatch = onMatch; this.onStatus = onStatus; this.onCancel = onCancel; this.valid = valid; this.soft = soft; this.max = max;
    this.tickets = new Map(); this.byUser = new Map(); this.seq = 0; this.stats = { matches: 0, filled: 0 };
  }
  ticketOf(userId) { return this.byUser.get(Number(userId)) || null; }
  size() { return this.tickets.size; }
  // members: [{ userId, name, rating }] – Party oder Einzelspieler. party: Party-ID (0 = Einzelspieler)
  queue({ members, mode, party = 0, ranked = false }) {
    const cfg = MM_MODES[mode]; if (!cfg) return { ok: false, error: 'Unbekannter Spielmodus.' };
    if (!members.length) return { ok: false, error: 'Keine Spieler.' };
    if (cfg.team && members.length > cfg.team) return { ok: false, error: `Eure Party (${members.length}) passt nicht in ${cfg.name} (Teamgröße ${cfg.team}).` };
    if (members.length > cfg.cap) return { ok: false, error: 'Die Party ist zu groß für diesen Modus.' };
    for (const m of members) if (this.byUser.has(Number(m.userId))) return { ok: false, error: (members.length > 1 ? m.name + ' sucht' : 'Du suchst') + ' bereits ein Match.' };
    const t = { id: ++this.seq, mode, ranked: !!ranked, party, members: members.map(m => ({ userId: Number(m.userId), name: m.name, rating: Math.max(0, m.rating | 0) })), since: this.now(), lastStatus: 0 };
    t.rating = Math.round(t.members.reduce((a, m) => a + m.rating, 0) / t.members.length);
    this.tickets.set(t.id, t); for (const m of t.members) this.byUser.set(m.userId, t);
    this.onStatus(t, this.status(t, [t])); return { ok: true, ticket: t };
  }
  cancel(ticketId, reason) { const t = this.tickets.get(ticketId); if (!t) return false; this.drop(t); if (reason !== null) this.onCancel(t, reason); return true; }
  cancelUser(userId, reason) { const t = this.ticketOf(userId); return t ? this.cancel(t.id, reason) : false; }
  drop(t) { this.tickets.delete(t.id); for (const m of t.members) if (this.byUser.get(m.userId) === t) this.byUser.delete(m.userId); }
  status(t, group) { const cfg = MM_MODES[t.mode], found = group.reduce((n, x) => n + x.members.length, 0), w = this.now() - t.since; return { mode: t.mode, ranked: t.ranked, waited: Math.round(w / 1000), found, cap: cfg.cap, stage: w >= this.max - 5000 ? 'filling' : 'searching' }; }
  window(waitMs) { return WINDOW0 + WINDOW_PER_SEC * (waitMs / 1000); }
  // Gruppe um das älteste Ticket des Modus bilden (Rang-Fenster beidseitig, Platz begrenzt)
  group(anchor) {
    const cfg = MM_MODES[anchor.mode], g = [anchor]; let humans = anchor.members.length; const t0 = this.now();
    for (const t of [...this.tickets.values()].filter(x => x.mode === anchor.mode && x.ranked === anchor.ranked && x !== anchor).sort((a, b) => a.since - b.since)) {
      if (humans + t.members.length > cfg.cap) continue;
      const w = Math.max(t0 - anchor.since, t0 - t.since);
      if (Math.abs(anchor.rating - t.rating) > this.window(w)) continue;
      g.push(t); humans += t.members.length; if (humans >= cfg.cap) break;
    }
    return { g, humans };
  }
  tick() {
    const t0 = this.now();
    for (const t of [...this.tickets.values()]) if (!this.valid(t)) this.cancel(t.id, 'Die Suche wurde beendet, weil sich die Party geändert hat.');
    for (const mode of Object.keys(MM_MODES)) for (const ranked of [true, false]) {   // Ranked und Locker haben getrennte Warteschlangen
      for (;;) {   // mehrere Matches pro Modus pro Durchlauf möglich
        const anchor = [...this.tickets.values()].filter(x => x.mode === mode && x.ranked === ranked).sort((a, b) => a.since - b.since)[0]; if (!anchor) break;
        const cfg = MM_MODES[mode], { g, humans } = this.group(anchor), wait = t0 - anchor.since;
        const full = humans >= cfg.cap, ready = humans >= cfg.minStart && wait >= this.soft, late = wait >= this.max;
        if (!(full || ready || late)) break;
        for (const t of g) this.drop(t);
        const bots = cfg.bots ? Math.max(0, cfg.bots - humans) : 0; this.stats.matches++; if (humans < cfg.cap) this.stats.filled++;
        this.onMatch({ mode, ranked, tickets: g, humans, bots, filled: humans < cfg.cap });
      }
    }
    // Status an alle noch wartenden Tickets
    const byMode = new Map(); for (const t of this.tickets.values()) (byMode.get(t.mode) || byMode.set(t.mode, []).get(t.mode)).push(t);
    for (const [, list] of byMode) for (const t of list) { const { g } = this.group(t); this.onStatus(t, this.status(t, g)); }
  }
}
