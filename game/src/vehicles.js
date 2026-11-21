// Vehicles: stealable parked cars, AI traffic that follows the road grid, and
// police cruisers that chase and ram the player. Arcade physics, no library.
import * as THREE from 'three';
import { range, pick, intRange } from './rng.js';
import { ROADS, nearestRoadPoint, CITY } from './city.js';

const CAR_COLORS = [0xd43d5e, 0x2e86ff, 0xffb347, 0x37e6a0, 0xc77dff, 0xe8e8e8, 0x22222c, 0xff7a3d];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1),
    new THREE.MeshLambertMaterial({ color: 0x141824 }));
  cabin.position.set(0, 1.1, -0.25); cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c10 });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w); g.userData.wheels.push(w);
  }
  // Headlights + taillights.
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const sx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), hl);
    h.position.set(sx, 0.62, 2.22); g.add(h);
  }
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), tl);
    t.position.set(sx, 0.62, -2.22); g.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = -0.35; bar.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.x = 0.35; bar.add(blue);
    bar.position.set(0, 1.5, -0.25);
    g.add(bar);
    g.userData.lightBar = bar;
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  return g;
}

export class Car {
  constructor(mesh, opts) {
    this.mesh = mesh;
    this.speed = 0;
    this.heading = opts.heading || 0; // radians, 0 = -z? forward is -z rotated
    this.maxSpeed = opts.maxSpeed || 26;
    this.accel = opts.accel || 14;
    this.steer = 0;
    this.kind = opts.kind || 'parked'; // parked | traffic | police | player
    this.stolen = false;
    this.occupied = false;
    this.parked = opts.kind === 'parked';
    this.routeAxis = opts.routeAxis || 'x';
    this.routeLine = opts.routeLine || 0;
    this.routeDir = opts.routeDir || 1;
    this.wait = 0;
    this.flash = 0;
    this.id = opts.id || 0;
  }

  get pos() { return this.mesh.position; }

  forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  // Arcade player driving: throttle -1..1, steer -1..1.
  drive(dt, throttle, steerInput) {
    const target = throttle * this.maxSpeed;
    const rate = throttle !== 0 ? this.accel : 18;
    this.speed += Math.max(-rate * dt, Math.min(rate * dt, target - this.speed));
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    this.heading += steerInput * 1.7 * dt * Math.sign(this.speed) * Math.min(1, Math.abs(this.speed) / 10);
    const f = this.forward();
    this.mesh.position.addScaledVector(f, this.speed * dt);
    this.mesh.position.x = Math.max(-CITY.half, Math.min(CITY.half, this.mesh.position.x));
    this.mesh.position.z = Math.max(-CITY.half, Math.min(CITY.half + 8, this.mesh.position.z));
    this.mesh.rotation.y = this.heading;
    // Wheel spin + body lean.
    const spin = this.speed * dt / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    this.mesh.rotation.z = -steerInput * Math.min(0.06, Math.abs(this.speed) * 0.002);
  }

  // Traffic AI: cruise along its road line, turn at intersections, slow for cars ahead.
  updateTraffic(dt, cars, rng) {
    if (this.wait > 0) { this.wait -= dt; this.speed = 0; return; }
    // Car ahead on the same line?
    const f = this.forward();
    let blocked = false;
    for (const o of cars) {
      if (o === this || o.parked) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
      const along = dx * f.x + dz * f.z;
      const side = Math.abs(dx * -f.z + dz * f.x);
      if (along > 0 && along < 9 && side < 2.4) { blocked = true; break; }
    }
    const target = blocked ? 0 : this.maxSpeed * 0.55;
    this.speed += Math.max(-14 * dt, Math.min(10 * dt, target - this.speed));
    const p = this.pos;
    p.addScaledVector(f, this.speed * dt);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    // At an intersection, sometimes turn onto the crossing road.
    const onX = Math.abs(p.x - this.routeLine) < 0.4 && this.routeAxis === 'z';
    const onZ = Math.abs(p.z - this.routeLine) < 0.4 && this.routeAxis === 'x';
    const nearCross = ROADS.some((r) => Math.abs((this.routeAxis === 'x' ? p.x : p.z) - r) < 0.6);
    if ((onX || onZ) && nearCross && rng() < dt * 0.25) {
      const cross = (this.routeAxis === 'x' ? p.x : p.z);
      const snapped = ROADS.reduce((a, b) => Math.abs(b - cross) < Math.abs(a - cross) ? b : a);
      if (this.routeAxis === 'x') { this.routeAxis = 'z'; this.routeLine = snapped; this.heading = rng() < 0.5 ? 0 : Math.PI; this.routeDir = this.heading === 0 ? -1 : 1; p.x = snapped; }
      else { this.routeAxis = 'x'; this.routeLine = snapped; this.heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2; this.routeDir = this.heading === Math.PI / 2 ? 1 : -1; p.z = snapped; }
    }
    // Wrap around the city edge.
    if (p.x > CITY.half + 4) p.x = -CITY.half;
    if (p.x < -CITY.half - 4) p.x = CITY.half;
    if (p.z > CITY.half + 4) p.z = -CITY.half;
    if (p.z < -CITY.half - 4) p.z = CITY.half;
  }

  // Police AI: steer toward the target, ram on contact.
  updatePolice(dt, targetPos) {
    const dx = targetPos.x - this.pos.x, dz = targetPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const target = dist > 6 ? this.maxSpeed : this.maxSpeed * 0.5;
    this.speed += Math.max(-20 * dt, Math.min(16 * dt, target - this.speed));
    const f = this.forward();
    this.pos.addScaledVector(f, this.speed * dt);
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    // Flashing light bar.
    this.flash += dt * 9;
    const on = Math.sin(this.flash) > 0;
    if (this.mesh.userData.lightRed) {
      this.mesh.userData.lightRed.material.color.setHex(on ? 0xff2020 : 0x551010);
      this.mesh.userData.lightBlue.material.color.setHex(on ? 0x101050 : 0x2040ff);
    }
    return dist;
  }
}

export function spawnTraffic(scene, rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROADS);
    const along = range(rng, -200, 200);
    const heading = axis === 'x' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const mesh = makeCarMesh(pick(rng, CAR_COLORS), false);
    mesh.position.set(axis === 'x' ? along : line, 0, axis === 'x' ? line : along);
    mesh.rotation.y = heading;
    scene.add(mesh);
    cars.push(new Car(mesh, {
      id: i, kind: 'traffic', heading,
      routeAxis: axis, routeLine: line, maxSpeed: range(rng, 12, 18),
    }));
  }
  return cars;
}

export function spawnParked(scene, rng, count) {
  const cars = [];
  const used = new Set();
  let tries = 0;
  while (cars.length < count && tries < 300) {
    tries++;
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROADS);
    const along = intRange(rng, -180, 180);
    const key = axis + line + ':' + Math.round(along / 12);
    if (used.has(key)) continue;
    used.add(key);
    const off = rng() < 0.5 ? -7.5 : 7.5;
    const heading = axis === 'x' ? (off > 0 ? Math.PI / 2 : -Math.PI / 2) : (off > 0 ? 0 : Math.PI);
    const mesh = makeCarMesh(pick(rng, CAR_COLORS), false);
    mesh.position.set(axis === 'x' ? along : line + off, 0, axis === 'x' ? line + off : along);
    mesh.rotation.y = heading;
    scene.add(mesh);
    cars.push(new Car(mesh, { id: 100 + cars.length, kind: 'parked', heading }));
  }
  return cars;
}

export function spawnPolice(scene, pos, heading) {
  const mesh = makeCarMesh(0x101018, true);
  mesh.position.copy(pos);
  mesh.position.y = 0;
  mesh.rotation.y = heading;
  scene.add(mesh);
  return new Car(mesh, { kind: 'police', heading, maxSpeed: 30, accel: 20 });
}

export function nearestStealable(playerPos, cars, maxDist) {
  let best = null, bestD = maxDist;
  for (const c of cars) {
    if (c.kind !== 'parked' || c.occupied) continue;
    const d = Math.hypot(c.pos.x - playerPos.x, c.pos.z - playerPos.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
