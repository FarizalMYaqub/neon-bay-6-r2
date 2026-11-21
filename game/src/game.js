// Neon Bay — main game: player controller, driving, wanted + police, combat,
// particles, camera, save/load, start/pause/end screens. Three.js, static files.
import * as THREE from 'three';
import { makeRng, queryParams } from './rng.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, CITY, nearestRoadPoint } from './city.js';
import { makeCarMesh, spawnTraffic, spawnParked, spawnPolice, nearestStealable } from './vehicles.js';
import { makePersonMesh, spawnPedestrians, spawnGang, makePickup } from './people.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { applyShot } from './shots.js';

const SAVE_KEY = 'neon-bay-save-v1';

export class Game {
  constructor() {
    const params = queryParams();
    this.seed = parseInt(params.seed || '7', 10) || 7;
    this.shotName = params.shot || null;
    this.rng = makeRng(this.seed);
    this.state = 'menu'; // menu | playing | paused | over
    this.time = 0;
    this.clockMinutes = 18 * 60 + 42;
    this.cash = 0;
    this.health = 100;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.crimeCooldown = 0;
    this.ammoMag = 12;
    this.ammoReserve = 48;
    this.reloadTimer = 0;
    this.punchCd = 0;
    this.dead = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'webgl';
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.city = buildCity(this.scene, this.rng);

    this.input = new Input(this.renderer.domElement);
    this.audio = new AudioEngine();
    this.hud = new Hud();
    this.missions = new Missions(this.scene);
    this.missions.onEvent = (type, data) => this.onMissionEvent(type, data);

    // Player on foot.
    this.player = {
      mesh: makePersonMesh(0x1a1a2e, 0x2a2a3a, 0xd9a066),
      pos: new THREE.Vector3(-8, 0, 24),
      vy: 0, heading: Math.PI, onGround: true, speed: 0,
    };
    // A cap so Rook reads as a character.
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 10),
      new THREE.MeshLambertMaterial({ color: 0xff5da2 }));
    cap.position.y = 1.88;
    this.player.mesh.add(cap);
    this.player.mesh.position.copy(this.player.pos);
    this.scene.add(this.player.mesh);

    // World population.
    this.traffic = spawnTraffic(this.scene, this.rng, 16);
    this.parkedCars = spawnParked(this.scene, this.rng, 6);
    this.police = [];
    this.peds = spawnPedestrians(this.scene, this.rng, 30);
    this.gang = [];

    // Combat helpers.
    this.raycaster = new THREE.Raycaster();
    this.tracer = null;
    this.tracerLife = 0;
    this.muzzle = new THREE.PointLight(0xffc46b, 0, 18);
    this.scene.add(this.muzzle);
    this.particles = this._makeParticles();

    // Camera orbit.
    this.camYaw = Math.PI;
    this.camPitch = 0.28;
    this.camDistance = 13;
    this.camTarget = new THREE.Vector3();

    this.driving = null; // Car the player is driving
    this._policeSpawnT = 0;
    this._saveFlashT = 0;

    this._wireUi();
    window.addEventListener('resize', () => this._resize());
    this.input.onFirstGesture = () => { this.audio.ensure(); this.audio.startMusic(); };
    this._updateWantedHud();
    this.hud.setCash(0);
    this.hud.setHealth(100);
    this.hud.setAmmo(this.ammoMag, this.ammoReserve);
    this._showContinueIfSave();

    // Deterministic screenshot mode: build the scene, then pose it.
    if (this.shotName) {
      applyShot(this, this.shotName);
    }
    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _makeParticles() {
    const N = 240;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffc46b, size: 0.45, transparent: true, opacity: 0.95 });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, pos, vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0, N };
  }

  burst(p, color, count, speed) {
    const P = this.particles;
    if (color) P.points.material.color.setHex(color);
    for (let i = 0; i < count; i++) {
      const idx = P.next; P.next = (P.next + 1) % P.N;
      P.pos[idx * 3] = p.x; P.pos[idx * 3 + 1] = p.y + 0.4; P.pos[idx * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      P.vel[idx * 3] = Math.cos(a) * Math.cos(b) * speed;
      P.vel[idx * 3 + 1] = Math.abs(Math.sin(b)) * speed + 2;
      P.vel[idx * 3 + 2] = Math.sin(a) * Math.cos(b) * speed;
      P.life[idx] = 0.5 + Math.random() * 0.4;
    }
  }

  _updateParticles(dt) {
    const P = this.particles;
    for (let i = 0; i < P.N; i++) {
      if (P.life[i] <= 0) { P.pos[i * 3 + 1] = -100; continue; }
      P.life[i] -= dt;
      P.pos[i * 3] += P.vel[i * 3] * dt;
      P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
      P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      P.vel[i * 3 + 1] -= 12 * dt;
    }
    P.points.geometry.attributes.position.needsUpdate = true;
  }

  _wireUi() {
    document.getElementById('startBtn').addEventListener('click', () => {
      this.audio.ensure(); this.audio.startMusic();
      this.startGame({ keepOverlay: false });
      this.input.lockPointer();
    });
    document.getElementById('continueBtn').addEventListener('click', () => {
      this.audio.ensure(); this.audio.startMusic();
      this.loadSave();
      this.startGame({ keepOverlay: false });
      this.input.lockPointer();
    });
    document.getElementById('resumeBtn').addEventListener('click', () => this.resume());
    document.getElementById('saveBtn').addEventListener('click', () => { this.saveGame(); this.hud.setHint('Game saved.'); });
    document.getElementById('restartBtn').addEventListener('click', () => { this.loadSave(); this.resume(); });
    document.getElementById('againBtn').addEventListener('click', () => {
      localStorage.removeItem(SAVE_KEY);
      window.location.reload();
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing') this.input.lockPointer();
    });
  }

  _showContinueIfSave() {
    try {
      if (localStorage.getItem(SAVE_KEY)) document.getElementById('continueBtn').style.display = 'inline-block';
    } catch (_) {}
  }

  startGame(opts) {
    this.state = 'playing';
    document.getElementById('startOverlay').style.display = opts.keepOverlay ? 'flex' : 'none';
    document.getElementById('pauseOverlay').style.display = 'none';
    document.getElementById('endOverlay').style.display = 'none';
    if (!opts.keepOverlay) this.hud.showDialogue('MARA', 'Rook — first job: get to Marina Point. Steal a car with E if you need wheels.', 7);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    document.getElementById('pauseOverlay').style.display = 'none';
    this.input.lockPointer();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pauseOverlay').style.display = 'flex';
    this.input.unlockPointer();
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, health: this.health,
        mission: this.missions.index,
        x: this.player.pos.x, z: this.player.pos.z,
        clock: this.clockMinutes, ammoMag: this.ammoMag, ammoReserve: this.ammoReserve,
      }));
    } catch (_) {}
  }

  loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s) return;
      this.cash = s.cash || 0; this.health = s.health || 100;
      this.player.pos.set(s.x || -8, 0, s.z || 24);
      this.clockMinutes = s.clock || 1122;
      this.ammoMag = s.ammoMag ?? 12; this.ammoReserve = s.ammoReserve ?? 48;
      this.missions.start(Math.min(s.mission || 0, 2));
      this.hud.setCash(this.cash);
    } catch (_) {}
  }

  onMissionEvent(type, data) {
    if (type === 'dialogue') this.hud.showDialogue(data.who, data.line, 7);
    else if (type === 'mission-start') {
      this.hud.setObjective(data.title, data.objective);
      this.hud.showDialogue('MARA', data.mara, 7);
      if (data.id === 2) {
        const pkg = makePickup(this.scene, new THREE.Vector3(0, 0, 0));
        this.missions.setPickupMesh(pkg);
      } else if (data.id === 3) {
        this.setWanted(3);
        this.spawnPoliceNear(4);
      }
    } else if (type === 'gang-spawn') {
      this.gang = spawnGang(this.scene, new THREE.Vector3(0, 0, 0), 3, this.rng);
      for (const g of this.gang) g.mesh.userData.owner = g;
      this.missions.setGang(this.gang);
      this.audio.wantedUp();
    } else if (type === 'mission-complete') {
      this.cash += data.def.reward;
      this.hud.setCash(this.cash);
      this.hud.setObjective(data.def.title + ' — DONE', '+$' + data.def.reward + ' — ' + data.line);
      this.hud.showDialogue('MARA', data.line, 7);
      this.audio.missionDone();
      this.audio.cash();
      this.saveGame();
      setTimeout(() => { if (!this.missions.done) this.missions.beginNext(); }, 2500);
    } else if (type === 'story-complete') {
      this.state = 'over';
      document.getElementById('endTitle').textContent = 'YOU OWN THE NIGHT';
      document.getElementById('endText').textContent =
        'All three jobs done. Mara is waiting at the plaza with your cut — $2,900 and the keys to Neon Bay. Thanks for playing.';
      document.getElementById('endOverlay').style.display = 'flex';
      this.input.unlockPointer();
      this.saveGame();
    }
  }

  setWanted(n, silent) {
    const prev = this.wanted;
    this.wanted = Math.max(0, Math.min(5, n));
    if (this.wanted > prev) {
      this.wantedTimer = 0;
      if (!silent) this.audio.wantedUp();
      this.hud.flash();
    }
    this._updateWantedHud();
  }

  _updateWantedHud() { this.hud.setWanted(this.wanted); }

  addCrime(amount) {
    if (this.crimeCooldown > 0) return;
    this.crimeCooldown = 1.2;
    this.setWanted(this.wanted + amount);
    this.wantedTimer = 0;
  }

  enterCar(car) {
    car.parked = false;
    car.kind = 'player';
    car.occupied = true;
    this.driving = car;
    this.player.mesh.visible = false;
    if (!car.stolen) {
      car.stolen = true;
      this.addCrime(1);
      this.hud.setHint('Car stolen! The law noticed. (+1 wanted)');
      this.audio.pickup();
    } else this.hud.setHint('Driving — W/S accelerate & brake, A/D steer.');
    this.hud.showCrosshair(false);
  }

  exitCar() {
    if (!this.driving) return;
    const car = this.driving;
    car.occupied = false;
    this.driving = null;
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    this.player.pos.copy(car.pos).addScaledVector(side, 2.4);
    this.player.pos.y = 0;
    this.player.mesh.position.copy(this.player.pos);
    this.player.mesh.visible = true;
    this.player.heading = car.heading;
    this.hud.setHint('On foot — E near a parked car to steal it.');
  }

  spawnPoliceNear(count, dist) {
    const d = dist || 70;
    while (this.police.length < count) {
      const base = this.driving ? this.driving.pos : this.player.pos;
      const a = Math.random() * Math.PI * 2;
      const spot = nearestRoadPoint(base.x + Math.sin(a) * d, base.z + Math.cos(a) * d);
      const car = spawnPolice(this.scene, new THREE.Vector3(spot.x, 0, spot.z), Math.atan2(base.x - spot.x, base.z - spot.z));
      car.mesh.userData.owner = car;
      this.police.push(car);
    }
  }

  _removePolice(car) {
    this.scene.remove(car.mesh);
    this.police.splice(this.police.indexOf(car), 1);
  }

  // ---- combat ----
  _shootTargets() {
    const list = [];
    for (const g of this.gang) if (g.alive) list.push(g.mesh);
    for (const c of this.police) list.push(c.mesh);
    for (const c of this.traffic) list.push(c.mesh);
    return list;
  }

  shoot() {
    if (this.reloadTimer > 0 || this.ammoMag <= 0) {
      if (this.ammoMag <= 0) this.reload();
      return;
    }
    this.ammoMag--;
    this.hud.setAmmo(this.ammoMag, this.ammoReserve);
    this.audio.gunshot();
    this.addCrime(1);
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    this.raycaster.far = 120;
    const hits = this.raycaster.intersectObjects(this._shootTargets(), true);
    let end;
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      let obj = h.object;
      while (obj && !obj.userData.owner) obj = obj.parent;
      const owner = obj ? obj.userData.owner : null;
      if (owner && owner.damage) {
        if (owner.damage(34)) {
          this.cash += 50; this.hud.setCash(this.cash);
          this.hud.setHint('Rival down. +$50');
          this.audio.cash();
        }
        this.burst(end, 0xff5040, 10, 4);
      } else if (owner && owner.kind === 'police') {
        this.burst(end, 0xffd23f, 12, 5);
        this.addCrime(1);
      } else {
        this.burst(end, 0xcccccc, 8, 3);
      }
    } else {
      end = origin.clone().addScaledVector(dir, 120);
    }
    // Tracer line + muzzle flash.
    if (this.tracer) this.scene.remove(this.tracer);
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(this.tracer);
    this.tracerLife = 0.07;
    this.muzzle.position.copy(origin).addScaledVector(dir, 1.2);
    this.muzzle.intensity = 60;
    this.player.mesh.visible = this.driving ? false : true;
  }

  reload() {
    if (this.reloadTimer > 0 || this.ammoMag === 12 || this.ammoReserve <= 0) return;
    this.reloadTimer = 0.9;
    this.audio.reload();
  }

  punch() {
    if (this.punchCd > 0 || this.driving) return;
    this.punchCd = 0.45;
    this.audio.punch();
    const p = this.player.pos;
    for (const g of this.gang) {
      if (!g.alive) continue;
      if (Math.hypot(g.mesh.position.x - p.x, g.mesh.position.z - p.z) < 2.4) {
        if (g.damage(34)) { this.cash += 50; this.hud.setCash(this.cash); this.audio.cash(); }
        this.burst(g.mesh.position, 0xff5040, 8, 4);
        return;
      }
    }
    for (const ped of this.peds) {
      if (Math.hypot(ped.mesh.position.x - p.x, ped.mesh.position.z - p.z) < 2.2) {
        ped.mesh.rotation.x = -Math.PI / 2; ped.flee = 99;
        this.addCrime(1);
        this.burst(ped.mesh.position, 0xffffff, 6, 3);
        return;
      }
    }
  }

  _resolveBuildingCollision(pos, radius) {
    for (const b of this.city.boxes) {
      const dx = pos.x - b.x, dz = pos.z - b.z;
      if (Math.abs(dx) < b.hw + radius && Math.abs(dz) < b.hd + radius) {
        const px = b.hw + radius - Math.abs(dx);
        const pz = b.hd + radius - Math.abs(dz);
        if (px < pz) pos.x = b.x + Math.sign(dx || 1) * (b.hw + radius);
        else pos.z = b.z + Math.sign(dz || 1) * (b.hd + radius);
      }
    }
  }

  _frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.time += dt;
    const playing = this.state === 'playing';
    const inShot = !!this.shotName;

    // Pause keys.
    if ((this.input.hit('KeyP') || this.input.hit('Escape')) && this.state === 'playing' && !inShot) this.pause();
    if (this.input.hit('KeyM')) this.audio.setMuted(!this.audio.muted);

    if (playing || this.state === 'menu') {
      this._update(dt, playing);
    }
    // Render always so the menu / shot shows the living city.
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  _update(dt, playing) {
    this.clockMinutes += dt * 0.35;
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    this.punchCd = Math.max(0, this.punchCd - dt);

    // Camera orbit from mouse.
    if (playing && this.input.locked) {
      this.camYaw -= this.input.mouseDX * 0.0028;
      this.camPitch = Math.max(-0.1, Math.min(0.9, this.camPitch + this.input.mouseDY * 0.0022));
    }
    if (this.shotName === 'start') {
      this.camYaw += dt * 0.05; // slow cinematic orbit behind the title
    }

    // Traffic + pedestrians always move.
    for (const c of this.traffic) c.updateTraffic(dt, [...this.traffic, ...this.police, ...(this.driving ? [this.driving] : [])], this.rng);
    const threat = this.driving ? this.driving.pos : this.player.pos;
    for (const p of this.peds) {
      if (p.flee > 90) continue; // knocked down, stays down
      p.update(dt, this.driving && Math.abs(this.driving.speed) > 4 ? this.driving.pos : (this.input.down('KeyF') ? this.player.pos : null));
    }

    if (playing) {
      if (this.input.hit('KeyE')) {
        if (this.driving) this.exitCar();
        else {
          const car = nearestStealable(this.player.pos, this.parkedCars, 4.5);
          if (car) this.enterCar(car);
        }
      }
      if (this.driving) this._updateDriving(dt);
      else this._updateOnFoot(dt);
      this._updateWanted(dt);
      this._updatePolice(dt);
      this._updateGang(dt);
      this.missions.update(dt, this.driving ? this.driving.pos : this.player.pos, this.wanted);
      // Reload finish.
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt;
        if (this.reloadTimer <= 0) {
          const need = 12 - this.ammoMag;
          const take = Math.min(need, this.ammoReserve);
          this.ammoMag += take; this.ammoReserve -= take;
          this.hud.setAmmo(this.ammoMag, this.ammoReserve);
        }
      }
      if (this.input.hit('KeyR')) this.reload();
      // Slow health regen out of combat.
      if (this.wanted === 0 && this.health < 100) this.health = Math.min(100, this.health + dt * 2);
      this.hud.setHealth(this.health);
      this.hud.setClock(this.clockMinutes);
      // Muzzle + tracer fade.
      if (this.tracerLife > 0) { this.tracerLife -= dt; if (this.tracerLife <= 0 && this.tracer) { this.scene.remove(this.tracer); this.tracer = null; } }
      this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 900);
    }

    this._updateParticles(dt);
    this._updateCamera(dt);
    const focus = this.driving ? this.driving.pos : this.player.pos;
    this.hud.drawMinimap(focus, this.driving ? this.driving.heading : this.player.heading,
      this.traffic, this.police, this.peds,
      this.missions.current && this.missions.current.target ? this.missions.current.target : null, this.time);
    // Audio follows state.
    this.audio.setEngine(this.driving ? Math.abs(this.driving.speed) / this.driving.maxSpeed : 0, !!this.driving);
    this.audio.setSiren(this.wanted > 0 && this.police.length > 0);
  }

  _updateOnFoot(dt) {
    const ax = this.input.axis();
    const run = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    const speed = run ? 9.5 : 5.5;
    // Movement relative to camera yaw.
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    let mx = 0, mz = 0;
    if (ax.x || ax.z) {
      mx = (ax.x * cos - ax.z * sin);
      mz = (ax.x * sin + ax.z * cos);
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      this.player.heading = Math.atan2(mx, mz);
    }
    const p = this.player.pos;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    this._resolveBuildingCollision(p, 0.7);
    p.x = Math.max(-CITY.half, Math.min(CITY.half, p.x));
    p.z = Math.max(-CITY.half, Math.min(CITY.half + 10, p.z));
    // Jump + gravity.
    if (this.input.hit('Space') && this.player.onGround) { this.player.vy = 7.5; this.player.onGround = false; }
    if (!this.player.onGround) {
      this.player.vy -= 22 * dt;
      p.y += this.player.vy * dt;
      if (p.y <= 0) { p.y = 0; this.player.vy = 0; this.player.onGround = true; }
    }
    const moving = (ax.x || ax.z) ? 1 : 0;
    this.player.speed = moving * speed;
    this.player.mesh.position.copy(p);
    this.player.mesh.rotation.y = this.player.heading;
    // Walk swing.
    const phase = this.time * (run ? 13 : 9);
    const s = moving ? Math.sin(phase) * 0.55 : 0;
    this.player.mesh.userData.legL.rotation.x = s;
    this.player.mesh.userData.legR.rotation.x = -s;
    this.player.mesh.userData.armL.rotation.x = -s * 0.7;
    this.player.mesh.userData.armR.rotation.x = s * 0.7;
    if (this.input.hit('KeyF')) this.punch();
    if (this.input.click()) this.shoot();
    this.hud.setSpeed(0, false);
    this.hud.showCrosshair(true);
  }

  _updateDriving(dt) {
    const car = this.driving;
    let throttle = (this.input.down('KeyW') || this.input.down('ArrowUp') ? 1 : 0) +
      (this.input.down('KeyS') || this.input.down('ArrowDown') ? -0.7 : 0);
    // Screenshot setups cruise on their own so the shot shows motion + speed.
    if (this.shotName === 'drive' || this.shotName === 'chase') throttle = 1;
    const steer = (this.input.down('KeyA') || this.input.down('ArrowLeft') ? 1 : 0) +
      (this.input.down('KeyD') || this.input.down('ArrowRight') ? -1 : 0);
    const prevSpeed = car.speed;
    car.drive(dt, throttle, steer);
    // Skid particles + sound when cornering hard.
    if (Math.abs(steer) > 0 && Math.abs(car.speed) > 12 && Math.random() < dt * 20) {
      this.burst(new THREE.Vector3(car.pos.x, 0.1, car.pos.z), 0xaaaaaa, 2, 2);
    }
    // Building collision: bounce back.
    const before = car.pos.clone();
    this._resolveBuildingCollision(car.pos, 2.2);
    if (!car.pos.equals(before) && Math.abs(car.speed) > 4) {
      car.speed *= -0.35;
      this.audio.crash();
      this.burst(car.pos, 0xffc46b, 14, 5);
      this.health = Math.max(0, this.health - 4);
    }
    // Ram traffic cars: shove them, small damage + wanted if police near.
    for (const o of this.traffic) {
      const d = Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z);
      if (d < 3.6 && Math.abs(car.speed) > 6) {
        o.pos.x += (o.pos.x - car.pos.x) * 0.4;
        o.pos.z += (o.pos.z - car.pos.z) * 0.4;
        o.speed = Math.max(o.speed, 8);
        if (Math.abs(prevSpeed) > 10) { this.audio.crash(); this.burst(o.pos, 0xffc46b, 10, 4); }
      }
    }
    // Run over pedestrians.
    for (const p of this.peds) {
      if (p.flee > 90) continue;
      if (Math.hypot(p.mesh.position.x - car.pos.x, p.mesh.position.z - car.pos.z) < 2.4 && Math.abs(car.speed) > 5) {
        p.mesh.rotation.x = -Math.PI / 2; p.flee = 99;
        this.addCrime(1);
        this.audio.crash();
        this.burst(p.mesh.position, 0xff5040, 10, 4);
      }
    }
    // Speeding past police.
    if (Math.abs(car.speed) > 24) {
      for (const pc of this.police) {
        if (Math.hypot(pc.pos.x - car.pos.x, pc.pos.z - car.pos.z) < 26) { this.addCrime(1); break; }
      }
    }
    this.hud.setSpeed(Math.abs(car.speed) * 2.2, true);
    this.hud.showCrosshair(false);
  }

  _updateWanted(dt) {
    if (this.wanted === 0) return;
    this.wantedTimer += dt;
    // Lay low: no crime for a while and no police close -> stars decay.
    const nearPolice = this.police.some((pc) => {
      const f = this.driving ? this.driving.pos : this.player.pos;
      return Math.hypot(pc.pos.x - f.x, pc.pos.z - f.z) < 42;
    });
    if (this.wantedTimer > 16 && !nearPolice) {
      this.setWanted(this.wanted - 1);
      this.wantedTimer = 0;
      this.hud.setHint('Heat cooling off…');
    }
  }

  _updatePolice(dt) {
    const wantCount = this.wanted === 0 ? 0 : Math.min(4, this.wanted + 1);
    this._policeSpawnT -= dt;
    if (this.police.length < wantCount && this._policeSpawnT <= 0) {
      this._policeSpawnT = 1.5;
      this.spawnPoliceNear(wantCount);
    }
    if (this.wanted === 0 && this.police.length) {
      // Heat gone: cruisers peel off.
      for (const pc of [...this.police]) this._removePolice(pc);
      return;
    }
    const target = this.driving ? this.driving.pos : this.player.pos;
    for (const pc of [...this.police]) {
      const dist = pc.updatePolice(dt, target);
      // Ram damage on contact.
      if (dist < 3.4) {
        if (this.driving) {
          if (!this.shotName) this.driving.speed *= 0.55;
          this.health = Math.max(0, this.health - 6 * dt * 10);
          if (Math.random() < dt * 2) { this.audio.crash(); this.burst(target, 0xffc46b, 8, 4); }
        } else {
          this.health = Math.max(0, this.health - 12 * dt * 10);
        }
        this.hud.setHealth(this.health);
        if (this.health <= 0) this._die('BUSTED');
      }
      // Despawn cruisers that fell far behind.
      if (dist > 190) this._removePolice(pc);
    }
  }

  _updateGang(dt) {
    for (const g of this.gang) {
      if (!g.alive) continue;
      const res = g.update(dt, this.driving ? this.driving.pos : this.player.pos, (shooter) => {
        // Gang member shoots: tracer from them, chance to hit.
        if (Math.random() < 0.45) {
          this.health = Math.max(0, this.health - 6);
          this.hud.setHealth(this.health);
          this.hud.flash();
          if (this.health <= 0) this._die('WASTED');
        }
        this.audio.gunshot();
      });
      if (res === 'punch') {
        this.health = Math.max(0, this.health - 9);
        this.hud.setHealth(this.health);
        this.audio.punch();
        this.hud.flash();
        if (this.health <= 0) this._die('WASTED');
      }
      // Health bar faces the camera.
      g.bar.lookAt(this.camera.position);
    }
  }

  _die(title) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.dead = true;
    document.getElementById('endTitle').textContent = title;
    document.getElementById('endText').textContent =
      title === 'BUSTED'
        ? 'The Neon Bay police dragged you in. Mara posts bail — but the jobs wait. Try again, Rook.'
        : 'Neon Bay got the better of you this time. Mara will patch you up. Try again, Rook.';
    document.getElementById('endOverlay').style.display = 'flex';
    this.input.unlockPointer();
    this.audio.setSiren(false);
  }

  _updateCamera(dt) {
    const focus = this.driving ? this.driving.pos : this.player.pos;
    const headY = this.driving ? 1.6 : 1.7;
    const targetYaw = this.driving ? this.driving.heading + Math.PI : this.camYaw;
    // In shot mode the yaw is posed; otherwise driving camera trails the car.
    if (!this.shotName && this.driving) {
      let diff = targetYaw - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 2.2);
    }
    const dist = this.driving ? (this.driveCamDistance || 15) : this.camDistance;
    const cx = focus.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = focus.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = focus.y + headY + Math.sin(this.camPitch) * dist;
    this.camTarget.lerp(new THREE.Vector3(cx, Math.max(1.2, cy), cz), Math.min(1, dt * 8));
    this.camera.position.copy(this.camTarget);
    this.camera.lookAt(focus.x, focus.y + headY, focus.z);
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

new Game();
