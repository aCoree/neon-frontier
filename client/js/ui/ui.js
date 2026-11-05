// Benutzeroberfläche: Menüs, Lobby, HUD, Ergebnis, Einstellungen, Skins, Erfolge.
import { EMOTES, EMOTE_COOLDOWN, CATALOG_BY_ID, MODES, TEAMS, DIFFS, SKINS, WSKINS, WEAPONS, WEAPON_IDS, ACHIEVEMENTS, CONSUMABLES, GADGETS, POWERUPS, AMMO, xpForLevel, itemLabel } from '../shared/defs.js';
import { Progress } from '../game/progress.js';
import { audio } from '../game/audio.js';
import { QUALITY } from '../render/engine.js';
import { Minimap } from './minimap.js';
import { SERVER_URL } from '../config.js';
import { resolveServerUrl } from '../game/net.js';
import { Account } from '../game/account.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.g = game; this.stack = []; this.cur = null; this.soloSel = { mode: 'ffa', diff: 'normal', bots: 5, time: 6, tod: 'day' };
    this.hud = new Hud(this, game); this.deadTimer = null; this.lastLobby = null; this.myId = null; this.chatOpen = false;
  }
  init() {
    const g = this.g;
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
    $$('.screen').forEach(s => s.classList.remove('show'));
    this.cur = name; if (name) $('#' + (name === 'hud' ? 'hud' : 's-' + name)).classList.add('show');
    if (name === 'menu') { this.stack = []; this.g.setMenuView('orbit'); this.refreshProfile(); }
    if (name === 'skins') { this.g.setMenuView('skins'); this.refreshSkins(); if (Account.user) Account.loadInventory().then(() => this.refreshSkins()); }
    if (name === 'ach') this.refreshAchievements();
    if (name === 'friends') this.openFriends();
    if (name === 'season') this.openSeason();
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
    const modal = name === 'name' || name === 'help';
    if (!modal) $$('.screen').forEach(s => s.classList.remove('show'));
    this.cur = name; $('#s-' + name).classList.add('show');
    if (name === 'skins') { this.g.setMenuView('skins'); this.refreshSkins(); if (Account.user) Account.loadInventory().then(() => this.refreshSkins()); }
    if (name === 'ach') this.refreshAchievements();
    if (name === 'friends') this.openFriends();
    if (name === 'season') this.openSeason();
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
      $('#pc-rank').textContent = `${s.rank.toUpperCase()} · ${s.rankPoints} RP · K/D ${s.kd} · ${s.wins} Siege / ${s.matches} Matches · ${s.currency} Münzen`;
      $('#pc-since').textContent = 'Konto seit ' + new Date(u.createdAt).toLocaleDateString('de-DE');
    } else {
      const need = xpForLevel(d.level);
      $('#pc-name').textContent = (d.name || 'Spieler') + (Account.available ? ' (Gast)' : ''); $('#pc-level').textContent = d.level; $('#pc-xp').style.width = (100 * d.xp / need) + '%'; $('#pc-xptxt').textContent = `${d.xp} / ${need} XP`;
      $('#pc-rank').textContent = ''; $('#pc-since').textContent = '';
    }
    const dl = Account.inv && Account.inv.daily; $('#pc-daily').style.display = u && dl && dl.enabled && dl.canClaim ? '' : 'none';
    $('#pc-rename').style.display = u ? 'none' : ''; $('#pc-logout').style.display = u ? '' : 'none'; $('#pc-login').style.display = !u && Account.available ? '' : 'none';
    const ss = $('#season-sub'); if (ss) ss.textContent = u ? 'Rangliste & Belohnungen' : 'Mit Konto: Rangliste & Belohnungen';
    $('#ach-count').textContent = `${Object.keys(d.ach).length} / ${ACHIEVEMENTS.length}`;
  }
  ensureName(then) { if (!Progress.d.name && !Account.user) { this.afterName = then; this.go('name'); $('#name-input').focus(); return false; } return true; }

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
      row.append(p, n, lv, s); board.appendChild(row);
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
    let d; try { d = await Account.friends(); } catch (e) { this.toast(e.message, 'bad'); return; }
    const row = (name, extra, actions) => { const r = document.createElement('div'); r.className = 'room'; const l = document.createElement('div'); l.style.display = 'flex'; l.style.alignItems = 'center'; l.style.gap = '10px'; l.innerHTML = extra; l.querySelector('.fn').textContent = name; const a = document.createElement('div'); a.style.display = 'flex'; a.style.gap = '8px'; for (const [t, f] of actions) { const b = document.createElement('button'); b.className = 'btn small'; b.textContent = t; b.onclick = (e) => { e.stopPropagation(); f(); }; a.appendChild(b); } r.append(l, a); return r; };
    const act = (kind, name, msg) => async () => { try { await Account.friendAction(kind, name); audio.click(); if (msg) this.toast(msg, 'good'); this.refreshFriends(); } catch (e) { this.toast(e.message, 'bad'); audio.error(); } };
    const list = $('#fr-list'); list.replaceChildren(); $('#fr-total').textContent = '(' + d.friends.length + ')';
    if (!d.friends.length) list.innerHTML = '<div class="empty">Noch keine Freunde. Suche links nach Spielernamen.</div>';
    for (const f of d.friends) {
      const acts = []; if (f.room) acts.push(['Beitreten', () => this.joinRoom(f.room)]); acts.push(['✕', () => { if (confirm(f.username + ' aus der Freundesliste entfernen?')) act('remove', f.username)(); }]);
      list.appendChild(row(f.username, `<span style="width:10px;height:10px;border-radius:50%;background:${f.online ? 'var(--good)' : '#556'};box-shadow:${f.online ? '0 0 8px var(--good)' : 'none'}"></span><b class="fn"></b><small>Lv ${f.level} · ${f.rank} · ${f.online ? (f.inMatch ? 'im Match' : f.room ? 'in einer Lobby' : 'online') : 'offline'}</small>`, acts));
    }
    const inn = $('#fr-in'); inn.replaceChildren(); if (!d.incoming.length) inn.innerHTML = '<div class="empty">Keine offenen Anfragen.</div>';
    for (const r of d.incoming) inn.appendChild(row(r.username, '<b class="fn"></b><small>Lv ' + r.level + '</small>', [['Annehmen', act('accept', r.username, r.username + ' ist jetzt dein Freund!')], ['Ablehnen', act('decline', r.username)]]));
    const out = $('#fr-out'); out.replaceChildren(); for (const r of d.outgoing) out.appendChild(row(r.username, '<b class="fn"></b><small>wartet …</small>', [['Zurückziehen', act('remove', r.username)]]));
    $('#fr-count').textContent = d.incoming.length ? d.incoming.length + ' neue Anfrage(n)!' : 'Suchen & einladen';
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
  async checkFriendRequests() { if (!Account.user) return; try { const d = await Account.friends(); if (d.incoming.length) { this.toast(d.incoming.length + ' neue Freundschaftsanfrage(n)!', 'event'); $('#fr-count').textContent = d.incoming.length + ' neue Anfrage(n)!'; } } catch { /* ignorieren */ } }
  initAccount() {
    $('#fr-search').onclick = () => this.searchPlayers(false); $('#fr-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.searchPlayers(false); }); $('#fr-more').onclick = () => this.searchPlayers(true);
    $('#fr-login').onclick = () => { audio.click(); this.go('login'); };
    let mode = 'login'; const err = (t) => { $('#lg-err').textContent = t || ''; };
    const ownerField = () => { $('#lg-owner').style.display = mode === 'register' && $('#lg-user').value.trim().toLowerCase() === 'aurelio' ? '' : 'none'; };
    $$('#lg-mode button').forEach(b => b.onclick = () => { audio.click(); mode = b.dataset.v; $$('#lg-mode button').forEach(x => x.classList.toggle('on', x === b)); $('#lg-pass').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; err(); ownerField(); });
    $('#lg-user').oninput = ownerField;
    const submit = async () => {
      err(); const u = $('#lg-user').value.trim(), p = $('#lg-pass').value; if (!u || !p) return err('Bitte Benutzername und Passwort eingeben.');
      $('#lg-ok').disabled = true;
      try { if (mode === 'login') await Account.login(u, p); else await Account.register(u, p, $('#lg-owner').value); $('#lg-pass').value = ''; $('#lg-owner').value = ''; this.refreshProfile(); this.back(); this.toast('Willkommen, ' + Account.user.username + '!', 'good'); audio.levelUp(); }
      catch (e) { err(e.status ? e.message : 'Server nicht erreichbar.'); audio.error(); }
      $('#lg-ok').disabled = false;
    };
    $('#lg-ok').onclick = submit; $('#lg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    $('#pc-login').onclick = () => { audio.click(); this.go('login'); setTimeout(() => $('#lg-user').focus(), 50); };
    $('#pc-daily').onclick = async () => {
      try { const r = await Account.claimDaily(); audio.levelUp(); this.refreshProfile(); const part = [r.coins ? r.coins + ' Münzen' : '', r.xp ? r.xp + ' XP' : '', r.item ? 'Cosmetic: ' + CATALOG_BY_ID[r.item].name : ''].filter(Boolean).join(' + '); this.toast(`Tag ${r.day}: ${part} (Serie ${r.streak})`, 'good'); }
      catch (e) { this.toast(e.message, 'bad'); }
    };
    $('#pc-logout').onclick = async () => { audio.back(); await Account.logout(); this.refreshProfile(); this.toast('Abgemeldet.'); };
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
    this.g.net.on('joined', () => { if (!this.g.inMatch) this.showScreenKeep('lobby'); });
    this.g.net.send({ k: 'create', settings: { public: !!isPublic, mode: 'ffa', bots: 3, diff: 'normal', timeLimit: 6, tod: 'day', fillBots: true } });
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
    this.myId = myId; this.lastLobby = d; const g = this.g, S = d.settings, mode = MODES[S.mode], host = d.host === myId;
    if (this.cur !== 'lobby' && !g.inMatch && this.cur !== 'hud') this.showScreenKeep('lobby');
    $('#lobby-code').textContent = d.code;
    $('#lobby-count').textContent = `(${d.members.length})`;
    $$('#lobby-modes .card').forEach(c => c.classList.toggle('on', c.dataset.id === S.mode)); $('#lobby-modes').classList.toggle('locked', !host);
    const mark = (sel, v) => $$(sel + ' button').forEach(b => b.classList.toggle('on', b.dataset.v == v));
    mark('#lb-diff', S.diff); mark('#lb-time', S.timeLimit); mark('#lb-score', S.scoreLimit); mark('#lb-tod', S.tod);
    for (const id of ['#lb-diff', '#lb-time', '#lb-score', '#lb-tod']) $(id).classList.toggle('locked', !host);
    $('#lb-bots').value = S.bots; $('#lb-bots-v').textContent = mode.size ? 'auto' : S.bots; $('#lb-bots').disabled = !host || mode.size > 0; $('#lb-fill').checked = S.fillBots; $('#lb-fill').disabled = !host || !mode.size;
    $('#lobby-hostnote').textContent = host ? '(du bist Host)' : '(nur der Host ändert Einstellungen)';
    $('#lobby-start').style.display = host ? '' : 'none'; $('#lobby-shuffle').style.display = host && mode.teams ? '' : 'none';
    $('#lobby-wait').textContent = host ? `${mode.name} · bis zu ${mode.max} Spieler` : 'Warte auf den Host …';
    // Spielerliste
    const box = $('#lobby-teams'); box.innerHTML = '';
    const mk = (m) => { const t = TEAMS[m.team]; const row = document.createElement('div'); row.className = 'pl' + (m.id === myId ? ' you' : ''); row.innerHTML = `<span class="dot" style="background:${t ? t.color : '#8fa6c4'}"></span><span>${esc(m.name)}</span><span class="lv">LV ${m.level || 1}</span>${m.id === d.host ? '<span class="host">HOST</span>' : ''}`; if (host && m.id !== myId) { const k = document.createElement('button'); k.className = 'kick'; k.textContent = '✕'; k.title = 'Entfernen'; k.onclick = () => g.send({ k: 'kick', id: m.id }); row.appendChild(k); } return row; };
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
      $$('[data-join]', box).forEach(b => b.onclick = () => { audio.click(); g.send({ k: 'team', team: +b.dataset.join }); });
    }
  }
  chat(m) {
    const line = `<div><b style="color:${m.team >= 0 ? TEAMS[m.team].color : 'var(--c1)'}">${esc(m.from)}</b>: ${esc(m.text)}</div>`;
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
      if (!confirm(`${s.name} für ${price} Münzen kaufen?`)) return;
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
    if (e.code === 'Tab') { e.preventDefault(); this.hud.showBoard(true); }
    if (e.code === 'Enter') { const inp = $('#chat-in'); if (!this.chatOpen) { if (g.net?.kind === 'local') return; this.chatOpen = true; inp.style.display = 'block'; g.input.enabled = true; inp.focus(); e.preventDefault(); } else { if (inp.value.trim()) g.send({ k: 'chat', text: inp.value }); inp.value = ''; inp.style.display = 'none'; this.chatOpen = false; inp.blur(); } }
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
    $$('#res-board [data-rep]').forEach(b => b.onclick = async () => { const why = prompt('Warum meldest du ' + b.dataset.rep + '? (z. B. Cheating, Beleidigung)'); if (!why) return; try { await Account.report(b.dataset.rep, why, this.g.lobby?.code); this.toast('Meldung gesendet. Danke!', 'good'); } catch (e) { this.toast(e.message, 'bad'); } });
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
