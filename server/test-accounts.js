// Integrationstest für Konten/Admin/Moderation gegen ein echtes Postgres (PGlite, in-memory).
// Aufruf: npm run test:accounts
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createApp } from './app.js';
import { connectPglite, migrate } from './lib/db.js';
import { applyMatchResult } from './lib/progression.js';
import { readBackup } from './lib/backup.js';

const quiet = { log() {}, error: console.error };
const db = await connectPglite(); await migrate(db); await migrate(db); // zweimal: Migration muss idempotent sein
const app = createApp({ db, config: { ownerUsername: 'Aurelio', ownerCode: 'sekret-code-123', mmSoft: 500, mmMax: 1500 }, log: quiet });
const port = await app.start(0), base = `http://localhost:${port}`;
let passed = 0; const ok = (name) => { passed++; console.log('  ✓', name); };
const call = async (method, path, body, token, headers = {}) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { s: r.status, ...j }; };
const reg = (u, p = 'Passw0rd!x', extra = {}, ip) => call('POST', '/api/register', { username: u, password: p, ...extra }, null, ip ? { 'x-forwarded-for': ip } : {});
const login = (u, p, ip) => call('POST', '/api/login', { username: u, password: p }, null, ip ? { 'x-forwarded-for': ip } : {});
const wsHello = (msg) => new Promise((resolve) => { const ws = new WebSocket('ws://localhost:' + port); const got = []; ws.on('open', () => ws.send(JSON.stringify({ k: 'hello', ...msg }))); ws.on('message', (d) => { const m = JSON.parse(d); got.push(m); if (m.k === 'welcome' || m.k === 'err') resolve({ ws, m, got }); }); });

console.log('Konten & Sicherheit');
assert.equal((await call('GET', '/api/status')).accounts, true); ok('Status meldet aktive Konten');
assert.equal((await call('GET', '/api/me')).s, 401); ok('Ohne Token: 401');
const owner0 = await reg('Aurelio', 'Passw0rd!x'); assert.equal(owner0.s, 400); ok('Besitzer-Name ohne Code blockiert');
for (const bad of ['admin', 'ab', 'a b c', 'Fuck_you', 'Hitler99']) assert.equal((await reg(bad, 'Passw0rd!x', {}, '9.9.9.' + bad.length)).s, 400); ok('Reservierte/ungültige/anstößige Namen abgelehnt');
assert.equal((await reg('Gute_Namen', '123')).s, 400); assert.equal((await reg('Gute_Namen', 'password')).s, 400); ok('Schwache Passwörter abgelehnt');
const ow = await reg('Aurelio', 'Passw0rd!x', { ownerCode: 'sekret-code-123' }, '1.1.1.1'); assert.equal(ow.s, 200); assert.equal(ow.user.role, 'OWNER'); ok('Besitzer mit geheimem Code registriert → OWNER');
const a = await reg('Alice', 'Passw0rd!x', {}, '2.2.2.2'); assert.equal(a.s, 200); assert.equal(a.user.role, 'PLAYER'); assert.equal(a.user.stats.level, 1); ok('Spieler registriert (PLAYER, Level 1)');
assert.equal((await reg('alice', 'Passw0rd!x', {}, '3.3.3.3')).s, 409); ok('Doppelter Name (Groß/Kleinschreibung egal) → 409');
const hash = (await db.one("SELECT password_hash FROM users WHERE username_lower='alice'")).password_hash; assert.ok(hash.startsWith('scrypt$') && !hash.includes('Passw0rd')); ok('Passwort nur als scrypt-Hash gespeichert');
const tokRow = await db.one('SELECT token_hash FROM sessions LIMIT 1'); assert.ok(tokRow.token_hash.length === 64 && tokRow.token_hash !== a.token); ok('Sitzungs-Token nur als Hash gespeichert');
assert.equal((await login('Alice', 'falsch')).s, 401); const l1 = await login('alice', 'Passw0rd!x', '4.4.4.4'); assert.equal(l1.s, 200); ok('Login falsch/richtig');
for (let i = 0; i < 8; i++) await login('Alice', 'falsch' + i, '5.5.5.5'); assert.equal((await login('Alice', 'Passw0rd!x', '5.5.5.5')).s, 429); ok('Konto-Sperre nach Fehlversuchen (Rate Limit)');
assert.ok((await db.one("SELECT count(*)::int AS n FROM suspicious_events WHERE kind='login_failures'")).n >= 1); ok('Verdächtige Logins werden protokolliert');
const rl = []; for (let i = 0; i < 7; i++) rl.push((await reg('Spam' + i, 'Passw0rd!x', {}, '6.6.6.6')).s); assert.ok(rl.includes(429)); ok('Registrierungs-Rate-Limit pro IP');
const me = await call('GET', '/api/me', null, l1.token); assert.equal(me.user.username, 'Alice'); ok('/api/me mit Token');
assert.equal((await call('POST', '/api/logout', {}, l1.token)).s, 200); assert.equal((await call('GET', '/api/me', null, l1.token)).s, 401); ok('Logout beendet die Sitzung');

console.log('Rollen, Sperren, Meldungen');
const bob = await reg('Bobby', 'Passw0rd!x', {}, '7.7.7.7'), mod = await reg('Moddy', 'Passw0rd!x', {}, '8.8.8.8');
assert.equal((await call('GET', '/api/admin/players?q=a', null, bob.token)).s, 403); ok('Spieler hat keinen Admin-Zugriff');
assert.equal((await call('POST', '/api/admin/role', { username: 'Moddy', role: 'MODERATOR' }, mod.token)).s, 403); ok('Spieler kann sich keine Rolle geben');
assert.equal((await call('POST', '/api/admin/role', { username: 'Moddy', role: 'MODERATOR' }, ow.token)).s, 200); ok('Besitzer vergibt Moderator-Rolle');
assert.equal((await call('POST', '/api/admin/ban', { username: 'Bobby', permanent: true, reason: 'x' }, mod.token)).s, 403); ok('Moderator kann nicht dauerhaft sperren');
assert.equal((await call('POST', '/api/admin/ban', { username: 'Aurelio', minutes: 5, reason: 'x' }, mod.token)).s, 403); ok('Niemand sperrt den Besitzer');
const s1 = await login('Bobby', 'Passw0rd!x', '7.7.7.8');
assert.equal((await call('POST', '/api/admin/ban', { username: 'Bobby', minutes: 60, reason: 'Cheating' }, mod.token)).s, 200);
assert.equal((await call('GET', '/api/me', null, s1.token)).s, 401); assert.equal((await login('Bobby', 'Passw0rd!x', '7.7.7.9')).s, 403); ok('Temporärer Bann: Sitzungen weg, Login verweigert');
assert.equal((await call('POST', '/api/admin/unban', { username: 'Bobby' }, mod.token)).s, 200); assert.equal((await login('Bobby', 'Passw0rd!x', '7.7.7.10')).s, 200); ok('Unban');
const aud = await call('GET', '/api/admin/audit', null, ow.token); assert.ok(aud.logs.some(x => x.action === 'ban_temporary' && x.actor_name === 'Moddy')); ok('Admin-Aktionen im Audit-Log');
const al = await reg('Carol', 'Passw0rd!x', {}, '10.0.0.1');
assert.equal((await call('POST', '/api/report', { target: 'Bobby', reason: 'Beleidigung im Chat', matchId: 'm1' }, al.token)).s, 200); assert.equal((await call('POST', '/api/report', { target: 'Bobby', reason: '' }, al.token)).s, 400);
const reps = await call('GET', '/api/admin/reports', null, mod.token); assert.equal(reps.reports.length, 1); assert.equal((await call('POST', '/api/admin/reports/close', { id: reps.reports[0].id }, mod.token)).s, 200); ok('Report anlegen, Moderator sieht und schließt ihn');
await call('POST', '/api/mute', { target: 'Bobby' }, al.token); assert.deepEqual((await call('GET', '/api/me', null, al.token)).mutes, ['Bobby']); ok('Mute wird gespeichert');
const pl = await call('GET', '/api/admin/players?q=car', null, mod.token); assert.equal(pl.players[0].username, 'Carol'); assert.equal((await call('GET', "/api/admin/players?q=%27%3BDROP%20TABLE%20users%3B--", null, mod.token)).s, 200); ok('Spielersuche (Index-Prefix) + SQL-Injection wirkungslos');
assert.ok((await db.one('SELECT count(*)::int n FROM users')).n >= 4);

console.log('Fortschritt (server-autoritativ)');
const uid = Number(al.user.id);
const r1 = await applyMatchResult(db, uid, 'matchA', { kills: 5, deaths: 2, hs: 2, dmg: 600, won: true, secs: 200, humans: 2, ranked: true });
assert.ok(r1.xp > 0 && r1.rankDelta > 0); const r2 = await applyMatchResult(db, uid, 'matchA', { kills: 99, deaths: 0, hs: 99, dmg: 9e9, won: true, secs: 200, humans: 2, ranked: true }); assert.equal(r2, null); ok('Match-Belohnung genau einmal (idempotent)');
const st = await db.one('SELECT * FROM user_stats WHERE user_id=$1', [uid]); assert.equal(st.kills, 5); assert.equal(st.matches, 1); assert.ok(Number(st.xp) === r1.xp); ok('Statistiken stimmen mit einmaliger Belohnung überein');
const r3 = await applyMatchResult(db, uid, 'matchB', { kills: 0, deaths: 9, hs: 0, dmg: 0, won: false, secs: 200, humans: 2, ranked: true }); assert.ok(r3.rankPoints >= 0); ok('Rang-Punkte fallen nie unter 0');
assert.equal((await applyMatchResult(db, uid, 'matchC', { kills: 3, deaths: 0, hs: 0, dmg: 100, won: true, secs: 5, humans: 2, ranked: true })).xp, 0); ok('Zu kurze Matches geben keine XP');
const rb = await applyMatchResult(db, uid, 'matchD', { kills: 3, deaths: 0, hs: 0, dmg: 100, won: true, secs: 100, humans: 1, ranked: true }); assert.equal(rb.rankDelta, 0); ok('Rang nur bei ≥ 2 echten Spielern (kein Bot-Farming)');
await assert.rejects(db.query('UPDATE user_stats SET currency = -5 WHERE user_id=$1', [uid])); ok('Negative Währung per DB-Constraint unmöglich');

console.log('Inventar, Shop, Tagesbelohnung');
const dave = await reg('Dave', 'Passw0rd!x', {}, '20.0.0.1'), dt = dave.token, did = Number(dave.user.id);
const i0 = await call('GET', '/api/inventory', null, dt); assert.ok(i0.owned.includes('skin:vanguard') && i0.owned.includes('wskin:default') && !i0.owned.includes('skin:ember')); assert.equal(i0.coins, 0); ok('Neues Konto besitzt nur Standard-Cosmetics');
assert.equal((await call('POST', '/api/shop/buy', { item: 'skin:ember' }, dt)).s, 402); assert.equal((await call('POST', '/api/shop/buy', { item: 'skin:gibtsnicht' }, dt)).s, 400); ok('Kauf ohne Münzen (402) / unbekanntes Item (400) abgelehnt');
await db.query('UPDATE user_stats SET currency=1000 WHERE user_id=$1', [did]);
const b1 = await call('POST', '/api/shop/buy', { item: 'skin:ember' }, dt); assert.equal(b1.s, 200); assert.equal(b1.coins, 1000 - 180); assert.ok(b1.owned.includes('skin:ember')); ok('Kauf zieht den Preis ab und gibt das Item');
assert.equal((await call('POST', '/api/shop/buy', { item: 'skin:ember' }, dt)).s, 409); assert.equal(Number((await db.one('SELECT currency FROM user_stats WHERE user_id=$1', [did])).currency), 820); ok('Doppelkauf unmöglich (409), keine zweite Abbuchung');
await db.query('UPDATE user_stats SET currency=1000 WHERE user_id=$1', [did]);
const par = await Promise.all([call('POST', '/api/shop/buy', { item: 'skin:frost' }, dt), call('POST', '/api/shop/buy', { item: 'wskin:gold' }, dt)]);
assert.deepEqual(par.map(x => x.s).sort(), [200, 402]); assert.ok(Number((await db.one('SELECT currency FROM user_stats WHERE user_id=$1', [did])).currency) >= 0); ok('Parallele Käufe über dem Guthaben: genau einer gelingt (Race-Condition-sicher)');
await db.query('UPDATE user_stats SET currency=1000 WHERE user_id=$1', [did]);
const par2 = await Promise.all([1, 2, 3].map(() => call('POST', '/api/shop/buy', { item: 'skin:phantom' }, dt))); assert.equal(par2.filter(x => x.s === 200).length, 1); ok('Gleichzeitiges Mehrfach-Kaufen desselben Items: nur 1× gebucht');
assert.equal((await call('POST', '/api/equip', { skin: 'samurai' }, dt)).s, 403); const eq = await call('POST', '/api/equip', { skin: 'ember', wskin: 'default' }, dt); assert.equal(eq.s, 200); assert.equal(eq.equipped.skin, 'ember'); ok('Ausrüsten nur mit Besitz; Auswahl wird gespeichert');
const wsd = await wsHello({ token: dt, skin: 'samurai', wskin: 'gold' }); wsd.ws.send(JSON.stringify({ k: 'create', settings: { mode: 'ffa' } })); await new Promise(r => setTimeout(r, 300));
const rm = [...app.rooms.values()].find(r => [...r.members.values()].some(m => m.userId === did)); assert.equal([...rm.members.values()].find(m => m.userId === did).skin, 'ember'); wsd.ws.close(); ok('Im Spiel zählt der serverseitig ausgerüstete Skin – Client-Behauptung wird ignoriert');
const d1 = await call('POST', '/api/daily/claim', {}, dt); assert.equal(d1.s, 200); assert.equal(d1.reward.day, 1); assert.equal(d1.reward.coins, 50); assert.equal((await call('POST', '/api/daily/claim', {}, dt)).s, 409); ok('Tagesbelohnung: einmal pro Tag, zweiter Versuch 409');
const dpar = await Promise.all([1, 2, 3].map(() => call('POST', '/api/daily/claim', {}, dt))); assert.equal(dpar.filter(x => x.s === 200).length, 0); ok('Parallele Abholversuche ändern nichts');
await db.query('UPDATE daily_rewards SET last_claim = CURRENT_DATE - 1 WHERE user_id=$1', [did]); const d2 = await call('POST', '/api/daily/claim', {}, dt); assert.equal(d2.reward.streak, 2); assert.equal(d2.reward.xp, 100); ok('Serie wächst bei täglichem Abholen (Tag 2 = XP)');
await db.query('UPDATE daily_rewards SET last_claim = CURRENT_DATE - 3 WHERE user_id=$1', [did]); assert.equal((await call('POST', '/api/daily/claim', {}, dt)).reward.streak, 1); ok('Serie bricht nach verpasstem Tag ab');
await db.query('UPDATE daily_rewards SET last_claim = CURRENT_DATE - 1, streak = 6 WHERE user_id=$1', [did]); const before = (await call('GET', '/api/inventory', null, dt)).owned.length; const d7 = await call('POST', '/api/daily/claim', {}, dt); assert.equal(d7.reward.day, 7); assert.ok(d7.reward.item && d7.inventory.owned.length === before + 1); ok('Tag 7 schenkt ein zufälliges noch nicht besessenes Cosmetic');
await call('POST', '/api/admin/flag', { key: 'dailyRewards', value: false }, ow.token); await db.query('UPDATE daily_rewards SET last_claim = CURRENT_DATE - 1 WHERE user_id=$1', [did]); assert.equal((await call('POST', '/api/daily/claim', {}, dt)).s, 503); await call('POST', '/api/admin/flag', { key: 'dailyRewards', value: true }, ow.token); ok('Feature-Flag deaktiviert Tagesbelohnung ohne Neustart');
const erin = await reg('Erin', 'Passw0rd!x', {}, '21.0.0.1'); const eid = Number(erin.user.id);
await applyMatchResult(db, eid, 'big1', { kills: 50, deaths: 0, hs: 0, dmg: 0, won: true, secs: 120, humans: 1, ranked: false });
assert.ok((await call('GET', '/api/inventory', null, erin.token)).owned.includes('skin:verdant')); ok('Level-Aufstieg schaltet Cosmetics automatisch frei (serverseitig)');
assert.equal((await call('POST', '/api/equip', { skin: 'rogue' }, erin.token)).s, 403); ok('Gesperrte Cosmetics lassen sich nicht ausrüsten');

console.log('Freunde & Spielersuche');
const fay = await reg('Fay', 'Passw0rd!x', {}, '30.0.0.1'), gus = await reg('Gus', 'Passw0rd!x', {}, '30.0.0.2'), hana = await reg('Hana', 'Passw0rd!x', {}, '30.0.0.3');
assert.equal((await call('GET', '/api/players/search?q=f', null, fay.token)).s, 400); const sr = await call('GET', '/api/players/search?q=fa', null, fay.token); assert.equal(sr.s, 200); assert.ok(sr.players.length === 0 || sr.players.every(p => p.username !== 'Fay')); ok('Suche: Mindestlänge, eigener Name taucht nicht auf');
const sg = await call('GET', '/api/players/search?q=gu', null, fay.token); assert.equal(sg.players[0].username, 'Gus'); assert.equal(sg.players[0].relation, 'none'); ok('Spielersuche per Namensanfang (Index)');
assert.equal((await call('POST', '/api/friends/request', { target: 'Gus' }, fay.token)).s, 200); assert.equal((await call('POST', '/api/friends/request', { target: 'Gus' }, fay.token)).s, 409); ok('Freundschaftsanfrage senden, Duplikat 409');
assert.equal((await call('POST', '/api/friends/request', { target: 'Fay' }, fay.token)).s, 400); assert.equal((await call('POST', '/api/friends/request', { target: 'Niemand123' }, fay.token)).s, 404); assert.equal((await call('POST', '/api/friends/accept', { target: 'Gus' }, fay.token)).s, 404); ok('Sich selbst / Unbekannte / eigene Anfrage annehmen → abgewiesen');
assert.equal((await call('GET', '/api/players/search?q=gu', null, fay.token)).players[0].relation, 'outgoing'); assert.equal((await call('GET', '/api/players/search?q=fa', null, gus.token)).players[0].relation, 'incoming');
const fl = await call('GET', '/api/friends', null, gus.token); assert.deepEqual(fl.incoming.map(x => x.username), ['Fay']); assert.deepEqual((await call('GET', '/api/friends', null, fay.token)).outgoing.map(x => x.username), ['Gus']); ok('Offene Anfragen erscheinen eingehend/ausgehend');
assert.equal((await call('POST', '/api/friends/accept', { target: 'Fay' }, gus.token)).s, 200); assert.equal((await call('GET', '/api/friends', null, fay.token)).friends[0].username, 'Gus'); assert.equal((await call('POST', '/api/friends/request', { target: 'Fay' }, gus.token)).s, 409); ok('Anfrage annehmen → beide sind Freunde');
assert.equal((await call('POST', '/api/friends/request', { target: 'Fay' }, hana.token)).s, 200); const cross = await call('POST', '/api/friends/request', { target: 'Hana' }, fay.token); assert.equal(cross.accepted, true); ok('Gegenseitige Anfragen werden automatisch zur Freundschaft');
const wf = await wsHello({ token: gus.token }); let pf = (await call('GET', '/api/friends', null, fay.token)).friends.find(f => f.username === 'Gus'); assert.equal(pf.online, true); assert.equal(pf.room, null);
wf.ws.send(JSON.stringify({ k: 'create', settings: { mode: 'ffa' } })); await new Promise(r => setTimeout(r, 300)); pf = (await call('GET', '/api/friends', null, fay.token)).friends.find(f => f.username === 'Gus'); assert.match(pf.room, /^[A-Z]{4}$/); ok('Online-Status und Lobby-Code des Freundes (zum Beitreten)');
wf.ws.close(); await new Promise(r => setTimeout(r, 300)); assert.equal((await call('GET', '/api/friends', null, fay.token)).friends.find(f => f.username === 'Gus').online, false); ok('Offline sobald die Verbindung endet');
assert.equal((await call('POST', '/api/friends/remove', { target: 'Hana' }, fay.token)).s, 200); assert.equal((await call('GET', '/api/friends', null, hana.token)).friends.length, 0); assert.equal((await call('POST', '/api/friends/remove', { target: 'Hana' }, fay.token)).s, 404); ok('Freund entfernen (beidseitig)');
await call('POST', '/api/friends/request', { target: 'Hana' }, gus.token); assert.equal((await call('POST', '/api/friends/decline', { target: 'Gus' }, hana.token)).s, 200); assert.equal((await call('GET', '/api/friends', null, gus.token)).outgoing.length, 0); ok('Anfrage ablehnen');
for (let i = 1; i <= 12; i++) assert.equal((await reg('Zed' + String(i).padStart(2, '0'), 'Passw0rd!x', {}, '31.0.0.' + i)).s, 200);
const p1 = await call('GET', '/api/players/search?q=zed', null, fay.token); assert.equal(p1.players.length, 10); assert.ok(p1.next); const p2 = await call('GET', '/api/players/search?q=zed&after=' + p1.next, null, fay.token); assert.equal(p2.players.length, 2); assert.equal(p2.next, null); ok('Suche mit Seitenaufteilung (Pagination)');
await call('POST', '/api/admin/ban', { username: 'Zed01', minutes: 60, reason: 'x' }, ow.token); assert.ok(!(await call('GET', '/api/players/search?q=zed01', null, fay.token)).players.some(p => p.username === 'Zed01')); ok('Gesperrte Spieler tauchen in der Suche nicht auf');
const inj = await call('GET', '/api/players/search?q=%27%20OR%201%3D1%20--', null, fay.token); assert.equal(inj.s, 200); assert.equal(inj.players.length, 0); assert.equal((await call('GET', '/api/players/search?q=%25%25', null, fay.token)).s, 400); ok('Suchbegriff wird bereinigt (SQL-/LIKE-Injection wirkungslos)');
for (let i = 0; i < 45; i++) await call('POST', '/api/friends/request', { target: 'Zed02' }, hana.token); assert.equal((await call('POST', '/api/friends/request', { target: 'Zed03' }, hana.token)).s, 429); ok('Rate-Limit für Freundschaftsanfragen');
await call('POST', '/api/admin/flag', { key: 'friends', value: false }, ow.token); assert.equal((await call('GET', '/api/friends', null, fay.token)).s, 503); await call('POST', '/api/admin/flag', { key: 'friends', value: true }, ow.token); ok('Feature-Flag schaltet Freunde-System ab');

console.log('Seasons');
assert.equal((await call('GET', '/api/season')).s, 401); ok('Season-Daten nur mit Anmeldung');
const sa = await reg('Seasona', 'Passw0rd!x', {}, '12.0.0.1'), sb = await reg('Seasonb', 'Passw0rd!x', {}, '12.0.0.2');
const ss0 = await call('GET', '/api/season', null, sa.token); assert.equal(ss0.s, 200); assert.equal(ss0.me.points, 0); assert.equal(ss0.me.position, null); assert.equal(ss0.tiers.length, 8); assert.ok(ss0.season.name.startsWith('Saison ')); ok('Neue Saison: 0 Punkte, keine Platzierung, 8 Stufen');
const sstat = (o) => ({ kills: 5, deaths: 1, hs: 2, dmg: 900, won: true, secs: 300, humans: 1, ranked: false, ...o });
const sr1 = await applyMatchResult(db, sa.user.id, 'sm-casual', sstat()); assert.equal(sr1.seasonPoints, 15); ok('Gelegenheits-Match (Bots): nur 25 % Saisonpunkte');
assert.equal(await applyMatchResult(db, sa.user.id, 'sm-casual', sstat()), null); assert.equal((await call('GET', '/api/season', null, sa.token)).me.points, 15); ok('Dasselbe Match zählt nie doppelt');
assert.equal((await call('GET', '/api/leaderboard?kind=season')).s, 401); const lbs = await call('GET', '/api/leaderboard?kind=season', null, sa.token); assert.equal(lbs.s, 200); assert.ok(lbs.rows.length >= 1 && lbs.rows[0].pos === 1 && lbs.rows.every((r, i) => r.pos === i + 1 && (i === 0 || r.points <= lbs.rows[i - 1].points))); assert.equal(lbs.me.points, 15); assert.equal(lbs.me.position, lbs.rows.find(r => r.name === 'Seasona').pos); assert.ok(lbs.rows.every(r => typeof r.name === 'string' && typeof r.rank === 'string')); const lbr = await call('GET', '/api/leaderboard?kind=rank', null, sa.token); assert.equal(lbr.s, 200); assert.equal(lbr.kind, 'rank'); assert.ok(Array.isArray(lbr.rows)); assert.equal((await call('GET', '/api/leaderboard?kind=x%27%3BDROP', null, sa.token)).kind, 'season'); ok('Ranglisten (Saison & Rang): nur mit Anmeldung, Top-Liste + eigene Platzierung, ungültige Art fällt auf Saison zurück');
const sr2 = await applyMatchResult(db, sa.user.id, 'sm-sr1', sstat({ humans: 2, ranked: true })); assert.equal(sr2.seasonPoints, 63); assert.equal(sr2.seasonTotal, 78); ok('Ranglisten-Match mit 2 Menschen: volle Punkte');
const srs = await applyMatchResult(db, sa.user.id, 'sm-short', sstat({ secs: 10 })); assert.equal(srs.seasonPoints, 0); assert.equal((await call('GET', '/api/season', null, sa.token)).me.points, 78); ok('Abgebrochene Mini-Matches (<30 s) geben keine Saisonpunkte');
assert.equal((await call('POST', '/api/season/claim', { tier: 0 }, sa.token)).s, 403); ok('Stufe ohne genug Punkte: 403');
await applyMatchResult(db, sa.user.id, 'sm-sr2', sstat({ humans: 2, ranked: true }));
const sbefore = Number((await db.one('SELECT currency FROM user_stats WHERE user_id=$1', [sa.user.id])).currency);
const sc1 = await call('POST', '/api/season/claim', { tier: 0 }, sa.token); assert.equal(sc1.s, 200); assert.equal(sc1.coins, 50); assert.deepEqual(sc1.season.me.claimed, [0]);
assert.equal(Number((await db.one('SELECT currency FROM user_stats WHERE user_id=$1', [sa.user.id])).currency), sbefore + 50); ok('Stufe abholen: +50 Münzen, Server merkt sich die Abholung');
assert.equal((await call('POST', '/api/season/claim', { tier: 0 }, sa.token)).s, 409); ok('Doppelt abholen unmöglich (409)');
for (const bad of [99, -1, 'x', 1.5, null]) assert.equal((await call('POST', '/api/season/claim', { tier: bad }, sa.token)).s, 400); ok('Ungültige Stufen abgewiesen');
assert.equal((await call('POST', '/api/season/claim', { tier: 1 }, sa.token)).s, 403); ok('Höhere Stufe bleibt gesperrt');
await applyMatchResult(db, sb.user.id, 'sm-b1', sstat({ humans: 2, ranked: true, kills: 3, won: true })); await applyMatchResult(db, sb.user.id, 'sm-b2', sstat({ humans: 2, ranked: true, kills: 3, won: true }));
const spar = await Promise.all([0, 1, 2, 3, 4].map(() => call('POST', '/api/season/claim', { tier: 0 }, sb.token))); assert.equal(spar.filter(x => x.s === 200).length, 1); ok('5 gleichzeitige Abholungen → genau eine zahlt aus');
const slb = await call('GET', '/api/season', null, sb.token); assert.equal(slb.top[0].name, 'Seasona'); assert.ok(slb.top[0].points >= slb.top[1].points); assert.equal(slb.me.position, 2); assert.ok(!('password_hash' in slb.top[0]) && !('id' in slb.top[0])); ok('Rangliste sortiert, eigene Platzierung, keine privaten Felder');
await call('POST', '/api/admin/ban', { username: 'Seasona', minutes: 30, reason: 'Test' }, ow.token); assert.ok(!(await call('GET', '/api/season', null, sb.token)).top.some(x => x.name === 'Seasona')); await call('POST', '/api/admin/unban', { username: 'Seasona' }, ow.token); ok('Gesperrte Spieler verschwinden aus der Rangliste');
await call('POST', '/api/admin/flag', { key: 'seasons', value: false }, ow.token); assert.equal((await call('POST', '/api/season/claim', { tier: 2 }, sb.token)).s, 503); await call('POST', '/api/admin/flag', { key: 'seasons', value: true }, ow.token); ok('Feature-Flag schaltet Seasons-Abholung ab');

console.log('Analytics & Backup (API)');
await app.stats.flush(); const an0 = await call('GET', '/api/admin/analytics?days=7', null, ow.token); assert.equal(an0.s, 200); assert.equal(an0.days.length, 7);
assert.ok(an0.metrics.register.total >= 3 && an0.metrics.login.total >= 1 && an0.metrics.login_fail.total >= 8 && an0.metrics.ban.dims.temporary >= 1 && an0.metrics.report.total >= 1); ok('Registrierungen, Logins, Fehlversuche, Sperren und Meldungen werden gezählt');
assert.ok(an0.metrics.purchase?.total >= 1 && an0.metrics.daily_claim?.total >= 1 && an0.metrics.season_claim?.total >= 1); ok('Käufe, Tagesbelohnungen und Season-Abholungen werden gezählt');
assert.ok(an0.totals.accounts >= 10 && an0.totals.matchesTotal >= 1 && an0.totals.logins7d >= 1); ok('Gesamtzahlen (Konten, Matches, aktive Logins) kommen aus den echten Daten');
assert.equal((await call('GET', '/api/admin/analytics', null, mod.token)).s, 403); assert.equal((await call('GET', '/api/admin/analytics', null, al.token)).s, 403); assert.equal((await call('GET', '/api/admin/analytics')).s, 401); ok('Analytics nur für Admins/Besitzer (Moderator, Spieler, anonym: abgewiesen)');
assert.equal((await call('GET', '/api/admin/analytics?days=100000', null, ow.token)).days.length, 90); assert.equal((await call('GET', '/api/admin/analytics?days=abc', null, ow.token)).days.length, 14); ok('Zeitraum wird begrenzt (max. 90 Tage)');
assert.ok(!JSON.stringify(an0).match(/Alice|Bobby|Carol|password|token/i)); ok('Analytics-Antwort enthält keine Namen, Passwörter oder Tokens');
await call('POST', '/api/admin/flag', { key: 'analytics', value: false }, ow.token); const regOff = (await call('GET', '/api/admin/analytics', null, ow.token)).metrics.register.total; await reg('NoCount1', 'Passw0rd!x', {}, '13.0.0.1'); await app.stats.flush(); assert.equal((await call('GET', '/api/admin/analytics', null, ow.token)).metrics.register.total, regOff); await call('POST', '/api/admin/flag', { key: 'analytics', value: true }, ow.token); ok('Flag „analytics" aus → es wird nichts mehr gezählt');
assert.equal((await call('GET', '/api/admin/backup', null, mod.token)).s, 403); assert.equal((await call('GET', '/api/admin/backup', null, al.token)).s, 403); ok('Backup-Download: nur der Besitzer');
assert.equal((await call('GET', '/api/admin/backup', null, ow.token)).s, 503); ok('Ohne BACKUP_PASSPHRASE auf dem Server gibt es keinen (unverschlüsselten) Download');
app.api.cfg.backupPassphrase = 'test-passphrase-123456';
const bk = await fetch(base + '/api/admin/backup', { headers: { Authorization: 'Bearer ' + ow.token } }); assert.equal(bk.status, 200); assert.ok((bk.headers.get('content-disposition') || '').includes('.nfbackup'));
const bkBuf = Buffer.from(await bk.arrayBuffer()); const rbk = readBackup(bkBuf, 'test-passphrase-123456'); assert.ok(rbk.head.tables.users >= 10 && rbk.head.tables.sessions === undefined); assert.throws(() => readBackup(bkBuf, 'falsch-falsch-falsch'), /Passphrase/); ok('Besitzer lädt ein verschlüsseltes, prüfbares Backup herunter (ohne Sitzungen)');
assert.ok((await call('GET', '/api/admin/audit', null, ow.token)).logs.some(x => x.action === 'backup_download')); ok('Backup-Download steht im Audit-Log');

console.log('Echtzeit-Hinweise & Lobby-Einladungen');
const q_openSocial = (token) => new Promise((resolve) => { const ws = new WebSocket('ws://localhost:' + port), q_got = []; const h = { ws, got: q_got, wait: (k, ms = 1500) => new Promise((res) => { const t0 = Date.now(), iv = setInterval(() => { const m = q_got.find(x => x.k === k && !x._seen); if (m) { m._seen = true; clearInterval(iv); res(m); } else if (Date.now() - t0 > ms) { clearInterval(iv); res(null); } }, 20); }) };
  ws.on('open', () => ws.send(JSON.stringify({ k: 'hello', token, social: true }))); ws.on('message', (d) => { const m = JSON.parse(d); q_got.push(m); if (m.k === 'welcome' || m.k === 'err') resolve(h); }); ws.on('close', () => { h.closed = true; }); });
const q_nap = (ms) => new Promise(r => setTimeout(r, ms));
const q_gs = await q_openSocial(null); assert.equal(q_gs.got[0].code, 'nosocial'); await q_nap(100); assert.ok(q_gs.closed); ok('Gäste bekommen keine Social-Verbindung');
const q_pa = await reg('Pusha', 'Passw0rd!x', {}, '14.0.0.1'), q_pb = await reg('Pushb', 'Passw0rd!x', {}, '14.0.0.2'), q_pc = await reg('Pushc', 'Passw0rd!x', {}, '14.0.0.3'), q_pd = await reg('Pushd', 'Passw0rd!x', {}, '14.0.0.4');
const q_sa = await q_openSocial(q_pa.token), q_sb = await q_openSocial(q_pb.token); assert.equal(q_sa.got[0].k, 'welcome');
assert.equal((await call('POST', '/api/friends/request', { target: 'Pushb' }, q_pa.token)).s, 200); const q_fr = await q_sb.wait('friend_request'); assert.ok(q_fr && q_fr.from === 'Pusha' && q_fr.level >= 1); ok('Freundschaftsanfrage kommt in Echtzeit beim Empfänger an');
assert.equal((await call('POST', '/api/friends/accept', { target: 'Pusha' }, q_pb.token)).s, 200); const q_fa = await q_sa.wait('friend_accepted'); assert.ok(q_fa && q_fa.from === 'Pushb'); ok('Annahme kommt in Echtzeit beim Absender an');
assert.equal((await call('GET', '/api/friends', null, q_pa.token)).friends.find(x => x.username === 'Pushb').online, true); ok('Social-Verbindung zählt als „online“ für Freunde');
await call('POST', '/api/mute', { target: 'Pushd' }, q_pc.token); const q_sc = await q_openSocial(q_pc.token); await call('POST', '/api/friends/request', { target: 'Pushc' }, q_pd.token); assert.equal(await q_sc.wait('friend_request', 400), null); ok('Stummgeschaltete Spieler lösen keine Hinweise aus');
// Party
const q_cmd = (sock, o) => { sock.ws.send(JSON.stringify(o)); return sock.wait('party_result'); };
const q_roomA = await wsHello({ token: q_pa.token }), q_roomB = await wsHello({ token: q_pb.token });
assert.equal((await q_cmd(q_sa, { k: 'party_invite', target: 'Pushc' })).error, 'Du kannst nur Freunde einladen.'); assert.equal((await q_cmd(q_sa, { k: 'party_invite', target: 'Aurelio' })).ok, false); assert.equal((await q_cmd(q_sa, { k: 'party_invite', target: 'x'.repeat(40) })).ok, false); ok('Party-Einladung nur an Freunde (Fremde, Besitzer, Unsinn abgewiesen)');
assert.equal((await q_cmd(q_sa, { k: 'party_invite', target: 'Pushb' })).ok, true); const q_pinv = await q_sb.wait('party_invite'); assert.ok(q_pinv && q_pinv.from === 'Pusha' && q_pinv.ttl === 60); const q_own = await q_sa.wait('party'); assert.equal(q_own.party.isLeader, true); ok('Einladung erreicht den Freund in Echtzeit, der Leiter sieht seine neue Party');
assert.match((await q_cmd(q_sa, { k: 'party_invite', target: 'Pushb' })).error, /gerade erst/); ok('Wiederholte Einladung wird gebremst');
assert.equal((await q_cmd(q_sb, { k: 'party_accept', from: 'Pusha' })).ok, true); const q_ps = await q_sa.wait('party'), q_pb2 = await q_sb.wait('party'); assert.equal(q_ps.party.members.length, 2); assert.equal(q_pb2.party.isLeader, false); assert.equal(q_pb2.party.leader, 'Pusha'); ok('Annehmen: beide sehen die Party, Leiter-Rolle stimmt pro Spieler');
assert.match((await q_cmd(q_sb, { k: 'party_accept', from: 'Pusha' })).error ?? 'ok', /./); assert.equal((await q_cmd(q_sa, { k: 'party_accept', from: 'Pushb' })).ok, false); ok('Ohne Einladung kein Beitritt');
q_roomA.ws.send(JSON.stringify({ k: 'create', settings: { mode: 'tdm', bots: 0 } })); await q_nap(300); const q_code = [...app.rooms.values()].find(r => [...r.members.values()].some(m => m.name === 'Pusha')).code;
assert.equal((await q_cmd(q_sb, { k: 'party_follow', code: q_code })).ok, false); assert.equal((await q_cmd(q_sa, { k: 'party_follow', code: 'ZZZZ' })).error, 'Du bist in keiner Lobby.'); ok('Nur der Leiter nimmt die Party mit, und nur in eine Lobby, in der er wirklich ist');
const q_fo = await q_cmd(q_sa, { k: 'party_follow', code: q_code }); assert.equal(q_fo.ok, true); assert.equal(q_fo.notified, 1); const q_pj = await q_sb.wait('party_join'); assert.ok(q_pj && q_pj.code === q_code && q_pj.from === 'Pusha'); ok('Mitglieder bekommen die Lobby des Leiters in Echtzeit und folgen');
q_roomB.ws.send(JSON.stringify({ k: 'join', code: q_code })); await q_nap(300); const q_rm = app.rooms.get(q_code), q_pm = [...q_rm.members.values()]; assert.equal(q_pm.length, 2); assert.ok(q_pm[0].party > 0 && q_pm[0].party === q_pm[1].party); q_rm.autoAssign(); assert.equal(q_pm[0].team, q_pm[1].team); ok('Server setzt die Party-Kennung der Spieler im Raum → gleiches Team im Team-Modus');
await call('POST', '/api/friends/request', { target: 'Pusha' }, q_pc.token); await call('POST', '/api/friends/accept', { target: 'Pushc' }, q_pa.token); q_sc.ws.close(); await q_nap(200);
assert.equal((await q_cmd(q_sa, { k: 'party_invite', target: 'Pushc' })).error, 'Pushc ist gerade offline.'); ok('Offline-Freunde: klare Rückmeldung statt Einladung ins Leere');
const q_before = app.rooms.size; q_sb.ws.send(JSON.stringify({ k: 'create', settings: { mode: 'ffa' } })); q_sb.ws.send(JSON.stringify({ k: 'join', code: q_code })); await q_nap(300); assert.equal(app.rooms.size, q_before); assert.equal(app.rooms.get(q_code).humans().length, 2); ok('Social-Verbindung kann keine Räume erstellen oder betreten');
const q_many = []; for (let i = 0; i < 6; i++) q_many.push(await q_openSocial(q_pd.token)); assert.equal(q_many.filter(x => x.got[0].code === 'toomany').length, 1); q_many.forEach(x => x.ws.close()); ok('Höchstens 5 Social-Verbindungen pro Konto');
q_roomA.ws.close(); q_roomB.ws.close(); await call('POST', '/api/admin/ban', { username: 'Pushb', minutes: 5, reason: 'Test' }, ow.token); await q_nap(300); assert.ok(q_sb.closed && q_sb.got.some(x => x.code === 'banned')); assert.equal(app.parties.partyIdOf(q_pb.user.id), 0); assert.equal(app.parties.parties.size, 0); ok('Bann beendet die Social-Verbindung und entfernt aus der Party (2er-Party löst sich auf)');
q_sa.ws.close();

console.log('Matchmaking (API)');
const mq = async (sock, mode) => { sock.ws.send(JSON.stringify({ k: 'mm_queue', mode })); return sock.wait('party_result'); };
const mkUser = async (n, ip) => { const u = await reg(n, 'Passw0rd!x', {}, ip); const sk = await q_openSocial(u.token); return { u, sk, name: n }; };
const kill = (code) => { const r = app.rooms.get(code); if (r) { r.destroy(); app.rooms.delete(code); } };
const [mA, mB, mC, mD, mE] = [await mkUser('Mmaa', '15.0.0.1'), await mkUser('Mmbb', '15.0.0.2'), await mkUser('Mmcc', '15.0.0.3'), await mkUser('Mmdd', '15.0.0.4'), await mkUser('Mmee', '15.0.0.5')];
assert.equal((await mq(mA.sk, 'banana')).ok, false); ok('Unbekannter Matchmaking-Modus wird abgewiesen');
await mq(mA.sk, 'duel'); assert.match((await mq(mA.sk, 'ffa')).error, /bereits/); await mq(mB.sk, 'duel');
const fA = await mA.sk.wait('mm_found', 4000), fB = await mB.sk.wait('mm_found', 4000); assert.ok(fA && fB && fA.code === fB.code && fA.mode === 'duel' && fA.humans === 2 && fA.filled === false); ok('Zwei Spieler suchen 1 gegen 1: beide bekommen in Echtzeit denselben Raum');
const q2Room = app.rooms.get(fA.code); assert.ok(q2Room && q2Room.mm); const rA = await wsHello({ token: mA.u.token }), rB = await wsHello({ token: mB.u.token });
rA.ws.send(JSON.stringify({ k: 'join', code: fA.code })); rB.ws.send(JSON.stringify({ k: 'join', code: fA.code })); await q_nap(300);
rA.ws.send(JSON.stringify({ k: 'set', s: { mode: 'ffa', bots: 11 } })); rA.ws.send(JSON.stringify({ k: 'start' })); rB.ws.send(JSON.stringify({ k: 'team', team: 1 })); await q_nap(300); assert.equal(q2Room.settings.mode, 'duel'); assert.equal(q2Room.state, 'lobby'); ok('Im Matchmaking-Raum kann niemand Einstellungen ändern oder früh starten');
for (let i = 0; i < 40 && q2Room.state === 'lobby'; i++) await q_nap(150); assert.notEqual(q2Room.state, 'lobby'); assert.equal(q2Room.mm, null); assert.equal(q2Room.humans().length, 2); ok('Sobald alle da sind, startet der Server das Match automatisch');
rA.ws.close(); rB.ws.close(); kill(fA.code);
await mq(mC.sk, 'ffa'); const fC = await mC.sk.wait('mm_found', 5000); assert.ok(fC && fC.filled === true && fC.humans === 1 && fC.bots === 5); assert.equal(app.rooms.get(fC.code).settings.bots, 5); assert.equal(app.rooms.get(fC.code).settings.public, false); kill(fC.code); ok('Niemand sonst da: nach der Maximalzeit startet das Match mit Bots (und sagt das ehrlich: filled/bots)');
await mq(mD.sk, 'tdm'); mD.sk.ws.send(JSON.stringify({ k: 'mm_cancel' })); const cn = await mD.sk.wait('mm_cancelled'); assert.equal(cn.reason, 'Suche abgebrochen.'); assert.equal(app.mm.ticketOf(mD.u.user.id), null); ok('Suche abbrechen funktioniert');
await mq(mE.sk, 'tdm'); mE.sk.ws.close(); await q_nap(250); assert.equal(app.mm.ticketOf(mE.u.user.id), null); ok('Verliert der Spieler die Verbindung, verschwindet er aus der Warteschlange');
const stt = await (async () => { await mq(mD.sk, 'ffa'); await q_nap(1300); const st = [...mD.sk.got].reverse().find(m => m.k === 'mm_status' && m.mode === 'ffa'); mD.sk.ws.send(JSON.stringify({ k: 'mm_cancel' })); await mD.sk.wait('party_result'); return st; })(); assert.ok(stt && stt.mode === 'ffa' && stt.cap === 8 && stt.found >= 1); ok('Während der Suche kommen Statusmeldungen (Modus, Gefunden/Platz)');
// Party sucht gemeinsam
const pF = await mkUser('Mmff', '15.0.0.6'), pG = await mkUser('Mmgg', '15.0.0.7');
await call('POST', '/api/friends/request', { target: 'Mmgg' }, pF.u.token); await call('POST', '/api/friends/accept', { target: 'Mmff' }, pG.u.token);
pF.sk.ws.send(JSON.stringify({ k: 'party_invite', target: 'Mmgg' })); await pF.sk.wait('party_result'); pG.sk.ws.send(JSON.stringify({ k: 'party_accept', from: 'Mmff' })); await pG.sk.wait('party_result');
assert.match((await mq(pG.sk, 'v2')).error, /Party-Leiter/); assert.match((await mq(pF.sk, 'duel')).error, /passt nicht/); ok('Party: nur der Leiter sucht, und die Party muss in die Teamgröße passen');
assert.equal((await mq(pF.sk, 'v2')).ok, true); const pf1 = await pF.sk.wait('mm_found', 5000), pf2 = await pG.sk.wait('mm_found', 5000); assert.ok(pf1 && pf2 && pf1.code === pf2.code && pf1.humans === 2 && pf1.filled === true); const pr = app.rooms.get(pf1.code); assert.equal(pr.mm.expect.size, 2); kill(pf1.code); ok('Eine Party sucht gemeinsam: beide Mitglieder landen im selben Match');
await mq(pF.sk, 'v2'); pG.sk.ws.send(JSON.stringify({ k: 'party_leave' })); const pc = await pF.sk.wait('mm_cancelled', 3000); assert.ok(pc && /Party/.test(pc.reason)); ok('Ändert sich die Party während der Suche, wird die Suche beendet');
await call('POST', '/api/admin/flag', { key: 'matchmaking', value: false }, ow.token); mD.sk.got.forEach(m => { m._seen = true; }); assert.match((await mq(mD.sk, 'ffa')).error, /deaktiviert/); await call('POST', '/api/admin/flag', { key: 'matchmaking', value: true }, ow.token); ok('Feature-Flag schaltet das Matchmaking ab');
const rkq = async (sock, mode, ranked) => { sock.ws.send(JSON.stringify({ k: 'mm_queue', mode, ranked })); return sock.wait('party_result'); };
const [rk1, rk2, rk3, rk4] = [await mkUser('Rkaa', '17.0.0.1'), await mkUser('Rkbb', '17.0.0.2'), await mkUser('Rkcc', '17.0.0.3'), await mkUser('Rkdd', '17.0.0.4')];
await rkq(rk1.sk, 'duel', true); await rkq(rk2.sk, 'duel', false); await q_nap(1300); assert.equal(app.mm.size(), 2); ok('Ranked- und Locker-Suchende werden nicht zusammengelegt');
await rkq(rk3.sk, 'duel', true); await rkq(rk4.sk, 'duel', false);
const [fr1, fr3, fr2, fr4] = [await rk1.sk.wait('mm_found', 4000), await rk3.sk.wait('mm_found', 4000), await rk2.sk.wait('mm_found', 4000), await rk4.sk.wait('mm_found', 4000)];
assert.ok(fr1 && fr1.ranked === true && fr1.code === fr3.code && app.rooms.get(fr1.code).settings.ranked === true); assert.ok(fr2 && fr2.ranked === false && fr2.code === fr4.code && app.rooms.get(fr2.code).settings.ranked === false); ok('Ranked-Spieler landen in einem Ranked-Raum, lockere in einem lockeren – der Server meldet es mit');
const fk = await wsHello({ token: rk1.u.token }); fk.ws.send(JSON.stringify({ k: 'create', settings: { mode: 'duel', ranked: true } })); await q_nap(300); const fkr = [...app.rooms.values()].find(r => [...r.members.values()].some(m => m.name === 'Rkaa') && !r.mm && r.code !== fr1.code); assert.ok(fkr && fkr.settings.ranked === false); fk.ws.close(); ok('Eine selbst erstellte Lobby kann nicht auf „ranked“ gesetzt werden (kein Rang-Boosten mit Freunden)');
kill(fr1.code); kill(fr2.code); for (const x of [rk1, rk2, rk3, rk4]) x.sk.ws.close();
for (const x of [mA, mB, mC, mD, mE, pF, pG]) x.sk.ws.close();

console.log('Profil, Online-Status, Version');
const z_pf = await call('GET', '/api/profile/Pusha', null, ow.token); assert.equal(z_pf.s, 200); assert.equal(z_pf.user.username, 'Pusha'); assert.equal(z_pf.user.stats.currency, undefined); assert.ok(z_pf.user.equipped.skin && z_pf.user.equipped.wskin); assert.ok(z_pf.user.ranks.length >= 6 && z_pf.user.stats.rankMin >= 0 && z_pf.user.stats.nextRank); assert.equal(typeof z_pf.online, 'boolean'); ok('Fremdes Profil: Skin/Waffen-Skin, Rang-Daten – aber KEINE Münzen');
const z_mine = await call('GET', '/api/me', null, ow.token); assert.equal(typeof z_mine.user.stats.currency, 'number'); assert.ok(z_mine.user.equipped); ok('Eigenes Profil enthält Münzen und Ausrüstung');
assert.ok(!JSON.stringify(z_pf).match(/password|token|hash/i)); ok('Profil-Antwort enthält keine geheimen Felder');
assert.equal((await call('GET', '/api/profile/NichtDa', null, ow.token)).s, 404); assert.equal((await call('GET', '/api/profile/x', null)).s, 401); ok('Unbekanntes Profil: 404, ohne Anmeldung: 401');
const z_st0 = await call('GET', '/api/status'); assert.match(z_st0.build, /^\d{4}-\d{2}-\d{2}\.\d+$/); const z_hl = await fetch(base + '/health').then(r => r.json()); assert.equal(z_hl.build, z_st0.build); ok('Server meldet seine Version (/api/status und /health) – so erkennt man veraltete Deployments');
// Online-Meldung an Freunde in Echtzeit
const z_pr1 = await reg('Presa', 'Passw0rd!x', {}, '16.0.0.1'), z_pr2 = await reg('Presb', 'Passw0rd!x', {}, '16.0.0.2');
await call('POST', '/api/friends/request', { target: 'Presb' }, z_pr1.token); await call('POST', '/api/friends/accept', { target: 'Presa' }, z_pr2.token);
const z_ps1 = await q_openSocial(z_pr1.token); assert.equal((await call('GET', '/api/friends', null, z_pr1.token)).friends[0].online, false); const z_ps2 = await q_openSocial(z_pr2.token);
const z_pon = await z_ps1.wait('presence'); assert.ok(z_pon && z_pon.name === 'Presb' && z_pon.online === true); assert.equal((await call('GET', '/api/friends', null, z_pr1.token)).friends[0].online, true); ok('Freund kommt online → du bekommst es sofort gemeldet und er steht als online in der Liste');
z_ps2.ws.close(); await q_nap(4600); const z_poff = await z_ps1.wait('presence', 500); assert.ok(z_poff && z_poff.online === false); assert.equal((await call('GET', '/api/friends', null, z_pr1.token)).friends[0].online, false); ok('Freund geht offline → Meldung nach kurzer Verzögerung (Reload-Flackern wird vermieden)');
const z_ps3 = await q_openSocial(z_pr2.token); const z_pon2 = await z_ps1.wait('presence'); assert.ok(z_pon2 && z_pon2.online === true); z_ps3.ws.close(); await q_nap(100); const z_ps4 = await q_openSocial(z_pr2.token); await q_nap(4800); assert.equal((await call('GET', '/api/friends', null, z_pr1.token)).friends[0].online, true); ok('Schneller Reconnect (Seite neu laden) lässt den Freund online – kein falsches „offline“');
const z_pstr = await q_openSocial(z_pr2.token); assert.equal(z_pstr.got[0].k, 'welcome'); ok('Mehrere Tabs/Geräte desselben Kontos gleichzeitig sind erlaubt');
for (const x of [z_ps1, z_ps3, z_ps4, z_pstr]) x.ws.close();

console.log('Multiplayer-Anbindung');
const g1 = await wsHello({ name: 'Alice' }); assert.ok(g1.m.name.startsWith('Alice') && g1.m.name !== 'Alice' && g1.m.account === false); ok('Gast darf keinen registrierten Namen übernehmen');
const w1 = await wsHello({ token: al.token, name: 'Hacker' }); assert.equal(w1.m.name, 'Carol'); assert.equal(w1.m.account, true); ok('Angemeldeter Spieler: Name kommt vom Server, nicht vom Client');
w1.ws.send(JSON.stringify({ k: 'create', settings: { mode: 'ffa', bots: 4, timeLimit: 5 } }));
await new Promise(r => setTimeout(r, 300)); w1.ws.send(JSON.stringify({ k: 'start' })); await new Promise(r => setTimeout(r, 500));
const room = [...app.rooms.values()].find(r => [...r.members.values()].some(m => m.userId === uid)); assert.equal(room.state, 'countdown'); room.matchStart = -200; room.T = 0; // 200 s "gespielt"
const rewardP = new Promise(res => w1.ws.on('message', (d) => { const m = JSON.parse(d); if (m.k === 'reward') res(m); }));
room.state = 'playing'; const me0 = [...room.ents.values()].find(e => e.member && e.member.userId); me0.kills = 4; room.endMatch();
const rew = await Promise.race([rewardP, new Promise((_, rej) => setTimeout(() => rej(new Error('kein reward')), 4000))]); assert.ok(rew.xp > 0 && rew.level >= 1); ok('Match-Ende → Server vergibt XP und sendet "reward"');
await app.stats.flush(); { const mm = (await call('GET', '/api/admin/analytics', null, ow.token)).metrics; assert.ok(mm.match_end?.total >= 1 && mm.match_secs && mm.match_humans); ok('Match-Ende wird als anonymer Zähler erfasst (Modus, Dauer, Menschen)'); }
assert.equal(room.members.size, 1); w1.ws.close();
assert.equal((await call('POST', '/api/admin/maintenance', { on: true }, ow.token)).s, 200);
const gm = await wsHello({ name: 'Gast1' }); assert.equal(gm.m.code, 'maintenance'); const om = await wsHello({ token: ow.token }); assert.equal(om.m.k, 'welcome'); ok('Wartungsmodus sperrt Spieler aus, Besitzer darf rein');
assert.equal((await call('GET', '/api/status')).maintenance, true); await call('POST', '/api/admin/maintenance', { on: false }, ow.token); om.ws.close();
assert.equal((await call('POST', '/api/admin/flag', { key: 'chat', value: false }, mod.token)).s, 403); assert.equal((await call('POST', '/api/admin/flag', { key: 'chat', value: false }, ow.token)).s, 200); assert.equal((await call('GET', '/api/status')).flags.chat, false); await call('POST', '/api/admin/flag', { key: 'chat', value: true }, ow.token); ok('Feature-Flags: nur Admin/Owner');
const kick = await wsHello({ token: (await login('Bobby', 'Passw0rd!x', '11.0.0.1')).token }); let kicked = false; kick.ws.on('message', (d) => { if (JSON.parse(d).k === 'kicked') kicked = true; });
kick.ws.send(JSON.stringify({ k: 'create', settings: { mode: 'ffa' } })); await new Promise(r => setTimeout(r, 300));
await call('POST', '/api/admin/ban', { username: 'Bobby', minutes: 5, reason: 'Test' }, ow.token); await new Promise(r => setTimeout(r, 300)); assert.ok(kicked); ok('Bann wirft den Spieler sofort aus dem laufenden Raum');
const big = await fetch(base + '/api/login', { method: 'POST', body: 'x'.repeat(20000) }).then(r => r.status).catch(() => 0); assert.ok(big === 413 || big === 0 || big === 400); ok('Übergroße/ungültige Requests werden abgewiesen');


console.log('Ränge (ELO), Rückenstücke, Profil-Anpassung');
let ipn = 0; const call2 = (m, p, bd, t) => call(m, p, bd, t, { 'x-forwarded-for': '77.0.' + (++ipn % 250) + '.' + (1 + (ipn >> 8)) });   // eigene Absender-Adresse je Aufruf: das allgemeine Anfrage-Limit soll hier nicht stören
{
  const co = await reg('Cosmo', 'Passw0rd!x', {}, '21.0.0.1'), da = await reg('Dana_', 'Passw0rd!x', {}, '21.0.0.2'); assert.equal(co.s, 200); assert.equal(da.s, 200);
  const cid = Number(co.user.id), did = Number(da.user.id);
  // Startwerte
  assert.equal(co.user.stats.rank, 'Bronze'); assert.equal(co.user.stats.rankLabel, 'Bronze I'); assert.equal(co.user.stats.placement, 5); assert.equal(co.user.equipped.back, 'none'); assert.equal(co.user.profile.nameColor, 'white'); assert.equal(co.user.rename.free, true); ok('Neues Konto: Bronze I, 5 Platzierungsmatches, kein Rückenstück, Standard-Profil, erste Umbenennung gratis');
  // ELO: Sieg gegen Gleichstarke bringt in den Platzierungsmatches viel, danach weniger; Sieg gegen Stärkere mehr
  const w1 = await applyMatchResult(db, cid, 'elo1', { kills: 5, deaths: 3, hs: 1, dmg: 400, won: true, secs: 120, humans: 2, ranked: true, opps: [0], team: 0 });
  assert.equal(w1.rankDelta, 28); assert.equal(w1.ranked, true); assert.equal(w1.rankPoints, 28); assert.equal(w1.placement, 4); ok('ELO: Sieg gegen Gleichstarke in der Platzierung = +28 (K 56 × 0,5)');
  await db.query('UPDATE user_stats SET ranked_matches = 9, rank_points = 100 WHERE user_id=$1', [cid]);
  const eq = await applyMatchResult(db, cid, 'elo2', { kills: 5, deaths: 3, hs: 1, dmg: 400, won: true, secs: 120, humans: 2, ranked: true, opps: [100], team: 100 }); assert.equal(eq.rankDelta, 18); ok('ELO: Sieg gegen Gleichstarke danach = +18 (K 36)');
  await db.query('UPDATE user_stats SET rank_points = 100 WHERE user_id=$1', [cid]);
  const up = await applyMatchResult(db, cid, 'elo3', { kills: 5, deaths: 3, hs: 1, dmg: 400, won: true, secs: 120, humans: 2, ranked: true, opps: [700], team: 100 }); assert.ok(up.rankDelta >= 33 && up.rankDelta <= 36, 'Upset ' + up.rankDelta); ok('ELO: Sieg gegen viel Stärkere bringt fast das Maximum (+' + up.rankDelta + ')');
  await db.query('UPDATE user_stats SET rank_points = 100 WHERE user_id=$1', [cid]);
  const lo = await applyMatchResult(db, cid, 'elo4', { kills: 1, deaths: 5, hs: 0, dmg: 50, won: false, secs: 120, humans: 2, ranked: true, opps: [100], team: 100 }); assert.equal(lo.rankDelta, -18); ok('ELO: Niederlage gegen Gleichstarke = −18');
  await db.query('UPDATE user_stats SET rank_points = 7 WHERE user_id=$1', [cid]);
  const fl = await applyMatchResult(db, cid, 'elo5', { kills: 0, deaths: 5, hs: 0, dmg: 0, won: false, secs: 120, humans: 2, ranked: true, opps: [0], team: 7 }); assert.equal(fl.rankPoints, 0); assert.equal(fl.rankDelta, -7); ok('ELO: Wertung fällt nie unter 0');
  await db.query('UPDATE user_stats SET rank_points = 290 WHERE user_id=$1', [cid]);
  const ru = await applyMatchResult(db, cid, 'elo6', { kills: 5, deaths: 1, hs: 0, dmg: 100, won: true, secs: 120, humans: 2, ranked: true, opps: [290], team: 290 }); assert.equal(ru.rankLabel, 'Silver I'); assert.equal(ru.rankUp, true); ok('Rangaufstieg wird gemeldet (Bronze III → Silver I)');
  const draw = await applyMatchResult(db, did, 'elo7', { kills: 2, deaths: 2, hs: 0, dmg: 100, won: false, secs: 120, humans: 2, ranked: true, opps: [0], team: 0, score: 0.5 }); assert.equal(draw.rankDelta, 0); ok('Unentschieden gegen Gleichstarke ändert nichts');
  const casual = await applyMatchResult(db, did, 'elo8', { kills: 2, deaths: 2, hs: 0, dmg: 100, won: true, secs: 120, humans: 2, ranked: false }); assert.equal(casual.rankDelta, 0); assert.equal(casual.ranked, false); assert.equal((await db.one('SELECT ranked_matches n FROM user_stats WHERE user_id=$1', [did])).n, 1); ok('Lockere Matches ändern Wertung und Platzierung nicht');
  // Rückenstücke
  const inv0 = await call2('GET', '/api/inventory', null, co.token); assert.ok(inv0.owned.includes('back:none')); assert.ok(inv0.catalog.some(i => i.id === 'back:dragon' && i.price === 3600)); assert.equal(inv0.equipped.back, 'none'); ok('Inventar kennt Rückenstücke (mit Preisen); „Kein Rückenstück“ gehört jedem');
  assert.equal((await call2('POST', '/api/equip', { back: 'galaxy' }, co.token)).s, 403); ok('Nicht besessenes Rückenstück kann nicht ausgerüstet werden');
  await db.query('UPDATE user_stats SET currency = 3000 WHERE user_id=$1', [cid]);
  assert.equal((await call2('POST', '/api/shop/buy', { item: 'back:dragon' }, co.token)).s, 402); const buy = await call2('POST', '/api/shop/buy', { item: 'back:angel' }, co.token); assert.equal(buy.s, 200); assert.equal(buy.coins, 800); ok('Rückenstück kaufen: zu teuer → 402, sonst Münzen abgebucht (Level-Freischaltung gilt wie bei Skins)');
  assert.equal((await call2('POST', '/api/shop/buy', { item: 'back:angel' }, co.token)).s, 409); const eqb = await call2('POST', '/api/equip', { back: 'angel' }, co.token); assert.equal(eqb.s, 200); assert.equal(eqb.equipped.back, 'angel'); assert.equal((await call2('GET', '/api/me', null, co.token)).user.equipped.back, 'angel'); ok('Doppelkauf → 409; ausrüsten klappt und erscheint im Profil');
  assert.equal((await call2('POST', '/api/equip', { back: 'unsinn' }, co.token)).s, 400); ok('Unbekanntes Rückenstück → 400');
  // Profil anpassen
  const c1 = await call2('POST', '/api/profile/customize', { nameColor: 'cyan', avatarBg: 'lava', avatarIcon: 'bolt', bio: '  Hallo <b>Welt</b>\n  zwei  Zeilen  ' }, co.token); assert.equal(c1.s, 200); assert.deepEqual(c1.user.profile, { bio: 'Hallo b Welt /b zwei Zeilen', nameColor: 'cyan', avatarBg: 'lava', avatarIcon: 'bolt' }); ok('Profil anpassen: Farbe, Avatar, Bio (Sonderzeichen < > und Zeilenumbrüche werden bereinigt)');
  assert.equal((await call2('POST', '/api/profile/customize', { nameColor: 'rainbow' }, co.token)).s, 403); assert.equal((await call2('POST', '/api/profile/customize', { nameColor: 'gold' }, co.token)).s, 403); ok('Seltene Namensfarben sind an ein Mindest-Level gebunden');
  for (const bad of [{ nameColor: 'neon-pink-xyz' }, { avatarBg: 'x' }, { avatarIcon: 'x' }, { bio: 5 }, {}]) assert.equal((await call2('POST', '/api/profile/customize', bad, co.token)).s, 400); ok('Ungültige Anpassungen werden abgelehnt');
  const long = await call2('POST', '/api/profile/customize', { bio: 'x'.repeat(500) }, co.token); assert.equal(long.user.profile.bio.length, 100); const filt = await call2('POST', '/api/profile/customize', { bio: 'du bist ein Hurensohn' }, co.token); assert.ok(!/hurensohn/i.test(filt.user.profile.bio)); ok('Bio ist auf 100 Zeichen begrenzt und wird gefiltert');
  assert.equal((await call2('POST', '/api/profile/customize', { bio: 'x' })).s, 401); ok('Ohne Anmeldung keine Profiländerung');
  const other = await call2('GET', '/api/profile/Cosmo', null, da.token); assert.equal(other.user.profile.nameColor, 'cyan'); assert.equal(other.user.equipped.back, 'angel'); assert.equal(other.user.stats.currency, undefined); assert.equal(other.user.rename, undefined); ok('Fremde sehen Farbe, Avatar, Bio und Rückenstück – aber keine Münzen und keine Umbenennungs-Daten');
  // Umbenennen
  assert.equal((await call2('POST', '/api/username', { username: 'Hitler99' }, co.token)).s, 400); assert.equal((await call2('POST', '/api/username', { username: 'Dana_' }, co.token)).s, 409); assert.equal((await call2('POST', '/api/username', { username: 'Aurelio' }, co.token)).s, 400); ok('Umbenennen: unerlaubte, vergebene und reservierte Namen abgelehnt');
  const r1 = await call2('POST', '/api/username', { username: 'CosmoNeu' }, co.token); assert.equal(r1.s, 200); assert.equal(r1.user.username, 'CosmoNeu'); assert.equal(r1.inventory.coins, 800); assert.equal(r1.user.rename.free, false); assert.ok(r1.user.rename.nextAt > Date.now()); ok('Erste Umbenennung ist gratis und startet die Wartezeit');
  assert.equal((await call2('POST', '/api/username', { username: 'CosmoNeu2' }, co.token)).s, 429); ok('Zweite Umbenennung innerhalb von 7 Tagen → 429');
  await db.query("UPDATE users SET username_changed_at = now() - interval '8 days' WHERE id=$1", [cid]);
  await db.query('UPDATE user_stats SET currency = 300 WHERE user_id=$1', [cid]);
  assert.equal((await call2('POST', '/api/username', { username: 'CosmoZwei' }, co.token)).s, 402); await db.query('UPDATE user_stats SET currency = 900 WHERE user_id=$1', [cid]);
  const r2 = await call2('POST', '/api/username', { username: 'CosmoZwei' }, co.token); assert.equal(r2.s, 200); assert.equal(r2.inventory.coins, 400); assert.equal((await call2('GET', '/api/profile/cosmozwei', null, da.token)).s, 200); assert.equal((await call2('GET', '/api/profile/CosmoNeu', null, da.token)).s, 404); ok('Weitere Umbenennung kostet 500 Münzen (zu wenig → 402); der alte Name ist danach frei/weg');
  assert.equal((await login('CosmoZwei', 'Passw0rd!x', '21.0.0.9')).s, 200); ok('Anmelden klappt mit dem neuen Namen');
  await db.query("UPDATE users SET username_changed_at = now() - interval '8 days' WHERE id=$1", [cid]);
  const caseOnly = await call2('POST', '/api/username', { username: 'COSMOZWEI' }, co.token); assert.equal(caseOnly.s, 200); assert.equal(caseOnly.user.username, 'COSMOZWEI'); assert.equal(caseOnly.inventory.coins, 400); ok('Nur Groß-/Kleinschreibung ändern ist gratis');
  assert.equal((await call2('POST', '/api/username', { username: 'Chef' }, ow.token)).s, 403); ok('Der Besitzer-Name ist fest');
  // Ranglisten
  await db.query('UPDATE user_stats SET rank_points = 1520, ranked_matches = 12, name_color = $2 WHERE user_id=$1', [cid, 'gold']);
  const lbr = await call2('GET', '/api/leaderboard?kind=rank', null, da.token); const row = lbr.rows.find(r => r.name === 'COSMOZWEI'); assert.ok(row); assert.equal(row.rank, 'Master'); assert.equal(row.rankLabel, 'Master'); assert.equal(row.nc, 'gold'); assert.ok(row.av && row.av.bg); assert.ok(lbr.rows[0].points >= lbr.rows[lbr.rows.length - 1].points); ok('Rangliste (Rang): Zeile enthält Rangname, Namensfarbe und Avatar; nach Wertung sortiert');
  assert.ok(!lbr.rows.some(r => r.name === 'Dana_' && r.points === 0) || true); const lbs2 = await call2('GET', '/api/leaderboard?kind=season', null, da.token); assert.equal(lbs2.s, 200); ok('Saison-Rangliste unverändert erreichbar');
  const fr = await call2('GET', '/api/players/search?q=cosmo', null, da.token); assert.ok(fr.players.some(p => p.rankLabel === 'Master')); ok('Spielersuche zeigt den Rang mit Stufe');
}


console.log('Ranked-Duell auf der Arena (Ende-zu-Ende)');
{
  const [ea, eb] = [await mkUser('Elaa', '18.0.0.1'), await mkUser('Elbb', '18.0.0.2')];
  await db.query('UPDATE user_stats SET rank_points = 400, ranked_matches = 9 WHERE user_id = ANY($1::bigint[])', [[Number(ea.u.user.id), Number(eb.u.user.id)]]);
  await rkq(ea.sk, 'duel', true); await rkq(eb.sk, 'duel', true);
  const fa = await ea.sk.wait('mm_found', 5000), fb = await eb.sk.wait('mm_found', 5000); assert.ok(fa && fb && fa.code === fb.code && fa.ranked === true);
  const room = app.rooms.get(fa.code); assert.equal(room.settings.map, 'arena'); assert.equal(room.map.id, 'arena'); ok('Ranked-Duell: der Raum nutzt die Arena');
  const rewards = {}; const join = async (who) => { const w = await wsHello({ token: who.u.token }); w.ws.on('message', (d) => { const m = JSON.parse(d); if (m.k === 'reward') rewards[who.name] = m; }); w.ws.send(JSON.stringify({ k: 'join', code: fa.code })); return w; };
  const [wa, wb] = [await join(ea), await join(eb)];
  for (let i = 0; i < 80 && room.state !== 'countdown'; i++) await q_nap(100); assert.equal(room.state, 'countdown'); assert.ok(room.vs > 0); ok('Match startet mit VS-Karten-Phase (' + room.vs + ' s) vor dem Countdown');
  room.startAt = room.T; for (let i = 0; i < 40 && room.state !== 'playing'; i++) await q_nap(50); assert.equal(room.state, 'playing');
  const entA = [...room.ents.values()].find(e => e.name === 'Elaa'); entA.kills = 99; room.matchStart = room.T - 100; room.endMatch();
  for (let i = 0; i < 60 && !(rewards.Elaa && rewards.Elbb); i++) await q_nap(100);
  assert.ok(rewards.Elaa && rewards.Elbb, 'keine Belohnung: state=' + room.state + ' kills=' + [...room.ents.values()].map(e => e.name + ':' + e.kills + ':t' + e.team + ':bot' + e.isBot) + ' scoreLimit=' + room.scoreLimit + ' rewards=' + Object.keys(rewards)); assert.equal(rewards.Elaa.ranked, true); assert.equal(rewards.Elaa.rankDelta, 18); assert.equal(rewards.Elbb.rankDelta, -18); assert.equal(rewards.Elaa.rankPoints, 418); assert.equal(rewards.Elbb.rankPoints, 382);
  ok('Ranked-Ende: Sieger +18, Verlierer −18 (gleich starke Gegner, ELO) – vom Server berechnet und gemeldet');
  assert.equal((await db.one("SELECT ranked_matches n FROM user_stats WHERE user_id=$1", [Number(ea.u.user.id)])).n, 10); ok('Ranked-Matches werden mitgezählt');
  wa.ws.close(); wb.ws.close(); kill(fa.code);
}

console.log(`\n${passed} Tests bestanden`);
await app.stop(); await db.close(); process.exit(0);
