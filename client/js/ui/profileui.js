// Profil-Bildschirm (breit, ohne Scrollen, Charakter lässt sich drehen), Profil-Editor (Name, Farbe, Avatar, Bio), Rangpfad und die Gegner-Karte vor dem Match.
import { SKINS, WSKINS, BACKS, RARITY, MODES, TEAMS, NAME_COLORS, AVATAR_BGS, AVATAR_ICONS, BIO_MAX, RENAME_COST } from '../shared/defs.js';
import { TIERS, rankInfo, eloDelta } from '../shared/ranks.js';
import { skinThumb, wskinThumb, backThumb } from '../render/thumbs.js';
import { rankBadge, rankCard } from './rankart.js';
import { avatarHtml, applyName, nameHtml, nameLook, esc } from './cosmetic.js';
import { Account } from '../game/account.js';
import { Progress } from '../game/progress.js';
import { audio } from '../game/audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Ziehen dreht die 3D-Vorschau (Profil und Garderobe verwenden dieselbe Bedienung)
export function bindDrag(el, g) {
  let drag = null; const idle = () => { g.menuIdleAt = performance.now() / 1000 + 2.5; };
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('button, .shop-buy, .shop-info')) return; drag = { x: e.clientX, y: e.clientY }; try { el.setPointerCapture(e.pointerId); } catch { /* egal */ } el.classList.add('drag'); idle(); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; g.menuYaw -= (e.clientX - drag.x) * 0.009; g.menuPitch = Math.max(-0.3, Math.min(0.6, g.menuPitch + (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; idle(); });
  for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, () => { drag = null; el.classList.remove('drag'); idle(); });
  el.addEventListener('wheel', (e) => { g.menuZoom = Math.max(0.6, Math.min(1.5, g.menuZoom * (1 + Math.sign(e.deltaY) * 0.08))); idle(); }, { passive: true });
}

export function installProfile(UI) {
  const P = UI.prototype;

  // ---------- Rang-Anzeigen im Hauptmenü ----------
  P.renderRankChips = function (s) {
    const i = s ? rankInfo(s.rankPoints) : null, chip = $('#cur-rank');
    chip.innerHTML = i ? `${rankBadge(i, { size: 34, anim: false })}<b>${i.label}<small>${s.rankPoints.toLocaleString('de-DE')}</small></b><em>›</em>` : '<i class="rk-none">?</i><b>kein Rang</b>';
    chip.classList.toggle('btn-like', !!i); chip.title = 'Rangpfad ansehen'; chip.onclick = () => { if (!Account.user) return; audio.click(); this.go('ranks'); };
    const hb = $('#hr-badge'); hb.className = 'hr-badge'; hb.innerHTML = i ? rankBadge(i, { size: 52, anim: true }) : '?'; hb.onclick = () => { if (Account.user) { audio.click(); this.go('ranks'); } };
  };

  // ---------- Rangpfad ----------
  P.openRanks = function () {
    const u = Account.user, s = u?.stats, cur = s ? rankInfo(s.rankPoints) : null, track = $('#rp-track'); track.replaceChildren();
    $('#rp-now').innerHTML = cur ? `<div class="rp-you">${rankBadge(cur, { size: 64, anim: true })}<div><small>DEIN RANG</small><b>${cur.label}</b><span>${cur.pts.toLocaleString('de-DE')} Wertung${cur.nextLabel ? ' · noch <u>' + (cur.nextAt - cur.pts) + '</u> bis ' + cur.nextLabel : ' · höchster Rang!'}</span></div></div>${s.placement ? `<div class="rp-place">Platzierung: noch ${s.placement} Ranked-Match${s.placement > 1 ? 'es' : ''} mit doppelter Wertungsänderung</div>` : ''}` : '<div class="rp-you"><div><small>DEIN RANG</small><b>Noch keiner</b><span>Melde dich an und spiele Ranked.</span></div></div>';
    TIERS.forEach((t, idx) => {
      const state = !cur ? 'future' : idx < cur.idx ? 'done' : idx === cur.idx ? 'cur' : 'future', rows = t.divs > 1 ? Array.from({ length: t.divs }, (_, k) => ({ label: ['I', 'II', 'III'][k], at: t.min + k * t.step, on: state === 'cur' && cur.div === k + 1 })) : [{ label: t.name, at: t.min, on: state === 'cur' }];
      const col = document.createElement('div'); col.className = 'rp-col ' + state + ' t-' + t.key; col.dataset.idx = idx;
      col.innerHTML = `${rankCard(rankInfo(t.min), { size: 112, anim: state !== 'future', cls: 'big', progress: false }).replace(/<b class="rkc-name">[\s\S]*?<\/b>/, `<b class="rkc-name">${t.name.toUpperCase()}</b>`).replace(/<span class="rkc-pts">[\s\S]*?<\/span>/, `<span class="rkc-pts">ab <b>${t.min.toLocaleString('de-DE')}</b></span>`)}
        <ul class="rp-divs">${rows.map(r => `<li class="${r.on ? 'on' : cur && cur.pts >= r.at ? 'ok' : ''}"><i>${r.on ? '▶' : cur && cur.pts >= r.at ? '✓' : '🔒'}</i><span>${t.divs > 1 ? t.name + ' ' + r.label : t.name}</span><b>${r.at.toLocaleString('de-DE')}</b></li>`).join('')}</ul>
        ${state === 'cur' ? `<div class="rp-here"><span>DU BIST HIER</span><div class="rkc-bar"><i style="width:${Math.max(4, Math.round(cur.progress * 100))}%"></i></div></div>` : ''}${t.key === 'master' ? '<p class="rp-tag">Ab hier: Elite</p>' : t.key === 'champion' ? '<p class="rp-tag c">Der Gipfel</p>' : ''}`;
      track.appendChild(col);
    });
    const sc = $('#rp-scroll'); $('#rp-l').onclick = () => { audio.click(); sc.scrollBy({ left: -360, behavior: 'smooth' }); }; $('#rp-r').onclick = () => { audio.click(); sc.scrollBy({ left: 360, behavior: 'smooth' }); };
    requestAnimationFrame(() => { const c = track.children[cur ? cur.idx : 0]; if (c) sc.scrollTo({ left: c.offsetLeft - sc.clientWidth / 2 + c.offsetWidth / 2, behavior: 'auto' }); });
  };

  // ---------- Profil ----------
  P.openProfile = async function (name) {
    this.profName = name || null; this.go('profile'); this.g.setMenuView('profile');
    $('#pf-name').textContent = name || Account.user?.username || ''; $('#pf-stats').replaceChildren(); $('#pf-actions').replaceChildren(); $('#pf-gear').replaceChildren(); $('#pf-rank').replaceChildren();
    let user, online = null, relation = null;
    if (!name) { await Account.refresh(); try { await Account.loadInventory(); } catch { /* egal */ } user = Account.user; }
    else { try { const r = await Account.profile(name); user = r.user; online = r.online; } catch (e) { this.toast(e.message, 'bad'); this.back(); return; } }
    if (!user || this.cur !== 'profile') return;
    const s = user.stats, self = !name, eq = self ? (Account.inv?.equipped || user.equipped) : user.equipped, pr = user.profile || {}, ri = rankInfo(s.rankPoints);
    this.g.menuOverride = self ? null : { skin: eq?.skin || 'vanguard', wskin: eq?.wskin || 'default', back: eq?.back || 'none' }; this.g.refreshMenuChar();
    const sk = SKINS.find(x => x.id === eq?.skin) || SKINS[0], ws = WSKINS.find(x => x.id === eq?.wskin) || WSKINS[0], bk = BACKS.find(x => x.id === eq?.back) || BACKS[0];
    $('#pf-title').textContent = self ? 'Mein Profil' : 'Profil'; $('#pf-editbtn').style.display = self ? '' : 'none'; $('#pf-editbtn').onclick = () => { audio.click(); this.openProfileEditor(user); };
    $('#pf-av').innerHTML = avatarHtml({ bg: pr.avatarBg, icon: pr.avatarIcon }, sk.id, 84, 'big'); applyName($('#pf-name'), user.username, pr.nameColor, ri.key);
    $('#pf-lvl').textContent = s.level; const bio = $('#pf-bio'); bio.textContent = pr.bio || (self ? 'Noch keine Bio – tippe auf „Profil bearbeiten“.' : ''); bio.classList.toggle('empty', !pr.bio); bio.style.display = pr.bio || self ? '' : 'none';
    const tags = $('#pf-tags'); tags.replaceChildren(); const tag = (t, on) => { const x = document.createElement('span'); x.textContent = t; if (on) x.className = 'on'; tags.appendChild(x); };
    if (user.role !== 'PLAYER') tag(user.role); if (!self) tag(online ? 'online' : 'offline', online); else tag('du');
    $('#pf-xp').style.width = (100 * s.xpInto / s.xpNeed) + '%'; $('#pf-xptxt').textContent = s.xpInto + ' / ' + s.xpNeed + ' XP bis Level ' + (s.level + 1);
    // Rang-Karte + Infos
    const best = rankInfo(s.bestRankPoints || 0), rb = $('#pf-rank');
    rb.innerHTML = `${rankCard(ri, { size: 100, progress: true })}<div class="pp-rinfo"><small>WERTUNG</small><b>${s.rankPoints.toLocaleString('de-DE')}</b><span>${ri.nextLabel ? 'Noch <u>' + (ri.nextAt - ri.pts) + '</u> bis ' + ri.nextLabel : 'Höchster Rang erreicht'}</span><span>Bestwert: <u>${best.label}</u></span>${s.placement ? `<span class="pl">Platzierung: ${5 - s.placement}/5 Matches</span>` : ''}<button class="btn small" id="pf-path">Rangpfad ›</button></div>`;
    $('#pf-path').onclick = () => { audio.click(); this.go('ranks'); };
    // Statistiken
    const losses = Math.max(0, s.matches - s.wins), wr = s.matches ? Math.round(100 * s.wins / s.matches) + ' %' : '–', hs = s.kills ? Math.round(100 * s.headshots / s.kills) + ' %' : '–', grid = $('#pf-stats');
    for (const [v, l, big] of [[s.kd, 'K/D', 1], [wr, 'Siegquote', 1], [s.matches, 'Matches', 1], [s.wins, 'Siege'], [losses, 'Niederlagen'], [s.kills, 'Kills'], [s.deaths, 'Tode'], [s.headshots, 'Kopftreffer'], [hs, 'HS-Quote']]) { const c = document.createElement('div'); c.className = 'pf-st' + (big ? ' big' : ''); const b = document.createElement('b'); b.textContent = v; const sg = document.createElement('small'); sg.textContent = l; c.append(b, sg); grid.appendChild(c); }
    // Ausrüstung
    const gear = $('#pf-gear');
    const gearCard = (label, def, thumb) => { const d = document.createElement('div'); d.className = 'gr r-' + def.rarity; d.style.setProperty('--rc', RARITY[def.rarity].color); const im = document.createElement('div'); im.className = 'gr-img'; try { const i = new Image(); i.src = thumb(); i.draggable = false; im.appendChild(i); } catch { /* ohne Bild */ } const t = document.createElement('div'); t.className = 'gr-t'; t.innerHTML = '<small>' + label + '</small><b>' + esc(def.name) + '</b><em>' + RARITY[def.rarity].name + '</em>'; d.append(im, t); gear.appendChild(d); };
    gearCard('Charakter', sk, () => skinThumb(sk.id)); gearCard('Waffe', ws, () => wskinThumb(ws.id)); gearCard('Rücken', bk, () => backThumb(bk.id));
    $('#pf-since').textContent = 'Konto seit ' + new Date(user.createdAt).toLocaleDateString('de-DE');
    if (self) { try { const se = await Account.season(); if (se.enabled && this.cur === 'profile') { const d = document.createElement('button'); d.className = 'pf-seas'; d.innerHTML = '<span>SEASON</span><b>' + se.me.points.toLocaleString('de-DE') + ' Punkte</b><em>' + (se.me.position ? 'Platz ' + se.me.position : 'noch nicht platziert') + '</em><i>›</i>'; d.onclick = () => { audio.click(); this.go('season'); }; gear.after(d); } } catch { /* optional */ } }
    const act = $('#pf-actions'); act.replaceChildren();
    if (!self && Account.user) {
      try { const fr = await Account.friends(); const L = user.username.toLowerCase(); relation = fr.friends.some(f => f.username.toLowerCase() === L) ? 'friend' : fr.outgoing.some(f => f.username.toLowerCase() === L) ? 'out' : fr.incoming.some(f => f.username.toLowerCase() === L) ? 'in' : 'none'; } catch { relation = null; }
      const btn = (t, f, primary) => { const b = document.createElement('button'); b.className = 'btn small' + (primary ? ' primary' : ''); b.textContent = t; b.onclick = async () => { b.disabled = true; try { await f(); } catch (e) { this.toast(e.message || 'Fehler', 'bad'); } b.disabled = false; }; act.appendChild(b); };
      if (relation === 'none') btn('Freund hinzufügen', async () => { await Account.friendAction('request', user.username); this.toast('Anfrage gesendet', 'good'); this.openProfile(name); }, true);
      else if (relation === 'in') btn('Anfrage annehmen', async () => { await Account.friendAction('accept', user.username); this.toast(user.username + ' ist jetzt dein Freund!', 'good'); this.openProfile(name); }, true);
      else if (relation === 'out') { const t = document.createElement('small'); t.className = 'pf-sm'; t.textContent = 'Freundschaftsanfrage gesendet …'; act.appendChild(t); }
      else if (relation === 'friend' && online && (!this._party || this._party.isLeader)) btn('Party einladen', () => this.inviteFriend(user.username), true);
    }
  };

  // ---------- Profil-Editor ----------
  P.openProfileEditor = function (user) {
    const box = $('#pf-edit'), pr = user.profile || {}, lvl = user.stats.level, ri = rankInfo(user.stats.rankPoints), skin = (Account.inv?.equipped || user.equipped)?.skin || 'vanguard';
    const ed = { nameColor: pr.nameColor || 'white', avatarBg: pr.avatarBg || 'ocean', avatarIcon: pr.avatarIcon || 'skin', bio: pr.bio || '' };
    const prev = () => { $('#pe-prev').innerHTML = avatarHtml({ bg: ed.avatarBg, icon: ed.avatarIcon }, skin, 64) + `<div><b>${nameHtml(user.username, ed.nameColor, ri.key)}</b><p>${esc(ed.bio) || '<i>Keine Bio</i>'}</p></div>`; };
    const sw = (sel, list, key, mk, locked) => { const el = $(sel); el.replaceChildren(); for (const it of list) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pe-s' + (ed[key] === it.id ? ' on' : ''); b.title = it.name + (locked && locked(it) ? ' – ab Level ' + it.req : ''); mk(b, it); if (locked && locked(it)) { b.classList.add('lock'); b.disabled = true; } b.onclick = () => { audio.click(); ed[key] = it.id; sw(sel, list, key, mk, locked); prev(); }; el.appendChild(b); } };
    sw('#pe-nc', NAME_COLORS, 'nameColor', (b, c) => { const l = nameLook(c.id, ri.key); b.innerHTML = `<i class="${l.cls}" style="${l.color || c.color ? 'background:' + (l.color || c.color) : ''}"></i><span>${c.name}</span>`; }, (c) => lvl < c.req);
    sw('#pe-bg', AVATAR_BGS, 'avatarBg', (b, c) => { b.innerHTML = `<i style="background:radial-gradient(circle at 30% 25%,${c.c1},${c.c2})"></i>`; });
    sw('#pe-ic', AVATAR_ICONS, 'avatarIcon', (b, c) => { b.innerHTML = c.id === 'skin' ? '<span>Skin</span>' : `<em>${c.ch}</em>`; });
    const bio = $('#pe-bio'); bio.value = ed.bio; bio.maxLength = BIO_MAX; const cnt = () => { $('#pe-bio-n').textContent = bio.value.length + '/' + BIO_MAX; }; cnt();
    bio.oninput = () => { ed.bio = bio.value.replace(/\s+/g, ' ').slice(0, BIO_MAX); cnt(); prev(); };
    const nm = $('#pe-name'), rn = user.rename || { free: false, cost: RENAME_COST }; nm.value = user.username;
    $('#pe-rename').textContent = rn.free ? 'Namen ändern (gratis)' : 'Namen ändern (' + rn.cost + ' 🪙)'; $('#pe-rename-note').textContent = rn.nextAt ? 'Wieder möglich ab ' + new Date(rn.nextAt).toLocaleDateString('de-DE') + '.' : rn.free ? 'Die erste Namensänderung ist kostenlos, danach kostet jede ' + RENAME_COST + ' Münzen (höchstens alle 7 Tage).' : 'Jede Änderung kostet ' + rn.cost + ' Münzen (höchstens alle 7 Tage). Du hast ' + (user.stats.currency ?? 0).toLocaleString('de-DE') + '.';
    $('#pe-rename').disabled = !!rn.nextAt;
    $('#pe-rename').onclick = async () => {
      const name = nm.value.trim(); if (name === user.username) { this.toast('Das ist schon dein Name.', 'bad'); return; }
      if (!(await this.confirm({ title: 'Namen ändern?', lines: [{ cls: 'dl-big', text: name }, rn.free ? 'Die erste Änderung ist gratis.' : 'Das kostet ' + rn.cost + ' Münzen.', 'Danach ist der nächste Wechsel erst in 7 Tagen möglich.'], ok: rn.free ? 'Ändern' : 'Ändern · ' + rn.cost + ' Münzen' }))) return;
      try { await Account.rename(name); audio.levelUp(); this.toast('Dein Name ist jetzt ' + name, 'good'); box.classList.remove('show'); this.refreshProfile(); this.openProfile(null); } catch (e) { audio.error(); this.toast(e.message, 'bad'); }
    };
    $('#pe-cancel').onclick = () => { audio.back(); box.classList.remove('show'); };
    $('#pe-save').onclick = async () => { try { await Account.customize(ed); audio.click(); this.toast('Profil gespeichert', 'good'); box.classList.remove('show'); this.openProfile(null); } catch (e) { audio.error(); this.toast(e.message, 'bad'); } };
    prev(); box.classList.add('show');
  };

  // ---------- Gegner-Karte vor dem Countdown ----------
  P.showVS = function (m, g) {
    const el = $('#vs'); if (!el) return; const secs = m.vs || 0; if (!secs) { el.classList.remove('show'); return; }
    const mode = MODES[m.settings.mode], two = mode.teams === 2, ents = m.ents.filter(e => !e.bot || two);   // ohne Teams nur Menschen zeigen
    let sides; if (two) sides = [0, 1].map(t => ents.filter(e => e.team === t)); else { const h = ents.filter(e => !e.bot); if (h.length < 2 || h.length > 4) { el.classList.remove('show'); return; } sides = [h.slice(0, Math.ceil(h.length / 2)), h.slice(Math.ceil(h.length / 2))]; }
    if (sides.some(s => !s.length)) { el.classList.remove('show'); return; }
    const ranked = !!m.settings.ranked, avg = (l) => l.length ? l.reduce((a, e) => a + (e.rp || 0), 0) / l.length : 0;
    const card = (e, side) => {
      const sk = e.skin || 'vanguard', who = e.bot ? e.name.replace('[BOT] ', '') : e.name;
      if (!e.bot && e.acct) { const ri = rankInfo(e.rp || 0); return `<div class="vs-card s${side}"><div class="vs-av">${avatarHtml(e.av, sk, 58)}</div>${rankCard(ri, { size: 96, anim: true, name: '', sub: 'Level ' + e.level }).replace('<span class="rkc-pts">', `<span class="rkc-who">${nameHtml(who, e.nc, ri.key)}</span><span class="rkc-pts">`)}</div>`; }
      return `<div class="vs-card s${side} plain"><div class="vs-av">${avatarHtml(e.av, sk, 58)}</div><div class="vs-plain"><b>${esc(who)}</b><small>${e.bot ? 'BOT' : 'GAST'} · Level ${e.level || 1}</small></div></div>`;
    };
    const eloLine = () => { if (!ranked) return ''; const me = m.ents.find(e => e.id === m.you); if (!me || !me.acct) return ''; const mine = sides.find(s => s.some(e => e.id === me.id)) || sides[0], foes = sides.find(s => s !== mine) || [], win = eloDelta({ me: avg(mine), opps: foes.map(e => e.rp || 0), score: 1 }), lose = eloDelta({ me: avg(mine), opps: foes.map(e => e.rp || 0), score: 0 }); return `<div class="vs-elo"><span class="w">Sieg <b>+${win}</b></span><span class="l">Niederlage <b>${lose}</b></span></div>`; };
    const col = (i) => (two ? TEAMS[i].color : i ? '#ff5a3c' : '#2aa8ff');
    el.innerHTML = `<div class="vs-bg"></div><div class="vs-top"><small>${ranked ? 'RANKED' : 'MATCH'}</small><b>${esc(mode.name)}</b><em>${esc((await_map(m)))}</em></div>
      <div class="vs-row"><div class="vs-side l n${sides[0].length}" style="--sc:${col(0)}">${sides[0].map(e => card(e, 0)).join('')}</div><div class="vs-mid"><b>VS</b></div><div class="vs-side r n${sides[1].length}" style="--sc:${col(1)}">${sides[1].map(e => card(e, 1)).join('')}</div></div>
      ${eloLine()}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._vsT); this._vsT = setTimeout(() => el.classList.remove('show'), Math.max(500, (secs - 0.2) * 1000));
  };
  const await_map = (m) => (m.settings.map === 'arena' ? 'Arena Zero' : 'Neon Frontier');
  P.hideVS = function () { clearTimeout(this._vsT); $('#vs')?.classList.remove('show'); };
}
