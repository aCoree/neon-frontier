// Eingabe: Tastatur, Maus, Pointer-Lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas; this.keys = new Set(); this.pressed = new Set(); this.mouse = new Set(); this.mousePressed = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0; this.locked = false; this.enabled = false; this.sens = 1;
    this.noLock = new URLSearchParams(location.search).has('nolock'); if (this.noLock) this.locked = true; // Test-Modus ohne Pointer-Lock
    this.touch = false;   // Touch-Gerät: kein Pointer-Lock, 'locked' bedeutet 'Steuerung aktiv'
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.clear(); });
    canvas.addEventListener('mousedown', (e) => { if (!this.enabled) return; if (!this.locked) { this.lock(); return; } this.mouse.add(e.button); this.mousePressed.add(e.button); e.preventDefault(); });
    addEventListener('mouseup', (e) => { this.mouse.delete(e.button); });
    addEventListener('mousemove', (e) => { if (this.locked && (this.noLock ? this.enabled : true)) { this.dx += e.movementX; this.dy += e.movementY; } });
    addEventListener('wheel', (e) => { if (this.enabled && this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.clear(); this.keys.clear(); }
      this.onLockChange && this.onLockChange(this.locked);
    });
  }
  lock() {
    if (this.touch) { if (!this.locked) { this.locked = true; this.onLockChange && this.onLockChange(true); } try { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* nicht überall erlaubt */ } return; }
    if (this.noLock) return; try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()); } catch { this.canvas.requestPointerLock(); } }
  unlock() {
    if (this.touch) { if (this.locked) { this.locked = false; this.mouse.clear(); this.keys.clear(); this.onLockChange && this.onLockChange(false); } return; }
    if (this.noLock) return; if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  btn(b) { return this.mouse.has(b); }
  btnHit(b) { return this.mousePressed.has(b); }
  endFrame() { this.pressed.clear(); this.mousePressed.clear(); this.dx = this.dy = 0; this.wheel = 0; }
}
