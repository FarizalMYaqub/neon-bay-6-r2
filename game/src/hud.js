// HUD: DOM readouts (health, cash, ammo, stars, clock, objective, speed, dialogue)
// plus the live 2D minimap canvas (roads, player arrow, traffic, police, marker).
import { CITY, ROADS } from './city.js';

export class Hud {
  constructor() {
    this.el = {
      health: document.getElementById('healthfill'),
      cash: document.getElementById('cash'),
      ammo: document.getElementById('ammo'),
      clock: document.getElementById('clock'),
      wanted: document.getElementById('wanted'),
      objTitle: document.getElementById('objTitle'),
      objText: document.getElementById('objText'),
      speed: document.getElementById('speed'),
      speedNum: document.getElementById('speedNum'),
      dialogue: document.getElementById('dialogue'),
      dlgWho: document.getElementById('dlgWho'),
      dlgLine: document.getElementById('dlgLine'),
      hint: document.getElementById('hint'),
      flash: document.getElementById('flash'),
      crosshair: document.getElementById('crosshair'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this._dlgTimer = null;
    this._lastStars = -1;
  }

  setHealth(h) { this.el.health.style.width = Math.max(0, Math.min(100, h)) + '%'; }
  setCash(c) { this.el.cash.textContent = '$' + Math.floor(c).toLocaleString('en-US'); }
  setAmmo(mag, reserve) { this.el.ammo.textContent = 'PISTOL ' + mag + ' / ' + reserve; }
  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.el.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  setWanted(stars) {
    if (stars === this._lastStars) return;
    this._lastStars = stars;
    let html = '';
    for (let i = 0; i < 5; i++) html += '<span class="' + (i < stars ? '' : 'off') + '">★</span>';
    this.el.wanted.innerHTML = html;
    if (stars > 0) this.flash();
  }

  flash() {
    this.el.flash.style.transition = 'none';
    this.el.flash.style.opacity = '1';
    requestAnimationFrame(() => {
      this.el.flash.style.transition = 'opacity 0.9s';
      this.el.flash.style.opacity = '0';
    });
  }

  setObjective(title, text) {
    this.el.objTitle.textContent = title;
    this.el.objText.textContent = text;
  }

  setSpeed(mph, driving) {
    this.el.speed.style.display = driving ? 'block' : 'none';
    if (driving) this.el.speedNum.textContent = Math.round(Math.abs(mph));
  }

  showDialogue(who, line, seconds) {
    this.el.dlgWho.textContent = who;
    this.el.dlgLine.textContent = line;
    this.el.dialogue.style.display = 'block';
    if (this._dlgTimer) clearTimeout(this._dlgTimer);
    this._dlgTimer = setTimeout(() => { this.el.dialogue.style.display = 'none'; }, (seconds || 6) * 1000);
  }

  setHint(text) { this.el.hint.textContent = text; }
  showCrosshair(show) { this.el.crosshair.style.display = show ? 'block' : 'none'; }

  // Top-down minimap: roads grey, sea blue, player white arrow, traffic yellow,
  // police flashing blue/red, peds faint dots, mission marker gold.
  drawMinimap(player, heading, traffic, police, peds, missionTarget, time) {
    const ctx = this.mapCtx;
    const S = 210, half = CITY.half + 30;
    const toMap = (x, z) => [S / 2 + (x / half) * (S / 2 - 6), S / 2 + (z / half) * (S / 2 - 6)];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#0a0618';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    // Sea strip at the bottom (south = +z).
    const [sx, sy] = toMap(-half, CITY.beachZ);
    ctx.fillStyle = '#14586e';
    ctx.fillRect(0, sy, S, S - sy);
    ctx.fillStyle = '#d9b380';
    ctx.fillRect(0, toMap(0, CITY.beachZ)[1] - 4, S, 8);
    // Roads.
    ctx.strokeStyle = '#55556a'; ctx.lineWidth = 4;
    for (const r of ROADS) {
      const [ax, ay] = toMap(r, -half); const [bx, by] = toMap(r, half);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      const [cx, cy] = toMap(-half, r); const [dx, dy] = toMap(half, r);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(dx, dy); ctx.stroke();
    }
    // Mission marker.
    if (missionTarget) {
      const [mx, my] = toMap(missionTarget.x, missionTarget.z);
      const pulse = 5 + Math.sin(time * 4) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0f2e';
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', mx, my);
    }
    // Pedestrians.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const p of peds) {
      const [px, py] = toMap(p.mesh.position.x, p.mesh.position.z);
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    // Traffic.
    ctx.fillStyle = '#ffe08a';
    for (const c of traffic) {
      const [px, py] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Police (flashing).
    ctx.fillStyle = Math.sin(time * 8) > 0 ? '#ff4040' : '#4080ff';
    for (const c of police) {
      const [px, py] = toMap(c.pos.x, c.pos.z);
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // Ring border.
    ctx.strokeStyle = 'rgba(255,93,162,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }
}
