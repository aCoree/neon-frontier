// Touch-Steuerung für Handy/Tablet: virtueller Stick links (Bewegung, ganz vorne = Sprint), Blickfläche rechts, Aktionsknöpfe.
// Es werden dieselben Eingaben erzeugt wie bei Tastatur und Maus (keys / mouse / dx,dy) – das Spiel selbst kennt keinen Unterschied.
// Nur Darstellung/Eingabe: Der Server prüft Bewegung und Schüsse wie bei jedem anderen Spieler.
export const isTouchDevice = () => {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('touch') === '0') return false; if (q.get('touch') === '1') return true;
    return (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  } catch { return false; }
};

const LOOK = 1.5;      // Bildschirm-Pixel → "Maus-Counts"
const STICK_R = 58;    // Stick-Radius in px

export class TouchControls {
  constructor(input, game) {
    this.in = input; this.g = game; this.on = false; this.shown = false;
    this.stick = null; this.looks = new Map(); this.btns = new Map(); this.toggles = { aim: false, crouch: false };
    this.build();
  }
  build() {
    const root = this.root = document.createElement('div'); root.id = 'touch'; root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="tz-stick" id="tz-stick"><i id="tz-knob"></i></div>
      <div class="tz-top">
        <button data-k="map">Karte</button><button data-k="tab">Tabelle</button><button data-k="chat">Chat</button><button data-k="pause">Pause</button>
      </div>
      <div class="tz-items">
        <button data-c="KeyV" class="tzb"><b>⤓</b><small>Droppen</small></button><button data-k="emote" class="tzb"><b>☺</b><small>Emote</small></button>
      </div>
      <div class="tz-act">
        <button data-k="fire" class="big fire" data-look="1"><b>FEUER</b></button>
        <button data-c="Space" class="jump"><b>↑</b><small>Sprung</small></button>
        <button data-k="aim" class="aim"><b>◎</b><small>Zielen</small></button>
        <button data-c="KeyR" class="rel"><b>R</b><small>Nachladen</small></button>
        <button data-k="crouch" class="crh"><b>▾</b><small>Ducken</small></button>
        <button data-c="KeyQ" class="dash"><b>»</b><small>Dash</small></button>
        <button data-c="KeyE" class="use"><b>E</b><small>Nehmen</small></button>
        <button data-k="next" class="nxt"><b>⇄</b><small>Waffe</small></button>
      </div>
      <button data-k="fire" class="fire2" data-look="1"><b>FEUER</b></button>`;
    document.body.appendChild(root);
    this.elStick = root.querySelector('#tz-stick'); this.knob = root.querySelector('#tz-knob');
    root.addEventListener('pointerdown', (e) => this.down(e), { passive: false });
    root.addEventListener('pointermove', (e) => this.move(e), { passive: false });
    for (const t of ['pointerup', 'pointercancel']) root.addEventListener(t, (e) => this.up(e), { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // Waffen-Slots der HUD direkt antippen
    document.addEventListener('pointerdown', (e) => {
      if (!this.shown) return; const s = e.target.closest && e.target.closest('#slots .slot'); if (!s) return;
      const i = [...s.parentNode.children].indexOf(s); if (i >= 0) { this.tap('Digit' + (i + 1)); e.preventDefault(); }
    }, { passive: false });
    document.addEventListener('pointerdown', (e) => {   // Emote-Rad antippen
      if (!this.shown || !this.g.touchEmote) return; const s = e.target.closest && e.target.closest('#emote-wheel .ew'); if (!s) return;
      const i = [...s.parentNode.querySelectorAll('.ew')].indexOf(s); if (i >= 0) { this.g.ui.sendEmote(i); this.g.touchEmote = false; e.preventDefault(); }
    }, { passive: false });
    document.addEventListener('pointerdown', (e) => {   // Verbrauchsgegenstände & Gadget der HUD antippen
      if (!this.shown) return; const s = e.target.closest && e.target.closest('#items .it'); if (!s) return;
      const k = s.querySelector('kbd'); if (k) { this.tap('Key' + k.textContent.trim()); e.preventDefault(); }
    }, { passive: false });
    addEventListener('blur', () => this.releaseAll());
  }

  // ---- Eingaben erzeugen ----
  press(code) { const i = this.in; if (!i.keys.has(code)) i.pressed.add(code); i.keys.add(code); }
  release(code) { this.in.keys.delete(code); }
  tap(code) { this.press(code); setTimeout(() => this.release(code), 60); }
  fire(on) { const i = this.in; if (on) { i.mouse.add(0); i.mousePressed.add(0); } else i.mouse.delete(0); }
  setAim(on) { const i = this.in; this.toggles.aim = on; if (on) { i.mouse.add(2); i.mousePressed.add(2); } else i.mouse.delete(2); this.root.querySelector('.aim').classList.toggle('on', on); }
  setCrouch(on) { this.toggles.crouch = on; if (on) this.press('KeyC'); else this.release('KeyC'); this.root.querySelector('.crh').classList.toggle('on', on); }
  releaseAll() { const i = this.in; for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space', 'KeyR', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'KeyG', 'KeyF', 'KeyV']) i.keys.delete(c); i.mouse.delete(0); this.stick = null; this.looks.clear(); this.btns.clear(); this.knob.style.transform = ''; this.elStick.classList.remove('on'); this.root.querySelectorAll('button.dn').forEach(b => b.classList.remove('dn')); }

  down(e) {
    if (!this.shown) return; e.preventDefault();
    const b = e.target.closest && e.target.closest('button');
    if (b) {
      this.btns.set(e.pointerId, { b, x: e.clientX, y: e.clientY }); b.classList.add('dn'); try { this.root.setPointerCapture(e.pointerId); } catch { /* egal */ }
      const k = b.dataset.k, c = b.dataset.c;
      if (c) this.press(c);
      else if (k === 'fire') this.fire(true);
      else if (k === 'aim') this.setAim(!this.toggles.aim);
      else if (k === 'crouch') this.setCrouch(!this.toggles.crouch);
      else if (k === 'next') this.in.wheel += 1;
      else if (k === 'map') this.g.ui.map.toggle();
      else if (k === 'tab') this.g.ui.hud.showBoard(true);
      else if (k === 'chat') this.chat();
      else if (k === 'emote') this.g.touchEmote = !this.g.touchEmote;
      else if (k === 'pause') { this.releaseAll(); this.in.unlock(); }
      return;
    }
    const x = e.clientX, w = innerWidth;
    try { this.root.setPointerCapture(e.pointerId); } catch { /* egal */ }
    if (x < w * 0.42 && !this.stick) {   // Stick entsteht dort, wo der Daumen aufsetzt
      this.stick = { id: e.pointerId, cx: e.clientX, cy: e.clientY, x: 0, y: 0 };
      this.elStick.style.left = (e.clientX - STICK_R) + 'px'; this.elStick.style.top = (e.clientY - STICK_R) + 'px'; this.elStick.classList.add('on'); this.knob.style.transform = '';
    } else this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  move(e) {
    if (!this.shown) return; const s = this.stick;
    if (s && s.id === e.pointerId) { e.preventDefault(); this.moveStick(e.clientX - s.cx, e.clientY - s.cy); return; }
    const l = this.looks.get(e.pointerId) || this.btns.get(e.pointerId)?.b.dataset.look && this.btns.get(e.pointerId);
    if (l) { e.preventDefault(); this.in.dx += (e.clientX - l.x) * LOOK; this.in.dy += (e.clientY - l.y) * LOOK; l.x = e.clientX; l.y = e.clientY; }
  }
  up(e) {
    const s = this.stick; if (s && s.id === e.pointerId) { this.stick = null; for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) this.release(c); this.knob.style.transform = ''; this.elStick.classList.remove('on'); return; }
    this.looks.delete(e.pointerId);
    const b = this.btns.get(e.pointerId); if (!b) return; this.btns.delete(e.pointerId); b.b.classList.remove('dn');
    const k = b.b.dataset.k, c = b.b.dataset.c;
    if (c) this.release(c); else if (k === 'fire') { if (![...this.btns.values()].some(o => o.b.dataset.k === 'fire')) this.fire(false); } else if (k === 'tab') this.g.ui.hud.showBoard(false);
  }
  moveStick(dx, dy) {
    const d = Math.hypot(dx, dy) || 1, m = Math.min(d, STICK_R), nx = dx / d * m, ny = dy / d * m, ax = nx / STICK_R, ay = ny / STICK_R;
    this.knob.style.transform = `translate(${nx}px,${ny}px)`;
    const set = (c, v) => v ? this.press(c) : this.release(c);
    set('KeyW', ay < -0.28); set('KeyS', ay > 0.28); set('KeyA', ax < -0.28); set('KeyD', ax > 0.28);
    set('ShiftLeft', ay < -0.28 && d > STICK_R * 1.05 && !this.toggles.crouch);   // über den Rand schieben = Sprinten
    this.elStick.classList.toggle('run', d > STICK_R * 1.05);
  }
  chat() {
    const ui = this.g.ui, inp = document.getElementById('chat-in'); if (!inp || this.g.net?.kind === 'local') return;
    ui.chatOpen = true; inp.style.display = 'block'; this.g.input.enabled = true; inp.focus();
    inp.onblur = () => setTimeout(() => { if (inp.value.trim()) ui.sendChat(inp.value); inp.value = ''; inp.style.display = 'none'; ui.chatOpen = false; inp.onblur = null; }, 80);
  }

  // Jedes Frame: sichtbar nur im laufenden Match mit aktiver Steuerung
  update() {
    const g = this.g, want = g.mode === 'play' && this.in.locked && !g.mapOpen && !g.matchEnded && !g.ui.chatOpen;
    if (want !== this.shown) { this.shown = want; this.root.classList.toggle('show', want); if (!want) this.releaseAll(); document.body.classList.toggle('t-play', want); }
    if (!want) return;
    // Interaktions-Knopf nur bei verfügbarer Aktion hervorheben
    const pr = document.getElementById('prompt'), use = this.root.querySelector('.use'); if (use && pr) use.classList.toggle('hot', !!pr.textContent.trim() && getComputedStyle(pr).opacity !== '0');
  }
}
