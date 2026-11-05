// Datensparsame Analytics: nur anonyme Tageszähler (Metrik + Dimension + Tag). Keine Spieler-IDs, keine IP-Adressen, keine Cookies.
// Zähler werden im Speicher gesammelt und gebündelt in die Datenbank geschrieben (wenig Last, kein Schreibzugriff pro Ereignis).
const SAFE = /[^a-z0-9_:.\-]/g;
const clean = (s, n) => String(s ?? '').toLowerCase().replace(SAFE, '').slice(0, n);
const DAY = "(now() AT TIME ZONE 'UTC')::date";

export class Analytics {
  constructor(db, { enabled = () => true, sample = null, log = console, maxKeys = 400 } = {}) {
    this.db = db; this.enabled = enabled; this.sample = sample; this.log = log; this.maxKeys = maxKeys;
    this.sums = new Map(); this.maxes = new Map(); this.timer = null; this.dropped = 0;
  }
  key(metric, dim) { const m = clean(metric, 40), d = clean(dim, 40); return m ? m + '\u0000' + d : null; }
  // Zähler erhöhen. Unbekannte/zu viele verschiedene Schlüssel werden verworfen (Schutz vor unbegrenztem Speicherwachstum).
  inc(metric, dim = '', n = 1) {
    if (!this.db || !this.enabled()) return; const k = this.key(metric, dim); if (!k) return;
    if (!this.sums.has(k) && this.sums.size >= this.maxKeys) { this.dropped++; return; }
    this.sums.set(k, (this.sums.get(k) || 0) + Math.max(0, Math.round(n)));
  }
  // Höchstwert pro Tag (z. B. gleichzeitige Spieler)
  max(metric, dim = '', v = 0) {
    if (!this.db || !this.enabled()) return; const k = this.key(metric, dim); if (!k) return;
    if (!this.maxes.has(k) && this.maxes.size >= this.maxKeys) { this.dropped++; return; }
    this.maxes.set(k, Math.max(this.maxes.get(k) || 0, Math.round(v)));
  }
  async flush() {
    if (!this.db) return;
    if (this.sample) { try { this.sample(this); } catch { /* Messung ist optional */ } }
    if (!this.sums.size && !this.maxes.size) return;
    const sums = this.sums, maxes = this.maxes; this.sums = new Map(); this.maxes = new Map();
    try {
      await this.db.tx(async (t) => {
        for (const [k, v] of sums) { const [m, d] = k.split('\u0000'); if (v > 0) await t.query(`INSERT INTO analytics_daily (day, metric, dim, value) VALUES (${DAY},$1,$2,$3) ON CONFLICT (day, metric, dim) DO UPDATE SET value = analytics_daily.value + EXCLUDED.value`, [m, d, v]); }
        for (const [k, v] of maxes) { const [m, d] = k.split('\u0000'); await t.query(`INSERT INTO analytics_daily (day, metric, dim, value) VALUES (${DAY},$1,$2,$3) ON CONFLICT (day, metric, dim) DO UPDATE SET value = GREATEST(analytics_daily.value, EXCLUDED.value)`, [m, d, v]); }
      });
    } catch (e) {   // nichts verlieren: zurück in den Puffer
      for (const [k, v] of sums) this.sums.set(k, (this.sums.get(k) || 0) + v);
      for (const [k, v] of maxes) this.maxes.set(k, Math.max(this.maxes.get(k) || 0, v));
      this.log.error?.('[analytics] Schreiben fehlgeschlagen', e.message);
    }
  }
  start(ms = 30000) { if (this.timer || !this.db) return; this.timer = setInterval(() => this.flush(), ms); this.timer.unref?.(); this.pruneTimer = setInterval(() => this.prune().catch(() => {}), 6 * 3600 * 1000); this.pruneTimer.unref?.(); }
  async stop() { clearInterval(this.timer); clearInterval(this.pruneTimer); this.timer = this.pruneTimer = null; await this.flush(); }
  async prune(days = 400) { if (!this.db) return 0; const r = await this.db.query(`DELETE FROM analytics_daily WHERE day < ${DAY} - $1::int`, [Math.max(30, days | 0)]); return r.rowCount ?? 0; }

  // Auswertung für das Admin-Dashboard
  async report(days = 14) {
    days = Math.min(90, Math.max(1, days | 0 || 14));
    const rows = await this.db.all(`SELECT day::text AS day, metric, dim, value FROM analytics_daily WHERE day > ${DAY} - $1::int ORDER BY day`, [days]);
    const dayList = [], today = new Date(); for (let i = days - 1; i >= 0; i--) dayList.push(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i)).toISOString().slice(0, 10));
    const idx = new Map(dayList.map((d, i) => [d, i])), metrics = {};
    for (const r of rows) {
      const i = idx.get(r.day); if (i === undefined) continue; const m = metrics[r.metric] || (metrics[r.metric] = { total: 0, byDay: new Array(dayList.length).fill(0), dims: {} });
      const v = Number(r.value), isMax = r.metric.startsWith('peak_');
      m.byDay[i] = isMax ? Math.max(m.byDay[i], v) : m.byDay[i] + v;
      if (r.dim) m.dims[r.dim] = isMax ? Math.max(m.dims[r.dim] || 0, v) : (m.dims[r.dim] || 0) + v;
    }
    for (const [name, m] of Object.entries(metrics)) {
      if (name.startsWith('peak_')) { m.total = Math.max(0, ...m.byDay); if (Object.keys(m.dims).length) delete m.dims; continue; }
      // Zeilen mit Dimension zählen zusätzlich zur Summe ohne Dimension: Gesamtsumme = Summe der Tage
      m.total = m.byDay.reduce((a, b) => a + b, 0);
    }
    return { days: dayList, metrics, dropped: this.dropped };
  }
}
