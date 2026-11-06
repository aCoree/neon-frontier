// Benutzeroberfläche: Menüs, Lobby, HUD, Ergebnis, Einstellungen, Skins, Erfolge.
import { EMOTES, EMOTE_COOLDOWN, CATALOG_BY_ID, MODES, TEAMS, DIFFS, SKINS, WSKINS, WEAPONS, WEAPON_IDS, ACHIEVEMENTS, CONSUMABLES, GADGETS, POWERUPS, AMMO, xpForLevel, itemLabel } from '../shared/defs.js';
import { Progress } from '../game/progress.js';
import { audio } from '../game/audio.js';
import { QUALITY } from '../render/engine.js';
import { Minimap } from './minimap.js';
import { BigMap } from './bigmap.js';
import { SERVER_URL } from '../config.js';
import { resolveServerUrl } from '../game/net.js';
import { Account } from '../game/account.js';
import { Social } from '../game/social.js';
import { BUILD } from '../version.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.g = game; this.stack = []; this.cur = null; this.soloSel = { mode: 'ffa', diff: 'normal', bots: 5, time: 6, tod: 'day' };
    this.hud = new Hud(this, game); this.deadTimer = null; this.lastLobby = null; this.myId = null; this.chatOpen = false;
  }
  init() {
    const g = this.g; this.wireSocial(); this.map = new BigMap(g);
    $('#tab-play').onclick = () => { audio.click(); this.showScreen('menu'); };
    $('#find').onclick = () => this.findClick();
    $('#h-season').onclick = $('#h-board').onclick = () => { audio.click(); if (Account.user) this.go('season'); else this.go('login'); };
    $('#hr-switch').onclick = (e) => { e.stopPropagation(); audio.click(); Progress.d.settings.mmRanked = !Progress.d.settings.mmRanked; Progress.save(); this.renderHome(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && this.cur === 'menu' && !$('#dlg').classList.contains('show') && !/INPUT|TEXTAREA|BUTTON|SELECT|A/.test(e.target?.tagName || '')) { e.preventDefault(); this.findClick(); } });
    $('#pp-leave').onclick = async () => { if (await this.confirm({ title: 'Party verlassen?', lines: ['Du verlässt die Party.'], ok: 'Verlassen', danger: true })) { const r = await Social.cmd({ k: 'party_leave' }); if (!r.ok) this.toast(r.error, 'bad'); } };
    $('#pp-add').onclick = () => { audio.click(); this.go('friends'); };
    // Navigation
    $$('[data-go]').forEach(b => b.addEventListener('click', () => { audio.click(); this.go(b.dataset.go); }));
    $$('[data-back]').forEach(b => b.addEventListener('click', () => { audio.back(); this.back(); }));
    $$('button, .card, .skin, .room').forEach(b => b.addEventListener('mouseenter', () => audio.hover()));
    document.addEventListener('click', (e) => { audio.init(); }, { once: true });
    $('[data-act=training]').onclick = () => { audio.click(); this.startTraining(); };
    $('[data-act=private]').onclick = () => { audio.click(); this.createRoom(false); };
    $('#link-help').onclick = (e) => { e.preventDefault(); this.go('help'); };
    // Profil
    this.initAccount();
    $('#pc-rename').onclick = () => { audio.click(); $('#name-input').value = Progress.d.name; this.go('name'); };
    $('#name-ok').onclick = () => { const n = $('#name-input').value.trim().slice(0, 14); if (n.length < 2) { this.toast('Bitte einen Namen mit mind. 2 Zeichen eingeben.', 'bad'); return; } Progress.d.name = n; Progress.save(); audio.click(); this.refreshProfile(); this.back(); this.afterName && this.afterName(); this.afterName = null; };
    $('#name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#name-ok').click(); });
    // Solo
    this.buildSolo();
    // Multiplayer
    $('#mp-create').onclick = () => { audio.click(); this.createRoom($('#mp-public').checked); };
    $('#mp-join').onclick = () => { audio.click(); this.joinRoom($('#mp-code').value); };
    $('#mp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinRoom($('#mp-code').value); });
    $('#mp-refresh').onclick = () => this.refreshRooms();
    $('#mp-server').value = Progress.d.settings.server || '';
    $('#mp-server-save').onclick = () => { Progress.d.settings.server = $('#mp-server').value.trim(); Progress.save(); this.toast('Server gespeichert'); this.checkServer(); };
    // Lobby
    $('#lobby-leave').onclick = () => { audio.back(); g.leaveToMenu(); };
    $('#lobby-copy').onclick = () => this.copyInvite();
    $('#lobby-shuffle').onclick = () => g.send({ k: 'shuffle' });
    $('#lobby-start').onclick = () => { audio.click(); g.send({ k: 'start' }); };
    $('#lobby-chat-in').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { g.send({ k: 'chat', text: e.target.value }); e.target.value = ''; } });
    this.buildLobbySettings();
    // Pause / Ergebnis
    $('#pause-resume').onclick = () => { audio.click(); g.input.lock(); };
    $('#pause-settings').onclick = () => { audio.click(); this.go('settings', true); };
    $('#pause-help').onclick = () => { audio.click(); this.go('help', true); };
    $('#pause-leave').onclick = () => { audio.back(); this.pause(false); g.leaveToMenu(); };
    $('#res-menu').onclick = () => { audio.back(); $('#results').classList.remove('show'); g.leaveToMenu(); };
    $('#res-lobby').onclick = () => { audio.click(); $('#results').classList.remove('show'); this.backToLobby(); };
    // Einstellungen & Skins & Erfolge
    this.buildSettings(); this.buildSkins(); this.buildAchievements();
    // Chat im Spiel
    addEventListener('keydown', (e) => this.onKey(e));
    this.refreshProfile();
    window.addEventListener('beforeunload', () => Progress.save());
  }

  // ---------- Screens ----------
  showScreen(name) {
    if (name !== 'profile' && this.g.menuOverride) { this.g.menuOverride = null; this.g.refreshMenuChar(); }
    $$('.screen').forEach(s => s.classList.remove('show'));
    this.cur = name; if (name) $('#' + (name === 'hud' ? 'hud' : 's-' + name)).classList.add('show');
    if (name === 'menu') { this.stack = []; this.g.setMenuView('orbit'); this.refreshProfile(); this.loadHome(); }
    if (name === 'skins') { this.g.setMenuView('skins'); this.refreshSkins(); if (Account.user) Account.loadInventory().then(() => this.refreshSkins()); }
    if (name === 'ach') this.refreshAchievements();
    if (name === 'friends') this.openFriends();
    if (name === 'season') this.openSeason();
    if (name === 'profile') this.g.setMenuView('skins');
    if (name === 'mm') this.openMatchmaking();
    if (name === 'multi') { this.checkServer(); this.refreshRooms(); }
    if (name === 'settings') this.syncSettings();
    $('#clickhint').classList.remove('show');
  }
  go(name, overlay) {
    if (this.cur && !overlay) this.stack.push(this.cur);
    if (overlay) { this.overlayFrom = this.cur; this.stack.push(this.cur); $('#pause').classList.remove('show'); }
    if (name === 'name' || name === 'help') { if (this.cur && this.cur !== 'hud') $('#s-' + this.cur).classList.add('show'); }
    if (name === 'settings' && overlay || name === 'help' && overlay) $$('.screen').forEach(s => s.classList.remove('show'));
    this.showScreenKeep(name);
  }
  showScreenKeep(name) {
    if (name !== 'profile' && this.g.menuOverride) { this.g.menuOverride = null; this.g.refreshMenuChar(); }
    const modal = name === 'name' || name === 'help';
    if (!modal) $$('.screen').forEach(s => s.classList.remove('show'));
    this.cur = name; $('#s-' + name).classList.add('show');
    if (name === 'skins') { this.g.setMenuView('skins'); this.refreshSkins(); if (Account.user) Account.loadInventory().then(() => this.refreshSkins()); }
    if (name === 'ach') this.refreshAchievements();
    if (name === 'friends') this.openFriends();
    if (name === 'season') this.openSeason();
    if (name === 'profile') this.g.setMenuView('skins');
    if (name === 'mm') this.openMatchmaking();
    if (name === 'multi') { this.checkServer(); this.refreshRooms(); }
    if (name === 'settings') this.syncSettings();
    if (name === 'solo') this.refreshSolo();
  }
  back() {
    const prev = this.stack.pop();
    $('#s-' + this.cur)?.classList.remove('show');
    if (!prev) { this.showScreen('menu'); return; }
    if (prev === 'hud') { this.cur = 'hud'; $('#hud').classList.add('show'); if (this.g.mode === 'play' && !this.g.matchEnded) $('#pause').classList.add('show'); return; }
    this.cur = null; this.showScreenKeep(prev); if (prev === 'menu') this.g.setMenuView('orbit');
  }

  // ---------- Profil ----------
  refreshProfile() {
    const d = Progress.d, u = Account.user;
    if (u) {
      const s = u.stats; $('#pc-name').textContent = u.username + (u.role !== 'PLAYER' ? ' · ' + u.role : ''); $('#pc-level').textContent = s.level; $('#pc-xp').style.width = (100 * s.xpInto / s.xpNeed) + '%'; $('#pc-xptxt').textContent = `${s.xpInto} / ${s.xpNeed} XP`;
      $('#pc-rank').textContent = `${s.rank.toUpperCase()} · ${s.rankPoints} RP · ${s.currency} Münzen`;
      $('#pc-since').textContent = 'Profil ansehen ›';
    } else {
      const need = xpForLevel(d.level);
      $('#pc-name').textContent = (d.name || 'Spieler') + (Account.available ? ' (Gast)' : ''); $('#pc-level').textContent = d.level; $('#pc-xp').style.width = (100 * d.xp / need) + '%'; $('#pc-xptxt').textContent = `${d.xp} / ${need} XP`;
      $('#pc-rank').textContent = ''; $('#pc-since').textContent = '';
    }
    const dl = Account.inv && Account.inv.daily; $('#pc-daily').style.display = u && dl && dl.enabled && dl.canClaim ? '' : 'none';
    $('#pc-rename').style.display = u ? 'none' : ''; $('#pc-logout').style.display = u ? '' : 'none'; $('#pc-login').style.display = !u && Account.available ? '' : 'none';
    $('#pc-since').onclick = $('#pc-name').onclick = () => { if (Account.user) { audio.click(); this.openProfile(null); } };
    this.renderHome();
    $('#ach-count').textContent = `${Object.keys(d.ach).length} / ${ACHIEVEMENTS.length}`;
  }
  ensureName(then) { if (!Progress.d.name && !Account.user) { this.afterName = then; this.go('name'); $('#name-input').focus(); return false; } return true; }

  updateSocialDot() {
    this.renderHome(); const el = $('#fr-conn'); if (!el) return; const on = Social.connected;
    el.innerHTML = '<span class="sdot' + (on ? ' on' : '') + '"></span>' + (on ? 'Echtzeit-Verbindung aktiv' : (Account.user ? 'Verbinde Echtzeit-Dienst …' : ''));
  }
  showBuild() {
    const el = $('#build-info'); if (!el) return; const srv = Account.serverBuild;
    el.textContent = '· Build ' + BUILD + (srv ? ' · Server ' + srv : ''); el.classList.toggle('warn', !!srv && srv !== BUILD);
    el.title = srv && srv !== BUILD ? 'Spiel und Server haben unterschiedliche Versionen: Seite mit Strg+Shift+R neu laden bzw. den Server (Render) neu deployen.' : 'Spiel- und Server-Version';
  }

  // ---------- Hauptmenü (Home) ----------
  async loadHome() {
    if (!Account.user) { this._season = null; this.renderHome(); return; }
    if (Date.now() - (this._homeT || 0) < 15000) return; this._homeT = Date.now();
    try { this._season = await Account.season(); } catch { /* optional */ } this.renderHome();
  }
  homeMode() {
    const modes = ['ffa', 'tdm', 'duel', 'v2', 'v3'], TEAM = { duel: 1, v2: 2, v3: 3 }, size = this._party ? this._party.members.length : 1;
    let m = Progress.d.settings.mmMode; if (!modes.includes(m) || (TEAM[m] && size > TEAM[m])) m = modes.find(x => !TEAM[x] || size <= TEAM[x]);
    return { modes, TEAM, size, mode: m };
  }
  findClick() {
    if (!Account.user) { audio.click(); this.go('solo'); return; }
    if (this._mm) { audio.back(); Social.cmd({ k: 'mm_cancel' }).then(r => { if (!r.ok) this.toast(r.error, 'bad'); }); return; }
    const p = this._party; if (p && !p.isLeader) { this.toast('Nur der Party-Leiter kann die Suche starten.', 'bad'); return; }
    if (!Social.connected) { this.toast('Verbinde … bitte kurz warten.', 'bad'); return; }
    audio.click(); const { mode } = this.homeMode();
    Social.cmd({ k: 'mm_queue', mode, ranked: !!Progress.d.settings.mmRanked }).then(r => { if (!r.ok) { this.toast(r.error || 'Suche fehlgeschlagen', 'bad'); audio.error(); } });
  }
  renderHome() {
    const home = $('#s-menu'); if (!home) return; const u = Account.user, d = Progress.d, s = u?.stats, se = this._season;
    const RANKC = { Bronze: '#cd7f32', Silver: '#c0c8d4', Gold: '#ffd25a', Platinum: '#7ee8ff', Diamond: '#6aa8ff', Master: '#c77dff' };
    // Währungen & Werte oben rechts
    $('#cur-coins').textContent = u ? (u.stats.currency ?? 0).toLocaleString('de-DE') : '–';
    const rk = s ? s.rank : '–', col = RANKC[rk] || '#8fa6c4'; $('#cur-rank-badge').textContent = rk.slice(0, 1); $('#cur-rank-badge').style.background = col; $('#cur-rank-v').textContent = s ? rk + ' · ' + s.rankPoints : 'kein Rang';
    $('#cur-season').textContent = se && se.enabled ? se.me.points : (u ? 0 : '–');
    $('#hm-name3d').textContent = u ? u.username : (d.name || 'Spieler');
    // Season-Karte
    const tiers = se?.tiers || [], pts = se?.me.points || 0, reached = tiers.filter(t => pts >= t.points).length, claimable = se ? tiers.filter((t, i) => pts >= t.points && !se.me.claimed.includes(i)).length : 0, nxt = tiers.find(t => t.points > pts);
    const card = $('#h-season'); card.style.display = '';
    if (!u) { $('#hs-tier').textContent = '–'; $('#hs-name').textContent = 'Mit Konto: Season, Rang & Matchmaking'; $('#hs-fill').style.width = '0%'; $('#hs-sub').textContent = 'Tippen zum Anmelden / Registrieren'; }
    else if (se && se.enabled) {
      $('#hs-tier').textContent = reached; $('#hs-name').textContent = se.season.name; const prev = reached ? tiers[reached - 1].points : 0;
      $('#hs-fill').style.width = (nxt ? 100 * (pts - prev) / (nxt.points - prev) : 100) + '%';
      $('#hs-sub').textContent = claimable ? '🎁 ' + claimable + ' Belohnung' + (claimable > 1 ? 'en' : '') + ' abholbar!' : (nxt ? (nxt.points - pts) + ' Punkte bis Stufe ' + (reached + 1) : 'Alle Stufen erreicht!');
    } else { $('#hs-tier').textContent = '…'; $('#hs-name').textContent = 'Season'; $('#hs-fill').style.width = '0%'; $('#hs-sub').textContent = se && !se.enabled ? 'Seasons sind gerade deaktiviert' : 'Lädt …'; }
    $('#season-sub').textContent = claimable ? '● ' + claimable : '';
    // Podest (Top 3)
    const pod = $('#podium'); pod.replaceChildren(); const top = se?.top || [];
    for (const [i, cls] of [[1, 'p2'], [0, 'p1'], [2, 'p3']]) { const r = top[i]; if (!r) continue; const c = document.createElement('div'); c.className = 'pod ' + cls; const b = document.createElement('b'); b.textContent = r.name; const n = document.createElement('i'); n.textContent = i + 1; c.append(b, n); pod.appendChild(c); }
    if (!top.length) { const e = document.createElement('div'); e.style.cssText = 'font:700 13px var(--font);opacity:.9;align-self:center'; e.textContent = u ? 'Noch niemand gewertet – spiel ein Match!' : 'Melde dich an, um die Rangliste zu sehen'; pod.appendChild(e); }
    $('#hb-info').textContent = se && se.me.position ? 'Du: Platz ' + se.me.position + ' · ' + pts + ' Punkte' : (se?.top?.length ? top.length + ' Spieler gewertet' : '');
    // Ranked-Karte
    const { modes, TEAM, size, mode } = this.homeMode(), on = !!d.settings.mmRanked, LBL = { ffa: 'FFA', tdm: 'TDM', duel: '1v1', v2: '2v2', v3: '3v3' };
    const badge = $('#hr-badge'); badge.textContent = s ? s.rank.slice(0, 1) : '?'; badge.style.background = s ? col : '#c9a0a8';
    const sw = $('#hr-switch'); sw.setAttribute('aria-checked', on); $('#hr-state').textContent = on ? 'AN' : 'AUS';
    $('#hr-sub').textContent = !u ? 'Mit Konto: Rang sammeln' : (s.rank + ' · ' + s.rankPoints + ' RP' + (s.nextRank ? ' · noch ' + (s.nextRankAt - s.rankPoints) + ' bis ' + s.nextRank : '')) + (on ? ' – nur gegen echte Spieler' : ' – lockeres Spiel, keine Rangpunkte');
    const chips = $('#hr-chips'); chips.replaceChildren();
    for (const m of modes) { const c = document.createElement('button'); c.className = 'chip' + (m === mode ? ' on' : '') + (TEAM[m] && size > TEAM[m] ? ' locked' : ''); c.textContent = LBL[m]; c.title = MODES[m]?.name || m; c.onclick = () => { audio.click(); d.settings.mmMode = m; Progress.save(); this.renderHome(); }; chips.appendChild(c); }
    // Match finden
    const f = $('#find'), t = $('#find-t'), sub = $('#mm-sub'), p = this._party, mm = this._mm;
    f.classList.toggle('busy', !!mm); f.disabled = false; sub.textContent = '';
    if (!u) { t.textContent = 'Spielen'; sub.textContent = 'Als Gast gegen Bots – für Online-Matches anmelden'; }
    else if (mm) { const w = mm.waited | 0; t.textContent = 'Suche abbrechen'; sub.textContent = (mm.ranked ? 'Ranked · ' : '') + (MODES[mm.mode]?.name || mm.mode) + ' · ' + mm.found + '/' + mm.cap + ' Spieler · ' + Math.floor(w / 60) + ':' + String(w % 60).padStart(2, '0'); f.disabled = !!p && !p.isLeader; }
    else if (p && !p.isLeader) { t.textContent = 'Leiter sucht'; sub.textContent = 'Nur der Party-Leiter startet die Suche'; f.disabled = true; }
    else if (!Social.connected) { t.textContent = 'Verbinde …'; sub.textContent = 'Echtzeit-Dienst wird verbunden'; f.disabled = true; }
    else { t.textContent = 'Match finden'; sub.textContent = (on ? 'Ranked · ' : 'Locker · ') + (MODES[mode]?.name || mode) + (p ? ' · Party (' + size + ')' : ''); }
  }

  // ---------- Profil-Bildschirm ----------
  async openProfile(name) {
    this.profName = name || null; this.go('profile'); this.g.setMenuView('skins');
    $('#pf-name').textContent = name || Account.user?.username || ''; $('#pf-stats').replaceChildren(); $('#pf-actions').replaceChildren();
    let user, online = null, relation = null;
    if (!name) { await Account.refresh(); try { await Account.loadInventory(); } catch { /* egal */ } user = Account.user; }
    else { try { const r = await Account.profile(name); user = r.user; online = r.online; } catch (e) { this.toast(e.message, 'bad'); this.back(); return; } }
    if (!user || this.cur !== 'profile') return;
    const s = user.stats, self = !name, eq = self ? (Account.inv?.equipped || user.equipped) : user.equipped;
    this.g.menuOverride = self ? null : { skin: eq?.skin || 'vanguard', wskin: eq?.wskin || 'default' }; this.g.refreshMenuChar();
    const sk = SKINS.find(x => x.id === eq?.skin) || SKINS[0], ws = WSKINS.find(x => x.id === eq?.wskin) || WSKINS[0];
    $('#pf-title').textContent = self ? 'Mein Profil' : 'Profil'; const av = $('#pf-av'); av.textContent = user.username.slice(0, 1).toUpperCase(); av.style.background = sk.armor; av.style.borderColor = sk.accent;
    $('#pf-name').textContent = user.username; $('#pf-lvl').textContent = s.level;
    const tags = $('#pf-tags'); tags.replaceChildren(); const tag = (t, on) => { const x = document.createElement('span'); x.textContent = t; if (on) x.className = 'on'; tags.appendChild(x); };
    if (user.role !== 'PLAYER') tag(user.role); if (!self) tag(online ? 'online' : 'offline', online); else tag('du');
    $('#pf-xp').style.width = (100 * s.xpInto / s.xpNeed) + '%'; $('#pf-xptxt').textContent = s.xpInto + ' / ' + s.xpNeed + ' XP bis Level ' + (s.level + 1);
    // Rang
    const COL = { Bronze: '#cd7f32', Silver: '#c0c8d4', Gold: '#ffd25a', Platinum: '#7ee8ff', Diamond: '#6aa8ff', Master: '#c77dff' }, ranks = user.ranks || [], col = COL[s.rank] || '#fff';
    const rb = $('#pf-rank'); rb.replaceChildren();
    const badge = document.createElement('div'); badge.className = 'rk-badge'; badge.style.background = col; badge.textContent = s.rank.slice(0, 1);
    const info = document.createElement('div'); info.className = 'rk-info'; const rn = document.createElement('b'); rn.textContent = s.rank; rn.style.color = col; const sm = document.createElement('small');
    sm.textContent = s.rankPoints + ' Rangpunkte' + (s.nextRank ? ' · noch ' + (s.nextRankAt - s.rankPoints) + ' bis ' + s.nextRank : ' · höchster Rang') + (s.bestRank !== s.rank ? ' · Bestwert: ' + s.bestRank : '');
    const bar = document.createElement('div'); bar.className = 'rk-bar'; const bi = document.createElement('i'); bi.style.background = col; bi.style.width = (s.nextRankAt ? Math.max(3, 100 * (s.rankPoints - s.rankMin) / (s.nextRankAt - s.rankMin)) : 100) + '%'; bar.appendChild(bi);
    const tiers = document.createElement('div'); tiers.className = 'rk-tiers'; for (const r of ranks) { const t = document.createElement('span'); t.textContent = r.name + ' ' + r.min; if (r.name === s.rank) { t.className = 'cur'; t.style.background = col; t.style.borderColor = col; } tiers.appendChild(t); }
    info.append(rn, sm, bar, tiers); rb.append(badge, info); rb.title = 'Rangpunkte gibt es nur in Ranked-Matches (Spielen → Match suchen → Ranked AN) mit mindestens 2 echten Spielern: Sieg +25 bis +40, Niederlage bis −15.';
    // Statistiken
    const losses = Math.max(0, s.matches - s.wins), wr = s.matches ? Math.round(100 * s.wins / s.matches) + ' %' : '–', hs = s.kills ? Math.round(100 * s.headshots / s.kills) + ' %' : '–';
    const grid = $('#pf-stats'); for (const [v, l] of [[s.matches, 'Matches'], [s.wins, 'Siege'], [losses, 'Niederlagen'], [wr, 'Siegquote'], [s.kd, 'K/D'], [s.kills, 'Kills'], [s.deaths, 'Tode'], [s.headshots, 'Kopftreffer'], [hs, 'HS-Quote']]) { const c = document.createElement('div'); c.className = 'pf-st'; const b = document.createElement('b'); b.textContent = v; const sg = document.createElement('small'); sg.textContent = l; c.append(b, sg); grid.appendChild(c); }
    const gear = $('#pf-gear'); gear.replaceChildren(); for (const [l, v] of [['Charakter', sk.name], ['Waffen-Skin', ws.name]]) { const d = document.createElement('div'); const sg = document.createElement('small'); sg.textContent = l; const b = document.createElement('b'); b.textContent = v; d.append(sg, b); gear.appendChild(d); }
    if (self) { try { const se = await Account.season(); if (se.enabled && this.cur === 'profile') { const d = document.createElement('div'); const sg = document.createElement('small'); sg.textContent = 'Season'; const b = document.createElement('b'); b.textContent = se.me.points + ' Punkte' + (se.me.position ? ' · Platz ' + se.me.position : ''); d.append(sg, b); gear.appendChild(d); } } catch { /* optional */ } }
    $('#pf-since').textContent = 'Konto seit ' + new Date(user.createdAt).toLocaleDateString('de-DE');
    // Aktionen bei fremden Profilen
    const act = $('#pf-actions'); act.replaceChildren();
    if (!self && Account.user) {
      try { const fr = await Account.friends(); relation = fr.friends.some(f => f.username.toLowerCase() === user.username.toLowerCase()) ? 'friend' : fr.outgoing.some(f => f.username.toLowerCase() === user.username.toLowerCase()) ? 'out' : fr.incoming.some(f => f.username.toLowerCase() === user.username.toLowerCase()) ? 'in' : 'none'; } catch { relation = null; }
      const btn = (t, f, primary) => { const b = document.createElement('button'); b.className = 'btn small' + (primary ? ' primary' : ''); b.textContent = t; b.onclick = async () => { b.disabled = true; try { await f(); } catch (e) { this.toast(e.message || 'Fehler', 'bad'); } b.disabled = false; }; act.appendChild(b); };
      if (relation === 'none') btn('Freund hinzufügen', async () => { await Account.friendAction('request', user.username); this.toast('Anfrage gesendet', 'good'); this.openProfile(name); }, true);
      else if (relation === 'in') btn('Anfrage annehmen', async () => { await Account.friendAction('accept', user.username); this.toast(user.username + ' ist jetzt dein Freund!', 'good'); this.openProfile(name); }, true);
      else if (relation === 'out') { const t = document.createElement('small'); t.className = 'pf-sm'; t.textContent = 'Freundschaftsanfrage gesendet …'; act.appendChild(t); }
      else if (relation === 'friend' && online && (!this._party || this._party.isLeader)) btn('Party einladen', () => this.inviteFriend(user.username), true);
    }
  }

  // ---------- Eigene Dialoge (statt confirm()/prompt() des Browsers) ----------
  // dialog({ title, lines:[…], ok, cancel (null = ohne Abbrechen), danger, input:{ placeholder, min, max, value } }) → Promise<true|false|string|null>
  dialog(o) {
    this._dq = (this._dq || Promise.resolve()).then(() => new Promise((resolve) => {
      const dlg = $('#dlg'), box = dlg.firstElementChild, ok = $('#dlg-ok'), cancel = $('#dlg-cancel'), inp = $('#dlg-input'), err = $('#dlg-err'), body = $('#dlg-body'), prev = document.activeElement;
      $('#dlg-title').textContent = o.title || ''; body.replaceChildren(); for (const l of o.lines || []) { const p = document.createElement('p'); if (typeof l === 'string') p.textContent = l; else { p.className = l.cls || ''; p.textContent = l.text; } body.appendChild(p); }
      box.classList.toggle('danger', !!o.danger); ok.textContent = o.ok || 'OK'; ok.classList.toggle('danger', !!o.danger); cancel.textContent = o.cancel || 'Abbrechen'; cancel.style.display = o.cancel === null ? 'none' : '';
      err.textContent = ''; const I = o.input; inp.style.display = I ? 'block' : 'none'; inp.value = I?.value || ''; inp.placeholder = I?.placeholder || ''; inp.maxLength = I?.max || 200;
      const was = this.g.input?.enabled; if (this.g.input) this.g.input.enabled = false;
      const done = (v) => { dlg.classList.remove('show'); dlg.setAttribute('aria-hidden', 'true'); dlg.removeEventListener('keydown', key); ok.onclick = cancel.onclick = dlg.onmousedown = null; if (this.g.input && was) this.g.input.enabled = was; try { prev && prev.focus && prev.focus(); } catch { /* egal */ } resolve(v); };
      const submit = () => { if (I) { const v = inp.value.trim(); if (v.length < (I.min || 0)) { err.textContent = 'Bitte mindestens ' + I.min + ' Zeichen eingeben.'; inp.focus(); return; } done(v); } else done(true); };
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(I ? null : false); } else if (e.key === 'Enter' && e.target !== cancel) { e.preventDefault(); submit(); } else if (e.key === 'Tab') { const f = [I ? inp : null, cancel.style.display === 'none' ? null : cancel, ok].filter(Boolean), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); } e.stopPropagation(); };
      ok.onclick = () => { audio.click(); submit(); }; cancel.onclick = () => { audio.back(); done(I ? null : false); }; dlg.onmousedown = (e) => { if (e.target === dlg && o.cancel !== null) done(I ? null : false); };
      dlg.addEventListener('keydown', key); dlg.classList.add('show'); dlg.setAttribute('aria-hidden', 'false'); (I ? inp : ok).focus();
    }));
    return this._dq;
  }
  confirm(o) { return this.dialog(o); }
  prompt(o) { return this.dialog({ ...o, input: { placeholder: o.placeholder, min: o.min ?? 1, max: o.max ?? 200, value: o.value } }); }

  // ---------- Benachrichtigungskarten (wie in Fortnite: oben/unten rechts, mit Aktionen und ablaufender Zeit) ----------
  card({ id, kind = '', name, title, sub, actions = [], ttl = 25 }) {
    const box = $('#notifs'); const old = id && box.querySelector('[data-nid="' + id + '"]'); if (old) old.remove();
    const c = document.createElement('div'); c.className = 'ncard ' + kind; if (id) c.dataset.nid = id;
    const h = document.createElement('div'); h.className = 'nh'; const av = document.createElement('div'); av.className = 'av'; av.textContent = (name || '?').slice(0, 1).toUpperCase();
    const t = document.createElement('div'); t.className = 'tt'; t.textContent = title; const s = document.createElement('small'); s.textContent = sub || ''; t.appendChild(s); h.append(av, t); c.appendChild(h);
    const close = () => { if (!c.isConnected || c.classList.contains('out')) return; c.classList.add('out'); setTimeout(() => c.remove(), 230); };
    if (actions.length) { const a = document.createElement('div'); a.className = 'acts'; for (const x of actions) { const b = document.createElement('button'); b.className = 'btn small' + (x.primary ? ' primary' : ''); b.textContent = x.label; b.onclick = async () => { b.disabled = true; try { await x.run(); } finally { close(); } }; a.appendChild(b); } c.appendChild(a); }
    const bar = document.createElement('div'); bar.className = 'ttl'; bar.style.animationDuration = ttl + 's'; c.appendChild(bar); setTimeout(close, ttl * 1000);
    box.appendChild(c); while (box.children.length > 4) box.firstChild.remove(); audio.notify(); return close;
  }
  inMatchNow() { return this.g.mode === 'play' && this.g.inMatch && !this.g.matchEnded; }
  wireSocial() {
    const quiet = () => this.inMatchNow();   // im Match: Maus ist gesperrt → nur kurzer Hinweis ohne Knöpfe
    Social.listen('friend_request', (m) => {
      if (this.cur === 'friends') this.refreshFriends(); $('#fr-count').textContent = '● neu';
      if (quiet()) { this.toast(m.from + ' möchte dich als Freund hinzufügen (Menü → Freunde)', 'event'); audio.notify(); return; }
      this.card({ id: 'fr:' + m.from, name: m.from, title: m.from + ' möchte dich als Freund hinzufügen', sub: 'Level ' + (m.level || 1), ttl: 30, actions: [
        { label: 'Annehmen', primary: true, run: async () => { try { await Account.friendAction('accept', m.from); this.toast(m.from + ' ist jetzt dein Freund!', 'good'); audio.levelUp(); this.refreshFriends(); } catch (e) { this.toast(e.message, 'bad'); } } },
        { label: 'Ablehnen', run: async () => { try { await Account.friendAction('decline', m.from); this.refreshFriends(); } catch (e) { this.toast(e.message, 'bad'); } } }] });
    });
    Social.listen('friend_accepted', (m) => { this.toast(m.from + ' hat deine Freundschaftsanfrage angenommen!', 'good'); audio.notify(); if (this.cur === 'friends') this.refreshFriends(); });
    Social.listen('_state', () => this.updateSocialDot());
    Social.listen('presence', (m) => {   // Freund kommt online / geht offline – Listen aktualisieren, kurzer Hinweis im Menü
      if (this.cur === 'friends') this.refreshFriends(); if (this.cur === 'lobby') this.refreshLobbyFriends();
      if (m.online && !this.inMatchNow() && this.cur !== 'hud') this.toast(m.name + ' ist jetzt online', 'event');
    });
    Social.listen('party', (m) => this.onParty(m.party));
    Social.listen('party_event', (m) => { this.toast(m.text, 'event'); });
    Social.listen('party_invite', (m) => {
      if (quiet()) { this.toast(m.from + ' lädt dich in seine Party ein (Menü → Party)', 'event'); audio.notify(); return; }
      this.card({ id: 'pi:' + m.from, kind: 'ninv', name: m.from, title: m.from + ' lädt dich in seine Party ein', sub: 'Party · ' + m.size + ' von ' + m.max + ' Plätzen belegt', ttl: m.ttl || 60, actions: [
        { label: 'Beitreten', primary: true, run: async () => { const r = await Social.cmd({ k: 'party_accept', from: m.from }); if (r.ok) { this.toast('Du bist der Party von ' + m.from + ' beigetreten', 'good'); audio.levelUp(); } else { this.toast(r.error || 'Beitritt fehlgeschlagen', 'bad'); audio.error(); } } },
        { label: 'Ablehnen', run: async () => { await Social.cmd({ k: 'party_decline', from: m.from }); } }] });
    });
    // Der Party-Leiter ist einer Lobby beigetreten → mitgehen (nicht mitten im Match)
    Social.listen('party_join', (m) => {
      if (quiet()) { this.toast('Party-Leiter ' + m.from + ' ist einer Lobby beigetreten – nach dem Match bitte nachkommen (Code ' + m.code + ')', 'event'); return; }
      if (this.g.roomCode === m.code) return;
      this.toast(m.from + ' nimmt die Party in eine Lobby mit …', 'event'); audio.notify(); this.joinRoom(m.code);
    });
    Social.listen('mm_status', (m) => this.mmStatus(m));
    Social.listen('mm_cancelled', (m) => { this.mmHide(); this.toast(m.reason || 'Suche beendet.', m.reason === 'Suche abgebrochen.' ? '' : 'bad'); });
    Social.listen('mm_found', (m) => this.mmFound(m));
  }
  // ---------- Matchmaking ----------
  openMatchmaking() {
    const guest = !Account.user; $('#mm-guest').style.display = guest ? '' : 'none'; $('#mm-main').style.display = guest ? 'none' : '';
    if (guest) return; const p = this._party, size = p ? p.members.length : 1, TEAM = { duel: 1, v2: 2, v3: 3 }, box = $('#mm-modes'); box.replaceChildren();
    const modes = ['ffa', 'tdm', 'duel', 'v2', 'v3']; if (!modes.includes(this.mmMode)) this.mmMode = Progress.d.settings.mmMode && modes.includes(Progress.d.settings.mmMode) ? Progress.d.settings.mmMode : 'ffa';
    for (const id of modes) {
      const md = MODES[id], c = document.createElement('div'), bad = TEAM[id] && size > TEAM[id]; c.className = 'card' + (id === this.mmMode ? ' on' : '') + (bad ? ' locked' : ''); c.dataset.id = id;
      const b = document.createElement('b'); b.textContent = md.name; const sp = document.createElement('span'); sp.textContent = bad ? 'Zu groß für deine Party (' + size + ')' : md.desc; c.append(b, sp);
      c.onclick = () => { if (bad) { audio.error(); return; } audio.click(); this.mmMode = id; Progress.d.settings.mmMode = id; Progress.save(); this.openMatchmaking(); }; box.appendChild(c);
    }
    const rk = $('#mm-ranked'), on = !!Progress.d.settings.mmRanked; rk.classList.toggle('on', on); rk.setAttribute('aria-checked', on); $('#mm-ranked-state').textContent = on ? 'AN' : 'AUS';
    $('#mm-ranked-desc').textContent = on ? 'Nur gegen echte Spieler, ohne Bots: Rangpunkte (+/−) und volle Saisonpunkte. Finden sich zu wenige Spieler, wird automatisch ein lockeres Match daraus.' : 'Lockeres Spiel: XP und Münzen, aber keine Rangpunkte.';
    rk.onclick = () => { audio.click(); Progress.d.settings.mmRanked = !on; Progress.save(); this.openMatchmaking(); };
    const leader = !p || p.isLeader; $('#mm-hint').textContent = p ? (leader ? 'Deine Party (' + size + ' Spieler) sucht gemeinsam.' : 'Nur der Party-Leiter kann die Suche starten.') : '';
    const st = $('#mm-start'); st.disabled = !leader || !!this._mm || !Social.connected; st.textContent = this._mm ? 'Suche läuft …' : (Social.connected ? 'Suche starten' : 'Verbinde …');
    st.onclick = async () => { audio.click(); st.disabled = true; const r = await Social.cmd({ k: 'mm_queue', mode: this.mmMode, ranked: !!Progress.d.settings.mmRanked }); if (!r.ok) { this.toast(r.error || 'Suche fehlgeschlagen', 'bad'); audio.error(); st.disabled = false; } else { this.back(); } };
  }
  mmStatus(m) {
    this._mm = m; const bar = $('#mm-bar'); bar.classList.remove('found'); bar.classList.add('show'); const md = MODES[m.mode]?.name || m.mode, p = this._party;
    $('#mmb-title').textContent = m.stage === 'filling' ? (m.ranked && m.found < (m.rankedMin || 2) ? 'Zu wenige Spieler für Ranked – lockeres Match startet' : 'Keine weiteren Spieler – Bots füllen auf') : (m.ranked ? 'Ranked · ' : 'Suche · ') + md;
    $('#mmb-sub').textContent = m.stage === 'filling' ? md + ' startet gleich' : m.found + ' von ' + m.cap + ' Spielern gefunden' + (p ? ' · Party' : '');
    const s = m.waited | 0; $('#mmb-time').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    $('#mmb-cancel').style.display = !p || p.isLeader ? '' : 'none'; $('#mmb-cancel').onclick = async () => { audio.back(); const r = await Social.cmd({ k: 'mm_cancel' }); if (!r.ok) this.toast(r.error, 'bad'); };
    this.renderHome();
  }
  mmHide() { this._mm = null; $('#mm-bar').classList.remove('show', 'found'); this.renderHome(); if (this.cur === 'mm') this.openMatchmaking(); }
  mmFound(m) {
    this._mm = null; const bar = $('#mm-bar'); bar.classList.add('show', 'found'); $('#mmb-title').textContent = 'Match gefunden!'; $('#mmb-sub').textContent = (m.ranked ? 'RANKED · ' : '') + (MODES[m.mode]?.name || m.mode) + ' · ' + m.humans + (m.humans === 1 ? ' Spieler' : ' Spieler') + (m.filled ? ' + Bots' : '');
    $('#mmb-time').textContent = ''; $('#mmb-cancel').style.display = 'none'; audio.levelUp(); this.renderHome(); setTimeout(() => bar.classList.remove('show', 'found'), 3500);
    if (m.downgraded) this.toast('Ranked nicht möglich (zu wenige echte Spieler) – lockeres Match, keine Rangpunkte.', 'event');
    if (this.inMatchNow()) { this.toast('Match gefunden – nach dem laufenden Match bitte beitreten (Code ' + m.code + ')', 'event'); return; }
    this.joinRoom(m.code);
  }
  // Wird nach jedem Betreten eines Raums aufgerufen: der Party-Leiter holt seine Mitglieder nach
  afterJoined(code) { if (Social.party?.isLeader && code) Social.cmd({ k: 'party_follow', code }); }
  // Freund in die Party einladen (die Party entsteht mit der ersten Einladung)
  async inviteFriend(name) {
    if (!Social.connected) { this.toast('Party-Dienst nicht verbunden – bitte kurz warten.', 'bad'); return false; }
    const r = await Social.cmd({ k: 'party_invite', target: name });
    if (r.ok) { this.toast('Party-Einladung an ' + name + ' gesendet', 'good'); audio.click(); } else { this.toast(r.error || 'Einladung fehlgeschlagen', 'bad'); audio.error(); }
    return r.ok;
  }
  onParty(p) {
    const wasIn = !!this._party; this._party = p; this.renderParty(); this.renderHome(); this.g.syncPartyChars(p);
    if (!wasIn && p && p.members.length > 1) audio.notify();
    if (this.cur === 'lobby') this.refreshLobbyFriends(); if (this.cur === 'friends') this.refreshFriends();
  }
  renderParty() {
    const p = this._party, box = $('#party-panel'); if (!box) return; box.style.display = p ? '' : 'none'; if (!p) return;
    $('#pp-n').textContent = p.members.length + ' / ' + p.max; const list = $('#pp-list'); list.replaceChildren();
    for (const m of p.members) {
      const sk = SKINS.find(x => x.id === m.skin) || SKINS[0], row = document.createElement('div'); row.className = 'pp-m';
      const av = document.createElement('span'); av.className = 'av'; av.textContent = m.name.slice(0, 1).toUpperCase(); av.style.background = sk.armor; av.style.borderColor = sk.accent;
      const nm = document.createElement('span'); nm.className = 'nm plink'; nm.title = 'Profil ansehen'; nm.onclick = () => { audio.click(); this.openProfile(m.you ? null : m.name); }; nm.textContent = m.name; const lv = document.createElement('small'); lv.textContent = 'Lv ' + m.level; nm.appendChild(lv);
      const dot = document.createElement('span'); dot.className = 'on' + (m.online ? '' : ' off'); dot.title = m.online ? 'online' : 'Verbindung verloren';
      row.append(av, nm); if (m.leader) { const c = document.createElement('span'); c.className = 'crown'; c.textContent = '♛'; c.title = 'Party-Leiter'; row.appendChild(c); } row.appendChild(dot);
      if (p.isLeader && !m.you) {
        const up = document.createElement('button'); up.textContent = '♛'; up.title = 'Zum Leiter machen'; up.onclick = async () => { const r = await Social.cmd({ k: 'party_promote', target: m.name }); if (!r.ok) this.toast(r.error, 'bad'); };
        const kick = document.createElement('button'); kick.textContent = '✕'; kick.title = 'Aus der Party entfernen'; kick.onclick = async () => { if (await this.confirm({ title: 'Aus der Party entfernen?', lines: [m.name + ' wird aus deiner Party entfernt.'], ok: 'Entfernen', danger: true })) { const r = await Social.cmd({ k: 'party_kick', target: m.name }); if (!r.ok) this.toast(r.error, 'bad'); } };
        row.append(up, kick);
      }
      list.appendChild(row);
    }
    $('#pp-add').style.display = p.isLeader && p.members.length < p.max ? '' : 'none';
  }
  async refreshLobbyFriends() {
    const box = $('#lobby-invite'); if (!Account.user || !Social.connected || this.lastLobby?.auto) { box.style.display = 'none'; return; }
    let d; try { d = await Account.friends(); } catch { return; }
    const inLobby = new Set([...(this.lastLobby?.members || []).map(m => m.name.toLowerCase()), ...(this._party?.members || []).map(m => m.name.toLowerCase())]), list = $('#lobby-friends'), online = d.friends.filter(f => f.online && !f.inMatch && !inLobby.has(f.username.toLowerCase()));
    box.style.display = ''; $('#lobby-invite-n').textContent = '(' + online.length + ' online)'; list.replaceChildren();
    if (!online.length) { list.innerHTML = '<div class="empty">Gerade ist kein Freund online, der eingeladen werden kann.</div>'; return; }
    for (const f of online) {
      const row = document.createElement('div'); row.className = 'room'; const l = document.createElement('div'); l.innerHTML = '<b></b> <small></small>'; l.querySelector('b').textContent = f.username; l.querySelector('small').textContent = 'Lv ' + f.level + (f.room ? ' · in einer Lobby' : ' · im Menü');
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Einladen'; b.onclick = async () => { b.disabled = true; const ok = await this.inviteFriend(f.username); if (ok) { b.textContent = 'Eingeladen ✓'; setTimeout(() => { b.disabled = false; b.textContent = 'Erneut einladen'; }, 15000); } else b.disabled = false; };
      row.append(l, b); list.appendChild(row);
    }
  }
  lobbyFriendsTick() {
    if (this._lfTimer) return; this.refreshLobbyFriends();
    this._lfTimer = setInterval(() => { if (this.cur === 'lobby') this.refreshLobbyFriends(); else { clearInterval(this._lfTimer); this._lfTimer = null; } }, 8000);
  }

  // Chat senden: "/t Text" geht nur ans Team
  sendChat(raw) { const m = /^\/t(?:eam)?\s+([\s\S]+)/i.exec(String(raw).trim()); this.g.send(m ? { k: 'chat', text: m[1], scope: 'team' } : { k: 'chat', text: raw }); }

  // ---------- Emote-Rad ----------
  buildEmoteWheel() {
    const w = $('#emote-wheel'); if (!w || w.dataset.built) return; w.dataset.built = '1';
    EMOTES.forEach((em, i) => {
      const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2, b = document.createElement('div'); b.className = 'ew';
      b.style.left = Math.round(Math.cos(a) * 150) + 'px'; b.style.top = Math.round(Math.sin(a) * 120) + 'px';
      const ic = document.createElement('span'); ic.textContent = em.icon; const k = document.createElement('small'); k.textContent = (i + 1) + ' · ' + em.label; b.append(ic, k);
      b.onclick = () => this.sendEmote(i); w.appendChild(b);
    });
  }
  emoteWheel(show) { this.buildEmoteWheel(); $('#emote-wheel').classList.toggle('show', !!show); }
  sendEmote(i) {
    const now = performance.now(); if (now < (this.emoteReadyAt || 0)) return;
    this.emoteReadyAt = now + EMOTE_COOLDOWN * 1000; this.g.send({ k: 'emote', id: EMOTES[i].id });
    const w = $('#emote-wheel'); w.classList.add('cd'); setTimeout(() => w.classList.remove('cd'), EMOTE_COOLDOWN * 1000);
  }

  // ---------- Season ----------
  async openSeason() {
    const guest = !Account.user; $('#se-guest').style.display = guest ? '' : 'none'; $('#se-main').style.display = guest ? 'none' : ''; $('#se-off').style.display = 'none';
    if (guest) return; await this.refreshSeason();
  }
  async refreshSeason(data) {
    let d = data; if (!d) { try { d = await Account.season(); } catch (e) { this.toast(e.message, 'bad'); return; } }
    $('#se-off').style.display = d.enabled ? 'none' : ''; $('#se-main').style.display = d.enabled ? '' : 'none'; if (!d.enabled) return;
    const left = Math.max(0, Math.ceil((d.season.endsAt - Date.now()) / 86400000)), pts = d.me.points;
    $('#se-name').textContent = d.season.name; $('#se-left').textContent = left <= 1 ? 'endet heute' : 'noch ' + left + ' Tage'; $('#se-pts').textContent = pts;
    $('#se-pos').textContent = d.me.position ? 'Platz ' + d.me.position : 'noch nicht platziert';
    const nextIdx = d.tiers.findIndex(t => t.points > pts), prev = nextIdx > 0 ? d.tiers[nextIdx - 1].points : 0;
    $('#se-fill').style.width = nextIdx < 0 ? '100%' : (100 * (pts - prev) / (d.tiers[nextIdx].points - prev)) + '%';
    $('#se-next').textContent = nextIdx < 0 ? 'Alle Belohnungen erreicht!' : 'Noch ' + (d.tiers[nextIdx].points - pts) + ' Punkte bis Stufe ' + (nextIdx + 1);
    const tiers = $('#se-tiers'); tiers.replaceChildren();
    d.tiers.forEach((t, i) => {
      const done = d.me.claimed.includes(i), ready = !done && pts >= t.points, row = document.createElement('div'); row.className = 'se-tier' + (done ? ' done' : '') + (ready ? ' ready' : '');
      const l = document.createElement('div'), b = document.createElement('b'), s = document.createElement('small'); b.textContent = 'Stufe ' + (i + 1) + ' · +' + t.coins + ' Münzen'; s.textContent = t.points + ' Punkte'; l.append(b, s); row.appendChild(l);
      if (done) { const x = document.createElement('small'); x.textContent = '✓ abgeholt'; row.appendChild(x); }
      else if (ready) { const btn = document.createElement('button'); btn.className = 'btn small'; btn.textContent = 'Abholen'; btn.onclick = async () => { btn.disabled = true; try { const r = await Account.claimSeason(i); audio.levelUp(); this.toast('+' + r.coins + ' Münzen!', 'good'); this.refreshProfile(); this.refreshSeason(r.season); } catch (e) { this.toast(e.message, 'bad'); btn.disabled = false; } }; row.appendChild(btn); }
      else { const x = document.createElement('small'); x.textContent = '🔒'; row.appendChild(x); }
      tiers.appendChild(row);
    });
    const board = $('#se-board'); board.replaceChildren(); $('#se-me-line').textContent = '';
    if (!d.top.length) board.innerHTML = '<div class="empty">Noch niemand in der Rangliste. Spiele ein Match!</div>';
    for (const r of d.top) {
      const row = document.createElement('div'); row.className = 'se-row' + (r.name === Account.user.username ? ' me' : '') + (r.pos <= 3 ? ' top' + r.pos : '');
      const p = document.createElement('span'), n = document.createElement('span'), lv = document.createElement('small'), s = document.createElement('span'); p.className = 'p'; p.textContent = '#' + r.pos; n.className = 'n'; n.textContent = r.name; lv.textContent = 'Lv ' + r.level; s.className = 's'; s.textContent = r.points;
      row.append(p, n, lv, s); row.style.cursor = 'pointer'; row.title = 'Profil ansehen'; row.onclick = () => { audio.click(); if (r.name === Account.user.username) this.openProfile(null); else this.openProfile(r.name); }; board.appendChild(row);
    }
    if (d.me.position > 25) $('#se-me-line').textContent = '(du: Platz ' + d.me.position + ')';
  }

  // ---------- Freunde ----------
  openFriends() {
    clearInterval(this.frTimer);
    const guest = !Account.user; $('#fr-guest').style.display = guest ? '' : 'none'; $('#fr-main').style.display = guest ? 'none' : '';
    if (guest) return; this.refreshFriends(); this.frTimer = setInterval(() => { if (this.cur === 'friends') this.refreshFriends(); else clearInterval(this.frTimer); }, 6000);
  }
  async refreshFriends() {
    this.updateSocialDot(); let d; try { d = await Account.friends(); } catch (e) { this.toast(e.message, 'bad'); return; }
    const row = (name, extra, actions) => { const r = document.createElement('div'); r.className = 'room'; const l = document.createElement('div'); l.style.display = 'flex'; l.style.alignItems = 'center'; l.style.gap = '10px'; l.innerHTML = extra; l.querySelector('.fn').textContent = name; const a = document.createElement('div'); a.style.display = 'flex'; a.style.gap = '8px'; for (const [t, f] of actions) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t; b.onclick = (e) => { e.stopPropagation(); f(); }; a.appendChild(b); } r.append(l, a); return r; };
    const act = (kind, name, msg) => async () => { try { await Account.friendAction(kind, name); audio.click(); if (msg) this.toast(msg, 'good'); this.refreshFriends(); } catch (e) { this.toast(e.message, 'bad'); audio.error(); } };
    const list = $('#fr-list'); list.replaceChildren(); $('#fr-total').textContent = '(' + d.friends.length + ')';
    if (!d.friends.length) list.innerHTML = '<div class="empty">Noch keine Freunde. Suche links nach Spielernamen.</div>';
    for (const f of d.friends) {
      const acts = [['Profil', () => this.openProfile(f.username)]]; if (this._party?.members.some(m => m.name.toLowerCase() === f.username.toLowerCase())) acts.push(['In deiner Party', () => {}]); else if (f.online && !f.inMatch && (!this._party || this._party.isLeader)) acts.push(['Party einladen', () => this.inviteFriend(f.username)]); if (f.room) acts.push(['Beitreten', () => this.joinRoom(f.room)]); acts.push(['✕', async () => { if (await this.confirm({ title: 'Freund entfernen?', lines: [f.username + ' wird aus deiner Freundesliste entfernt.', { cls: '', text: 'Ihr könnt euch jederzeit wieder hinzufügen.' }], ok: 'Entfernen', danger: true })) act('remove', f.username)(); }]);
      list.appendChild(row(f.username, `<span style="width:10px;height:10px;border-radius:50%;background:${f.online ? 'var(--good)' : '#556'};box-shadow:${f.online ? '0 0 8px var(--good)' : 'none'}"></span><b class="fn"></b><small>Lv ${f.level} · ${f.rank} · ${f.online ? (f.inMatch ? 'im Match' : f.room ? 'in einer Lobby' : 'online') : 'offline'}</small>`, acts));
    }
    const inn = $('#fr-in'); inn.replaceChildren(); if (!d.incoming.length) inn.innerHTML = '<div class="empty">Keine offenen Anfragen.</div>';
    for (const r of d.incoming) inn.appendChild(row(r.username, '<b class="fn"></b><small>Lv ' + r.level + '</small>', [['Annehmen', act('accept', r.username, r.username + ' ist jetzt dein Freund!')], ['Ablehnen', act('decline', r.username)]]));
    const out = $('#fr-out'); out.replaceChildren(); for (const r of d.outgoing) out.appendChild(row(r.username, '<b class="fn"></b><small>wartet …</small>', [['Zurückziehen', act('remove', r.username)]]));
    $('#fr-count').textContent = d.incoming.length ? '● ' + d.incoming.length : (d.friends.filter(f => f.online).length ? d.friends.filter(f => f.online).length + ' online' : '');
  }
  async searchPlayers(more) {
    const q = $('#fr-q').value.trim(); if (q.length < 2) return this.toast('Mindestens 2 Zeichen eingeben.', 'bad');
    const box = $('#fr-results'); if (!more) { box.replaceChildren(); this.frNext = null; }
    try {
      const r = await Account.search(q, more ? this.frNext : null); this.frNext = r.next; $('#fr-more').style.display = r.next ? '' : 'none';
      if (!r.players.length && !more) box.innerHTML = '<div class="empty">Keine Spieler gefunden.</div>';
      for (const p of r.players) {
        const d = document.createElement('div'); d.className = 'room'; const l = document.createElement('div'); l.innerHTML = '<b class="fn" style="font:800 17px var(--font);letter-spacing:.05em;color:var(--txt)"></b> <small></small>'; l.querySelector('.fn').textContent = p.username; l.querySelector('small').textContent = 'Lv ' + p.level + ' · ' + p.rank; d.appendChild(l);
        const rel = { friend: 'Freund ✓', outgoing: 'Anfrage gesendet', incoming: 'Hat dir eine Anfrage gesendet' }[p.relation];
        if (rel) { const s = document.createElement('small'); s.textContent = rel; d.appendChild(s); } else { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Hinzufügen'; b.onclick = async () => { try { const x = await Account.friendAction('request', p.username); b.replaceWith(Object.assign(document.createElement('small'), { textContent: x.accepted ? 'Freund ✓' : 'Anfrage gesendet' })); this.refreshFriends(); } catch (e) { this.toast(e.message, 'bad'); } }; d.appendChild(b); }
        box.appendChild(d);
      }
    } catch (e) { this.toast(e.message, 'bad'); }
  }
  async checkFriendRequests() { if (!Account.user) return; try { const d = await Account.friends(); if (d.incoming.length) { this.toast(d.incoming.length + ' neue Freundschaftsanfrage(n)!', 'event'); $('#fr-count').textContent = '● ' + d.incoming.length; } } catch { /* ignorieren */ } }
  initAccount() {
    $('#fr-search').onclick = () => this.searchPlayers(false); $('#fr-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.searchPlayers(false); }); $('#fr-more').onclick = () => this.searchPlayers(true);
    $('#fr-login').onclick = () => { audio.click(); this.go('login'); }; $('#mm-login').onclick = () => { audio.click(); this.go('login'); };
    let mode = 'login'; const err = (t) => { $('#lg-err').textContent = t || ''; };
    const ownerField = () => { $('#lg-owner').style.display = mode === 'register' && $('#lg-user').value.trim().toLowerCase() === 'aurelio' ? '' : 'none'; };
    $$('#lg-mode button').forEach(b => b.onclick = () => { audio.click(); mode = b.dataset.v; $$('#lg-mode button').forEach(x => x.classList.toggle('on', x === b)); $('#lg-pass').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; err(); ownerField(); });
    $('#lg-user').oninput = ownerField;
    const submit = async () => {
      err(); const u = $('#lg-user').value.trim(), p = $('#lg-pass').value; if (!u || !p) return err('Bitte Benutzername und Passwort eingeben.');
      $('#lg-ok').disabled = true;
      try { if (mode === 'login') await Account.login(u, p); else await Account.register(u, p, $('#lg-owner').value); $('#lg-pass').value = ''; $('#lg-owner').value = ''; this.refreshProfile(); this.back(); Social.start(); this.checkFriendRequests(); this.toast('Willkommen, ' + Account.user.username + '!', 'good'); audio.levelUp(); }
      catch (e) { err(e.status ? e.message : 'Server nicht erreichbar.'); audio.error(); }
      $('#lg-ok').disabled = false;
    };
    $('#lg-ok').onclick = submit; $('#lg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    $('#pc-login').onclick = () => { audio.click(); this.go('login'); setTimeout(() => $('#lg-user').focus(), 50); };
    $('#pc-daily').onclick = async () => {
      try { const r = await Account.claimDaily(); audio.levelUp(); this.refreshProfile(); const part = [r.coins ? r.coins + ' Münzen' : '', r.xp ? r.xp + ' XP' : '', r.item ? 'Cosmetic: ' + CATALOG_BY_ID[r.item].name : ''].filter(Boolean).join(' + '); this.toast(`Tag ${r.day}: ${part} (Serie ${r.streak})`, 'good'); }
      catch (e) { this.toast(e.message, 'bad'); }
    };
    $('#pc-logout').onclick = async () => { audio.back(); Social.stop(); await Account.logout(); this.refreshProfile(); this.toast('Abgemeldet.'); };
  }
  showReward(m, old) {
    const s = Account.user.stats, box = $('#res-xp'); if (!box) return;
    box.innerHTML = `<div class="big">+${m.xp} XP</div><div class="lvl">Level ${s.level}${s.level > old.level ? ' – LEVEL UP!' : ''} · Rang ${s.rank}${m.rankDelta ? ' (' + (m.rankDelta > 0 ? '+' : '') + m.rankDelta + ' RP)' : ''} · +${m.coins} Münzen</div><div class="xb"><i style="width:${100 * s.xpInto / s.xpNeed}%"></i></div>${m.seasonPoints ? `<div class="lvl">+${m.seasonPoints} Saisonpunkte (gesamt ${m.seasonTotal})</div>` : ''}`;
    if (s.level > old.level) { this.levelUp(s.level); audio.levelUp(); }
  }
  // ---------- Solo / Training ----------
  buildSolo() {
    const holder = $('#solo-modes'); holder.innerHTML = '';
    for (const [id, m] of Object.entries(MODES)) { const c = document.createElement('div'); c.className = 'card'; c.dataset.id = id; c.innerHTML = `<b>${m.name}</b><span>${m.desc}</span>`; c.onclick = () => { audio.click(); this.soloSel.mode = id; this.refreshSolo(); }; holder.appendChild(c); }
    const seg = (sel, key, num) => $$(sel + ' button').forEach(b => b.onclick = () => { audio.click(); this.soloSel[key] = num ? +b.dataset.v : b.dataset.v; this.refreshSolo(); });
    seg('#solo-diff', 'diff'); seg('#solo-time', 'time', true); seg('#solo-tod', 'tod');
    $('#solo-bots').oninput = (e) => { this.soloSel.bots = +e.target.value; this.refreshSolo(); };
    $('#solo-start').onclick = () => { audio.click(); this.ensureName(() => this.startSolo()) && this.startSolo(); };
  }
  refreshSolo() {
    const s = this.soloSel;
    $$('#solo-modes .card').forEach(c => c.classList.toggle('on', c.dataset.id === s.mode));
    $$('#solo-diff button').forEach(b => b.classList.toggle('on', b.dataset.v === s.diff)); $$('#solo-time button').forEach(b => b.classList.toggle('on', +b.dataset.v === s.time)); $$('#solo-tod button').forEach(b => b.classList.toggle('on', b.dataset.v === s.tod));
    const fixed = MODES[s.mode].size > 0; $('#solo-bots').disabled = fixed; $('#solo-bots').value = s.bots; $('#solo-bots-v').textContent = fixed ? 'auto' : s.bots;
  }
  async startSolo() {
    const s = this.soloSel;
    try { await this.g.connect(true); } catch (e) { this.toast('Start fehlgeschlagen', 'bad'); return; }
    this.g.net.on('joined', () => this.g.net.send({ k: 'start' }));
    this.g.net.send({ k: 'create', settings: { mode: s.mode, bots: s.bots, diff: s.diff, timeLimit: s.time, tod: s.tod, fillBots: true } });
  }
  async startTraining() {
    if (!this.ensureName(() => this.startTraining())) return;
    try { await this.g.connect(true); } catch (e) { return; }
    this.g.net.on('joined', () => this.g.net.send({ k: 'start' }));
    this.g.net.send({ k: 'create', settings: { mode: 'ffa', bots: 0, diff: 'normal', timeLimit: 20, tod: 'day', training: true } });
  }

  // ---------- Multiplayer ----------
  httpBase() { return resolveServerUrl(Progress.d.settings.server).replace(/^ws/, 'http'); }
  async checkServer() {
    const el = $('#srv-status'); el.className = 'srv'; $('span', el).textContent = 'Server wird geprüft …';
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(this.httpBase() + '/health', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
      const j = await r.json(); el.className = 'srv ok'; $('span', el).textContent = `Online · ${j.players} Spieler · ${j.rooms} Räume`; return true;
    } catch (e) { el.className = 'srv bad'; $('span', el).textContent = 'Server nicht erreichbar – siehe README (Server starten / URL eintragen)'; return false; }
  }
  async refreshRooms() {
    const holder = $('#mp-rooms');
    try { const r = await fetch(this.httpBase() + '/rooms', { cache: 'no-store' }); const list = await r.json(); holder.innerHTML = list.length ? '' : '<div class="empty">Keine öffentlichen Räume gefunden.</div>'; for (const rm of list) { const d = document.createElement('div'); d.className = 'room'; d.innerHTML = `<div><b>${rm.code}</b></div><div><small>${esc(rm.host)} · ${esc(rm.mode)}</small></div><small>${rm.players} Spieler</small>`; d.onclick = () => { audio.click(); this.joinRoom(rm.code); }; holder.appendChild(d); } }
    catch { holder.innerHTML = '<div class="empty">Raumliste nicht verfügbar.</div>'; }
  }
  async createRoom(isPublic) {
    if (!this.ensureName(() => this.createRoom(isPublic))) return;
    this.toast('Verbinde …');
    try { await this.g.connect(false); } catch (e) { this.toast('Server nicht erreichbar. Siehe README.', 'bad'); audio.error(); return; }
    const joined = new Promise((res) => this.g.net.on('joined', () => { if (!this.g.inMatch) this.showScreenKeep('lobby'); res(true); }));
    this.g.net.send({ k: 'create', settings: { public: !!isPublic, mode: 'ffa', bots: 3, diff: 'normal', timeLimit: 6, tod: 'day', fillBots: true } });
    return Promise.race([joined, new Promise(r => setTimeout(() => r(false), 6000))]);
  }
  async joinRoom(code) {
    code = String(code || '').toUpperCase().trim();
    if (code.length !== 4) { this.toast('Bitte einen 4-stelligen Code eingeben.', 'bad'); return; }
    if (!this.ensureName(() => this.joinRoom(code))) return;
    this.toast('Verbinde …');
    try { await this.g.connect(false); } catch (e) { this.toast('Server nicht erreichbar. Siehe README.', 'bad'); audio.error(); return; }
    this.g.net.on('joined', (m) => { if (this.cur !== 'lobby' && !this.g.inMatch) this.showScreenKeep('lobby'); });
    this.g.net.send({ k: 'join', code });
  }
  onError(m) { if (m.code === 'banned' || m.code === 'maintenance') { this.g.disconnect(); if (this.cur !== 'menu') this.showScreen('menu'); return; } if (m.code === 'noroom' || m.code === 'full') { this.g.disconnect(); if (this.cur === 'lobby') this.showScreen('menu'); } }
  copyInvite() {
    const code = this.g.roomCode; if (!code) return;
    const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('room', code);
    const ps = Progress.d.settings.server || SERVER_URL; if (ps) u.searchParams.set('server', ps);
    navigator.clipboard?.writeText(u.toString()).then(() => this.toast('Einladungslink kopiert!', 'good'), () => this.toast(u.toString())) || this.toast(u.toString());
  }
  backToLobby() { if (this.g.isHost) this.g.send({ k: 'backlobby' }); this.g.endMatchLocal(); this.g.mode = 'menu'; this.g.enterMenu(); if (this.g.roomCode && this.g.net?.kind === 'ws') { this.showScreenKeep('lobby'); } else this.g.leaveToMenu(); }

  // ---------- Lobby ----------
  buildLobbySettings() {
    const g = this.g, host = () => g.isHost;
    const m = $('#lobby-modes'); m.innerHTML = '';
    for (const [id, mode] of Object.entries(MODES)) { const c = document.createElement('div'); c.className = 'card'; c.dataset.id = id; c.innerHTML = `<b>${mode.name}</b><span>${mode.desc}</span>`; c.onclick = () => { if (host()) { audio.click(); g.send({ k: 'set', s: { mode: id } }); } }; m.appendChild(c); }
    const seg = (sel, key, num) => $$(sel + ' button').forEach(b => b.onclick = () => { if (host()) { audio.click(); g.send({ k: 'set', s: { [key]: num ? +b.dataset.v : b.dataset.v } }); } });
    seg('#lb-diff', 'diff'); seg('#lb-time', 'timeLimit', true); seg('#lb-score', 'scoreLimit', true); seg('#lb-tod', 'tod');
    $('#lb-bots').oninput = (e) => { if (host()) g.send({ k: 'set', s: { bots: +e.target.value } }); };
    $('#lb-fill').onchange = (e) => { if (host()) g.send({ k: 'set', s: { fillBots: e.target.checked } }); };
  }
  setLobby(d, myId) {
    this.myId = myId; this.lastLobby = d; const g = this.g, S = d.settings, mode = MODES[S.mode], host = d.host === myId && !d.auto;
    if (this.cur !== 'lobby' && !g.inMatch && this.cur !== 'hud') this.showScreenKeep('lobby');
    $('#lobby-code').textContent = d.code; $('#lobby-ranked').style.display = d.ranked ? '' : 'none'; this.lobbyFriendsTick(); { const sig = d.members.map(m => m.id).join(); if (sig !== this._lfSig) { this._lfSig = sig; this.refreshLobbyFriends(); } }
    $('#lobby-count').textContent = `(${d.members.length})`;
    $$('#lobby-modes .card').forEach(c => c.classList.toggle('on', c.dataset.id === S.mode)); $('#lobby-modes').classList.toggle('locked', !host);
    const mark = (sel, v) => $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v == v));
    mark('#lb-diff', S.diff); mark('#lb-time', S.timeLimit); mark('#lb-score', S.scoreLimit); mark('#lb-tod', S.tod);
    for (const id of ['#lb-diff', '#lb-time', '#lb-score', '#lb-tod']) $(id).classList.toggle('locked', !host);
    $('#lb-bots').value = S.bots; $('#lb-bots-v').textContent = mode.size ? 'auto' : S.bots; $('#lb-bots').disabled = !host || mode.size > 0; $('#lb-fill').checked = S.fillBots; $('#lb-fill').disabled = !host || !mode.size;
    $('#lobby-hostnote').textContent = d.auto ? '(Matchmaking – automatisch)' : host ? '(du bist Host)' : '(nur der Host ändert Einstellungen)';
    $('#lobby-start').style.display = host ? '' : 'none'; $('#lobby-shuffle').style.display = host && mode.teams ? '' : 'none';
    $('#lobby-wait').textContent = d.auto ? 'Das Match startet automatisch, sobald alle da sind …' : host ? `${mode.name} · bis zu ${mode.max} Spieler` : 'Warte auf den Host …';
    // Spielerliste
    const box = $('#lobby-teams'); box.innerHTML = '';
    const mk = (m) => { const t = TEAMS[m.team]; const row = document.createElement('div'); row.className = 'pl' + (m.id === myId ? ' you' : ''); const sk = SKINS.find(x => x.id === m.skin) || SKINS[0]; row.innerHTML = `<span class="av" style="background:${sk.armor};border-color:${t ? t.color : sk.accent}">${esc((m.name || '?').slice(0, 1).toUpperCase())}</span><span>${esc(m.name)}</span><span class="lv">LV ${m.level || 1}</span>${m.id === d.host ? '<span class="crown" title="Host">♛</span><span class="host">HOST</span>' : ''}`; if (m.acct) for (const ch of [row.children[0], row.children[1]]) { ch.classList.add('plink'); ch.title = 'Profil ansehen'; ch.onclick = () => { audio.click(); this.openProfile(m.id === myId ? null : m.name); }; }
      if (host && m.id !== myId) { const k = document.createElement('button'); k.className = 'kick'; k.textContent = '✕'; k.title = 'Entfernen'; k.onclick = () => g.send({ k: 'kick', id: m.id }); row.appendChild(k); } return row; };
    if (!mode.teams) { const t = document.createElement('div'); t.className = 'team'; t.innerHTML = `<div class="th">Spieler</div>`; d.members.forEach(m => t.appendChild(mk(m))); const bots = mode.size ? 0 : S.bots; if (bots) { const r = document.createElement('div'); r.className = 'pl'; r.innerHTML = `<span class="dot" style="background:#ffd27a"></span><span style="color:var(--dim)">+ ${Math.min(bots, mode.max - d.members.length)} Bots (${DIFFS[S.diff].name})</span>`; t.appendChild(r); } box.appendChild(t); }
    else {
      const unassigned = d.members.filter(m => m.team < 0 || m.team >= mode.teams);
      for (let ti = 0; ti < mode.teams; ti++) {
        const team = TEAMS[ti], ms = d.members.filter(m => m.team === ti); const t = document.createElement('div'); t.className = 'team'; t.style.borderColor = team.color + '88';
        const cap = mode.size ? `${ms.length}/${mode.size}` : `${ms.length}`;
        t.innerHTML = `<div class="th" style="color:${team.color}"><span>${team.name}</span><span>${cap}</span><button class="btn small" data-join="${ti}">Beitreten</button></div>`;
        ms.forEach(m => t.appendChild(mk(m)));
        if (mode.size) for (let i = ms.length; i < mode.size; i++) { const r = document.createElement('div'); r.className = 'pl'; r.innerHTML = `<span class="dot" style="background:#555"></span><span style="color:var(--dim)">${S.fillBots ? '[Bot]' : 'frei'}</span>`; t.appendChild(r); }
        box.appendChild(t);
      }
      if (unassigned.length) { const t = document.createElement('div'); t.className = 'team'; t.innerHTML = '<div class="th"><span>Noch kein Team (automatisch)</span></div>'; unassigned.forEach(m => t.appendChild(mk(m))); box.appendChild(t); }
      $('[data-join]', box).forEach(b => b.onclick = () => { audio.click(); g.send({ k: 'team', team: +b.dataset.join }); }); if (d.auto) $('[data-join]', box).forEach(b => { b.style.display = 'none'; });
    }
  }
  chat(m) {
    const line = `<div>${m.scope === 'team' ? '<i class="tc">[TEAM]</i>' : ''}<b style="color:${m.team >= 0 ? TEAMS[m.team].color : 'var(--c1)'}">${esc(m.from)}</b>: ${esc(m.text)}</div>`;
    for (const sel of ['#lobby-chat', '#chatlog']) { const box = $(sel); box.insertAdjacentHTML('beforeend', line); while (box.children.length > 40) box.firstChild.remove(); box.scrollTop = box.scrollHeight; }
    if (this.g.mode === 'play') audio.hover();
  }

  // ---------- Einstellungen ----------
  buildSettings() {
    const S = Progress.d.settings, g = this.g;
    $$('#set-quality button').forEach(b => b.onclick = () => { audio.click(); S.quality = b.dataset.v; S.shadows = 'auto'; S.particles = QUALITY[S.quality].part; S.viewDist = QUALITY[S.quality].view; Progress.save(); g.engine.applyQuality(S.quality); g.engine.applySettings(S); this.syncSettings(); });
    const segs = [['#set-fps', 'fpsCap', true], ['#set-shadows', 'shadows', false], ['#set-part', 'particles', true], ['#set-view', 'viewDist', true]];
    for (const [sel, key, num] of segs) $$(sel + ' button').forEach(b => b.onclick = () => { audio.click(); S[key] = num ? +b.dataset.v : b.dataset.v; Progress.save(); g.engine.applySettings(S); g.engine.perf.reset(); this.syncSettings(); });
    $('#set-dynres').onchange = (e) => { S.dynRes = e.target.checked; Progress.save(); if (!S.dynRes) g.engine.perf.reset(); };
    $('#set-battery').onchange = (e) => { S.batterySaver = e.target.checked; Progress.save(); g.engine.applySettings(S); g.engine.perf.reset(); };
    $('#set-scale').oninput = (e) => { S.renderScale = +e.target.value; $('#set-scale').parentElement.querySelector('b').textContent = Math.round(S.renderScale * 100) + '%'; Progress.save(); g.engine.applySettings(S); };
    const bind = (id, key, fmt = (v) => v, apply) => { const el = $(id), out = $(id + '-v') || el.parentElement.querySelector('b'); el.oninput = () => { S[key] = +el.value; if (out) out.textContent = fmt(S[key]); Progress.save(); apply && apply(S[key]); }; };
    bind('#set-fov', 'fov', v => v + '°'); bind('#set-shake', 'shake', v => Math.round(v * 100) + '%'); bind('#set-sens', 'sens', v => v.toFixed(2));
    bind('#set-master', 'master', v => Math.round(v * 100) + '%', () => audio.setVolumes({ master: S.master })); bind('#set-music', 'music', v => Math.round(v * 100) + '%', () => audio.setVolumes({ music: S.music }));
    bind('#set-sfx', 'sfx', v => Math.round(v * 100) + '%', () => audio.setVolumes({ sfx: S.sfx })); bind('#set-ambient', 'ambient', v => Math.round(v * 100) + '%', () => audio.setVolumes({ ambient: S.ambient }));
    $('#set-invert').onchange = (e) => { S.invertY = e.target.checked; Progress.save(); }; $('#set-dmg').onchange = (e) => { S.dmgNumbers = e.target.checked; Progress.save(); };
  }
  syncSettings() {
    const S = Progress.d.settings;
    $$('#set-quality button').forEach(b => b.classList.toggle('on', b.dataset.v === S.quality));
    for (const [id, k, f] of [['#set-fov', 'fov', v => v + '°'], ['#set-shake', 'shake', v => Math.round(v * 100) + '%'], ['#set-sens', 'sens', v => v.toFixed(2)], ['#set-master', 'master', v => Math.round(v * 100) + '%'], ['#set-music', 'music', v => Math.round(v * 100) + '%'], ['#set-sfx', 'sfx', v => Math.round(v * 100) + '%'], ['#set-ambient', 'ambient', v => Math.round(v * 100) + '%']]) { const el = $(id); el.value = S[k]; const o = $(id + '-v') || el.parentElement.querySelector('b'); if (o) o.textContent = f(S[k]); }
    for (const [sel, key] of [['#set-fps', 'fpsCap'], ['#set-shadows', 'shadows'], ['#set-part', 'particles'], ['#set-view', 'viewDist']]) $$(sel + ' button').forEach(b => b.classList.toggle('on', String(b.dataset.v) === String(S[key])));
    $('#set-dynres').checked = S.dynRes; $('#set-battery').checked = S.batterySaver; $('#set-scale').value = S.renderScale; $('#set-scale').parentElement.querySelector('b').textContent = Math.round(S.renderScale * 100) + '%';
    $('#set-invert').checked = S.invertY; $('#set-dmg').checked = S.dmgNumbers;
  }

  // ---------- Skins ----------
  buildSkins() {
    const wsel = $('#skin-weapon'); wsel.innerHTML = '';
    for (const id of ['striker', 'viper', 'hornet', 'breaker', 'marksman', 'longshot', 'stormcaller', 'pulse', 'lancer', 'blade', 'magnum']) { const b = document.createElement('button'); b.textContent = WEAPONS[id].name; b.dataset.v = id; b.onclick = () => { audio.click(); Progress.d.menuWeapon = id; Progress.save(); this.g.menuChar && this.g.menuChar.setWeapon(id); this.refreshSkins(); }; wsel.appendChild(b); }
  }
  refreshSkins() {
    const d = Progress.d, inv = Account.user ? Account.inv : null, grid = $('#skin-grid'), wgrid = $('#wskin-grid'); grid.innerHTML = ''; wgrid.innerHTML = '';
    const owned = (type, id) => inv ? inv.owned.includes(type + ':' + id) : (type === 'skin' ? Progress.skinUnlocked(id) : Progress.wskinUnlocked(id));
    const eq = { skin: inv ? inv.equipped.skin : d.skin, wskin: inv ? inv.equipped.wskin : d.wskin };
    $('#skin-coins').textContent = inv ? `Münzen: ${inv.coins} · Level-Skins sind gratis, mit Münzen kannst du früher kaufen.` : (Account.available ? 'Melde dich an, um Skins zu kaufen und serverseitig zu speichern.' : '');
    const label = (type, s) => { const it = CATALOG_BY_ID[type + ':' + s.id]; if (owned(type, s.id)) return eq[type] === s.id ? 'Ausgewählt' : 'Im Besitz'; return inv ? `${it.price} Münzen · Lv ${s.level}` : (type === 'wskin' && s.id === 'gold' ? 'Lv ' + s.level + ' oder Ente' : 'Level ' + s.level); };
    const act = async (type, s) => {
      const id = type + ':' + s.id;
      if (owned(type, s.id)) { audio.click(); if (inv) { try { await Account.equip(type === 'skin' ? s.id : null, type === 'wskin' ? s.id : null); } catch (e) { this.toast(e.message, 'bad'); return; } } else { d[type] = s.id; Progress.save(); } this.g.refreshMenuChar(); this.refreshSkins(); return; }
      if (!inv) { audio.error(); this.toast(`${s.name}: erreiche Level ${s.level} (oder melde dich an, um zu kaufen).`, 'bad'); return; }
      const price = CATALOG_BY_ID[id].price;
      const coins = Account.inv?.coins ?? 0;
      if (coins < price) { audio.error(); await this.confirm({ title: 'Nicht genug Münzen', lines: [s.name + ' kostet ' + price + ' Münzen.', 'Du hast ' + coins + ' Münzen – dir fehlen ' + (price - coins) + '.', { cls: '', text: 'Münzen gibt es für Matches, Tagesbelohnungen und die Season.' }], ok: 'Verstanden', cancel: null }); return; }
      if (!(await this.confirm({ title: 'Kauf bestätigen', lines: [{ cls: 'dl-big', text: s.name }, 'Preis: ' + price + ' Münzen', { cls: '', text: 'Danach hast du ' + (coins - price) + ' Münzen übrig.' }], ok: 'Kaufen · ' + price + ' Münzen' }))) return;
      try { await Account.buy(id); audio.levelUp(); this.toast(s.name + ' gekauft!', 'good'); this.refreshProfile(); this.refreshSkins(); } catch (e) { audio.error(); this.toast(e.message, 'bad'); }
    };
    for (const s of SKINS) {
      const ok = owned('skin', s.id), el = document.createElement('div'); el.className = 'skin' + (eq.skin === s.id ? ' on' : '') + (ok ? '' : ' lock');
      el.innerHTML = `<div class="sw"><i style="background:${s.armor}"></i><i style="background:${s.suit}"></i><i style="background:${s.accent}"></i></div><b>${s.name}</b><small>${label('skin', s)}</small>`;
      el.onclick = () => act('skin', s); grid.appendChild(el);
    }
    for (const s of WSKINS) {
      const ok = owned('wskin', s.id), el = document.createElement('div'); el.className = 'skin' + (eq.wskin === s.id ? ' on' : '') + (ok ? '' : ' lock');
      el.innerHTML = `<div class="sw"><i style="background:${s.tint ? '#' + s.tint.toString(16).padStart(6, '0') : '#2b3038'}"></i><i style="background:${s.glow ? '#' + s.glow.toString(16).padStart(6, '0') : '#ffd24a'}"></i></div><b>${s.name}</b><small>${label('wskin', s)}</small>`;
      el.onclick = () => act('wskin', s); wgrid.appendChild(el);
    }
    $$('#skin-weapon button').forEach(b => b.classList.toggle('on', b.dataset.v === (d.menuWeapon || 'striker')));
  }
  buildAchievements() { }
  refreshAchievements() {
    const d = Progress.d, g = $('#ach-grid'); g.innerHTML = '';
    for (const a of ACHIEVEMENTS) { const got = d.ach[a.id]; g.insertAdjacentHTML('beforeend', `<div class="ach ${got ? 'got' : ''}"><em>+${a.xp} XP</em><b>${a.name}</b><span>${a.desc}${got ? ' ✓' : ''}</span></div>`); }
    const s = d.stats; $('#stat-line').textContent = `Abschüsse ${s.kills} · Kopftreffer ${s.headshots} · Bots besiegt ${s.botKills} · Siege ${s.wins}/${s.matches} · Kisten ${s.chests} · Daten-Kerne ${s.shards} · Tode ${s.deaths}`;
  }

  // ---------- Allgemein ----------
  toast(text, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4300); while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove(); }
  connStatus(s) { const c = $('#conn'); if (s === 'reconnecting') { c.style.display = 'block'; c.textContent = 'Verbindung unterbrochen – verbinde neu …'; } else if (s === 'open') { c.style.display = 'none'; } else if (s === 'failed') { c.style.display = 'none'; } else if (s === 'closed') c.style.display = 'none'; }
  levelUp(l) { const el = $('#lvlup'); el.innerHTML = `LEVEL ${l}<small>Neue Inhalte freigeschaltet?</small>`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  achievement(a) { const el = document.createElement('div'); el.className = 'ap'; el.innerHTML = `<b>ERFOLG FREIGESCHALTET</b><span>${a.name} – ${a.desc} (+${a.xp} XP)</span>`; $('#achv-pop').appendChild(el); setTimeout(() => el.remove(), 5200); }
  onKey(e) {
    const g = this.g;
    if (g.mode !== 'play' || !g.inMatch) return;
    if (e.code === 'KeyM' && !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '') && !this.chatOpen) { e.preventDefault(); this.map.toggle(); return; }
    if (e.code === 'Escape' && this.map.open) { e.preventDefault(); this.map.close(); return; }
    if (e.code === 'Tab') { e.preventDefault(); this.hud.showBoard(true); }
    if (e.code === 'Enter') { const inp = $('#chat-in'); if (!this.chatOpen) { if (g.net?.kind === 'local') return; this.chatOpen = true; inp.style.display = 'block'; g.input.enabled = true; inp.focus(); e.preventDefault(); } else { if (inp.value.trim()) this.sendChat(inp.value); inp.value = ''; inp.style.display = 'none'; this.chatOpen = false; inp.blur(); } }
    if (e.code === 'Escape' && this.chatOpen) { $('#chat-in').style.display = 'none'; this.chatOpen = false; }
  }
  showClickHint() { $('#clickhint').classList.add('show'); }
  pause(show) { $('#pause').classList.toggle('show', show && this.g.mode === 'play' && !this.g.matchEnded); $('#clickhint').classList.remove('show'); }

  // ---------- HUD-Hooks ----------
  beginMatch(m, g) { this.hud.begin(m, g); $('#results').classList.remove('show'); $('#death').classList.remove('on'); $('#feed').innerHTML = ''; this.stack = []; }
  resetFeed() { $('#feed').innerHTML = ''; }
  countdown(t) { const el = $('#countdown'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  banner(t, kind = '') { const el = $('#banner'); el.textContent = t; el.className = 'h-banner ' + kind; void el.offsetWidth; el.classList.add('on'); }
  killFeed(k) {
    const el = document.createElement('div'); el.className = 'fe' + (k.you ? ' you' : '') + (k.died ? ' died' : '');
    const col = (c) => c ? `style="color:${c}"` : '';
    el.innerHTML = k.killer ? `<span ${col(k.killerColor)}>${esc(k.killer)}</span><i>${esc(k.weapon)}${k.ex ? ' 💥' : ''}</i>${k.hs ? '<span class="hs">⌖</span> ' : ''}<span ${col(k.victimColor)}>${esc(k.victim)}</span>` : `<span ${col(k.victimColor)}>${esc(k.victim)}</span><i>${esc(k.weapon)}</i>`;
    const f = $('#feed'); f.appendChild(el); setTimeout(() => el.remove(), 7000); while (f.children.length > 6) f.firstChild.remove();
  }
  killBanner(name, hs, streak, xp) { const el = $('#killbanner'); el.innerHTML = `${hs ? '⌖ KOPFSCHUSS · ' : ''}ELIMINIERT<b>${esc(name)}</b>${xp ? `<span>+${xp} XP${streak >= 3 ? ' · ' + streak + 'er Serie!' : ''}</span>` : ''}`; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  hitmarker(kill, hs) { const h = $('#hitmarker'); h.className = 'hm on' + (kill ? ' kill' : hs ? ' head' : ''); clearTimeout(this._hm); this._hm = setTimeout(() => h.classList.remove('on'), kill ? 220 : 110); }
  damageDir(ang) { const d = $('#dirs'); if (ang === null) return; const el = document.createElement('div'); el.className = 'dir'; el.style.transform = `rotate(${(-ang) * 180 / Math.PI}deg)`; el.innerHTML = '<i></i>'; d.appendChild(el); setTimeout(() => el.remove(), 1200); }
  showDeath(by, weapon, secs, color, killer) {
    $('#death').classList.add('on'); $('#dd-by').innerHTML = killer ? `von <b style="color:${color || '#fff'}">${esc(killer)}</b> · ${esc(weapon)}` : esc(weapon); const t = $('#dd-timer'); let left = secs; t.textContent = `Respawn in ${left.toFixed(1)} s`;
    clearInterval(this.deadTimer); this.deadTimer = setInterval(() => { left -= 0.1; t.textContent = left > 0 ? `Respawn in ${left.toFixed(1)} s` : 'Bereit …'; if (left <= -1.5) clearInterval(this.deadTimer); }, 100);
  }
  hideDeath() { $('#death').classList.remove('on'); clearInterval(this.deadTimer); }
  pickupToast(p) { this.toast('+ ' + itemLabel(p.kind, p.item), 'good'); }
  clock(g) { this.hud.clockUpdate(g); }
  showResults(r) {
    const { ev, won, xp, ups, stats, you, ents } = r;
    $('#res-banner').className = 'res-banner ' + (won ? 'win' : 'lose'); $('#res-banner').textContent = r.training ? 'TRAINING BEENDET' : won ? 'SIEG' : 'NIEDERLAGE';
    const wt = ev.winTeam >= 0 ? `Team ${TEAMS[ev.winTeam].name} gewinnt` : ev.winId ? `${esc(ents.get(ev.winId)?.info.name || '')} gewinnt` : 'Unentschieden';
    $('#res-sub').textContent = wt;
    let html = '<table><tr><th></th><th>Spieler</th><th>K</th><th>T</th><th>Kopf</th><th>Schaden</th><th></th></tr>';
    ev.board.forEach((b, i) => { const t = TEAMS[b.team]; html += `<tr class="${b.id === you ? 'me' : ''}"><td>${i + 1}</td><td style="color:${t ? t.color : 'inherit'}">${esc(ents.get(b.id)?.info.name || b.name)}</td><td>${b.k}</td><td>${b.d}</td><td>${b.hs}</td><td>${b.dmg}</td><td>${Account.user && b.id !== you && ents.get(b.id)?.info.acct ? `<button class="link" data-rep="${esc(b.name)}">Melden</button> <button class="link" data-mute="${esc(b.name)}">Stumm</button>` : ''}</td></tr>`; });
    $('#res-board').innerHTML = html + '</table>';
    $$('#res-board [data-rep]').forEach(b => b.onclick = async () => { const why = await this.prompt({ title: 'Spieler melden', lines: ['Warum meldest du ' + b.dataset.rep + '?'], placeholder: 'z. B. Cheating, Beleidigung', min: 3, max: 200, ok: 'Meldung senden' }); if (!why) return; try { await Account.report(b.dataset.rep, why, this.g.lobby?.code); this.toast('Meldung gesendet. Danke!', 'good'); } catch (e) { this.toast(e.message, 'bad'); } });
    $$('#res-board [data-mute]').forEach(b => b.onclick = async () => { try { await Account.mute(b.dataset.mute, true); this.g.send({ k: 'refreshmutes' }); this.toast(b.dataset.mute + ' ist stummgeschaltet.', 'good'); } catch (e) { this.toast(e.message, 'bad'); } });
    const d = Progress.d; const need = xpForLevel(d.level);
    $('#res-xp').innerHTML = `<div class="big">+${xp} XP</div><div class="lvl">${ups.length ? `LEVEL UP! → Level ${d.level}` : `Level ${d.level}`} · Abschüsse ${stats.kills} · Kopftreffer ${stats.hs}</div><div class="xb"><i style="width:${ups.length ? 8 : 100 * (d.xp - xp) / need}%"></i></div>`;
    setTimeout(() => { const i = $('#res-xp .xb i'); if (i) i.style.width = (100 * d.xp / need) + '%'; }, 80);
    $('#res-ach').innerHTML = '';
    $('#res-lobby').textContent = r.host && this.g.net?.kind === 'ws' ? 'Zur Lobby' : (this.g.net?.kind === 'ws' ? 'Zur Lobby' : 'Nochmal spielen');
    $('#results').classList.add('show'); $('#hud').classList.remove('show'); this.hud.showBoard(false);
    this.again = this.g.net?.kind === 'local';
    if (this.again) $('#res-lobby').onclick = () => { audio.click(); $('#results').classList.remove('show'); this.g.leaveToMenu(); this.showScreen('solo'); this.refreshSolo(); };
    else $('#res-lobby').onclick = () => { audio.click(); $('#results').classList.remove('show'); this.backToLobby(); };
  }
}

// ======================= HUD =======================
class Hud {
  constructor(ui, g) { this.ui = ui; this.g = g; this.mini = null; this.board = false; this.fps = 60; this.last = {}; }
  begin(m, g) {
    if (!this.mini) this.mini = new Minimap($('#minimap'), g);
    const S = m.settings, mode = MODES[S.mode];
    $('#h-mode').textContent = S.training ? 'TRAINING' : mode.name;
    $('#hud').dataset.training = S.training ? 1 : 0; this.sc = null;
    this.clockUpdate(g);
  }
  showBoard(on) { this.board = on; $('#scoreboard').classList.toggle('on', on); if (on) this.renderBoard(); }
  fmt(s) { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  clockUpdate(g) {
    $('#h-time').textContent = g.training ? '∞' : this.fmt(g.clock.left);
    const sc = g.clock.scores, box = $('#h-scores');
    if (sc) { const key = sc.join(','); if (key !== this.sck) { this.sck = key; box.innerHTML = sc.map((v, i) => `<div style="border-color:${TEAMS[i].color};color:${TEAMS[i].color}"><small>${TEAMS[i].name}</small>${v}<span style="color:var(--dim);font-size:13px"> / ${g.scoreLimit}</span></div>`).join(''); } }
    else { const me = g.ents.get(g.you); const top = [...g.clock.ents.values()].reduce((m, e) => Math.max(m, e.k), 0); const key = `${me?.kills}|${top}`; if (key !== this.sck) { this.sck = key; box.innerHTML = g.training ? '' : `<div style="border-color:var(--c1)"><small>DU</small>${me ? me.kills : 0}<span style="color:var(--dim);font-size:13px"> / ${g.scoreLimit}</span></div><div style="border-color:var(--c3)"><small>FÜHRUNG</small>${top}</div>`; } }
    if (this.board) this.renderBoard();
  }
  renderBoard() {
    const g = this.g, mode = MODES[g.settingsMatch?.mode || 'ffa']; const rows = [];
    for (const [id, e] of g.ents) { const c = g.clock.ents.get(id); rows.push({ id, name: e.info.name, team: e.info.team, k: c ? c.k : e.kills || 0, d: c ? c.d : e.deaths || 0, bot: e.info.bot, lvl: e.info.level }); }
    rows.sort((a, b) => b.k - a.k || a.d - b.d);
    let html = `<h3>${g.training ? 'TRAINING' : mode.name}</h3><table><tr><th>Spieler</th><th>Level</th><th>Abschüsse</th><th>Tode</th></tr>`;
    for (const r of rows) { const t = TEAMS[r.team]; html += `<tr class="${r.id === g.you ? 'me' : ''} ${t ? 'tm' : ''}" ${t ? `style="--c:${t.color}"` : ''}><td ${t ? `style="border-left-color:${t.color}"` : ''}>${esc(r.name)}</td><td>${r.lvl || 1}</td><td>${r.k}</td><td>${r.d}</td></tr>`; }
    $('#scoreboard').innerHTML = html + '</table>';
  }
  slotsHtml(g) { return ''; }
  update(g, dt) {
    const L = this.last, p = g.player, c = g.combat, d = c.def, T = performance.now() / 1000;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    if (!this.fpsT || T - this.fpsT > 0.5) { this.fpsT = T; $('#h-fps').textContent = Math.round(this.fps) + ' FPS'; $('#h-ping').textContent = g.net?.kind === 'ws' ? Math.round(g.rtt * 1000) + ' ms' : 'offline'; }
    // Tab-Anzeige
    if (g.input.down('Tab') !== this.board) this.showBoard(g.input.down('Tab'));
    // Vitals
    const hp = Math.max(0, Math.ceil(g.hp)), sh = Math.ceil(g.shield + (g.barrierHp || 0));
    if (hp !== L.hp) { L.hp = hp; $('#b-hp').style.width = hp + '%'; $('#n-hp').textContent = hp; $('.bar-hp').classList.toggle('low', hp < 35); }
    if (sh !== L.sh) { L.sh = sh; $('#b-shield').style.width = Math.min(100, sh) + '%'; $('#n-shield').textContent = sh; $('#b-shield').style.background = g.barrierHp ? 'linear-gradient(180deg,#ffe48f,#e2a000)' : ''; }
    // Waffe
    const mag = c.mags[c.id] ?? 0, res = c.reserve();
    const wkey = c.id + '|' + mag + '|' + res + '|' + c.training;
    if (wkey !== L.w) {
      L.w = wkey; $('#wname').textContent = d.name; $('#a-mag').textContent = d.mag ? mag : '∞'; $('#a-res').textContent = d.ammo ? (c.training ? '/ ∞' : '/ ' + res) : '';
      $('.ammo').classList.toggle('low', d.mag && mag <= Math.ceil(d.mag * 0.25));
    }
    const skey = c.weapons.join(',') + c.cur; if (skey !== L.slots) { L.slots = skey; $('#slots').innerHTML = [0, 1, 2, 3, 4].map(i => { const w = c.weapons[i]; if (!w) return `<div class="slot empty"><kbd>${i + 1}</kbd></div>`; const def = WEAPONS[w]; return `<div class="slot ${i === c.cur ? 'on' : ''}"><i style="background:#${def.color.toString(16).padStart(6, '0')}"></i>${def.name}<kbd>${i + 1}</kbd></div>`; }).join(''); }
    const rb = $('#reloadbar'); if (c.reloading) { rb.classList.add('on'); rb.firstChild.style.width = (100 * (1 - (c.reloadEnd - T) / d.reload)) + '%'; } else rb.classList.remove('on');
    // Items
    const ikey = JSON.stringify(c.cons) + g.gadget + Math.round(p.gcd) + Math.round(p.fuel / 10) + (p.beacon ? 1 : 0);
    if (ikey !== L.items) {
      L.items = ikey; const IC = { medkit: ['✚', 'Z'], shieldpot: ['⬡', 'X'], grenade: ['●', 'G'], smoke: ['☁', 'H'] };
      let h = Object.entries(IC).map(([k, [ic, key]]) => `<div class="it ${(c.cons[k] | 0) ? '' : 'zero'}" style="color:${CONSUMABLES[k].color}"><div class="ic">${ic}</div><b>${c.cons[k] | 0}</b><kbd>${key}</kbd></div>`).join('');
      if (g.gadget) { const gd = GADGETS[g.gadget]; const cd = g.gadget === 'jetpack' ? 0 : Math.min(1, p.gcd / Math.max(1, gd.cd)); h += `<div class="it gad" style="color:${gd.color}"><div class="ic">${gd.name.toUpperCase()}</div>${g.gadget === 'jetpack' ? `<b>${Math.round(p.fuel)}%</b>` : p.gcd > 0 ? `<b>${Math.ceil(p.gcd)}</b>` : ''}<kbd>F</kbd><div class="cd" style="height:${cd * 100}%"></div></div>`; }
      $('#items').innerHTML = h;
    }
    // Power-ups
    const pk = `${Math.ceil(g.power.speed)}${Math.ceil(g.power.jump)}${Math.ceil(g.power.barrier)}`; if (pk !== L.pw) { L.pw = pk; const list = []; for (const k of ['speed', 'jump', 'barrier']) if (g.power[k] > 0) list.push(`<div class="pwi" style="color:${POWERUPS[k].color};border-color:${POWERUPS[k].color}">${POWERUPS[k].name.toUpperCase()} ${Math.ceil(g.power[k])}s</div>`); $('#pw').innerHTML = list.join(''); }
    for (const k of ['speed', 'jump', 'barrier']) if (g.power[k] > 0) g.power[k] = Math.max(0, g.power[k] - dt);
    // Fadenkreuz
    const cross = $('#cross'); const spread = d.kind === 'melee' ? 0 : (d.spread || 0.01) * c.spreadFactor(p) * 900 + 4;
    cross.style.setProperty('--g', Math.min(60, spread) + 'px'); cross.classList.toggle('enemy', !!g.aimEnt); cross.classList.toggle('hide', p.scoped || !g.alive);
    $('#scope').classList.toggle('on', !!p.scoped);
    // Prompt
    const pr = $('#prompt'); if (g.interact && g.alive) { pr.style.display = 'block'; pr.innerHTML = `<b>[E]</b> ${esc(g.interact.text)}`; } else pr.style.display = 'none';
    // Minimap
    if (this.mini) this.mini.draw(g, dt);
    const zn = g.zoneName(); if (zn !== L.zone) { L.zone = zn; $('#h-zone').textContent = zn; }
  }
}
