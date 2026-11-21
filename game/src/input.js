// Keyboard + mouse input: WASD state, pointer-lock orbit, clicks, edge-triggered keys.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered, consumed each frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.locked = false;
    this.onFirstGesture = null;
    this._gestured = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this._gesture();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      this._gesture();
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
  }

  _gesture() {
    if (!this._gestured) { this._gestured = true; if (this.onFirstGesture) this.onFirstGesture(); }
  }

  lockPointer() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
  }

  unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }

  // True once, on the frame the key went down.
  hit(code) { return this.pressed.has(code); }

  // True once, on the frame the mouse was clicked.
  click() { return this.mouseClicked; }

  axis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  }

  // Call at the end of each frame: clears edge triggers, keeps held keys.
  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
