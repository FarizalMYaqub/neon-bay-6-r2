// People: pedestrians strolling the sidewalks who scatter when threatened,
// and rival gang members who fight the player during mission 2.
import * as THREE from 'three';
import { range, pick } from './rng.js';
import { ROADS, nearestRoadPoint } from './city.js';

const SHIRTS = [0xff5da2, 0x37e6ff, 0xffb347, 0x8affc1, 0xe8e8e8, 0xff7a3d, 0xc77dff];
const PANTS = [0x22223a, 0x3a3a4a, 0x1c2a3a, 0x4a2a2a];

export function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin || 0xd9a066 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skinMat);
  head.position.y = 1.62; head.castShadow = true;
  g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
  torso.position.y = 1.08; torso.castShadow = true;
  g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pantsMat);
  legL.position.set(-0.16, 0.36, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  g.userData.legL = legL; g.userData.legR = legR;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirtMat);
  armL.position.set(-0.42, 1.1, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

function healthBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.8, depthTest: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.95, depthTest: false }));
  fg.position.z = 0.01;
  g.add(bg); g.add(fg);
  g.userData.fg = fg;
  return g;
}

export class Pedestrian {
  constructor(mesh, opts) {
    this.mesh = mesh;
    this.speed = opts.speed || 1.6;
    this.heading = opts.heading || 0;
    this.walkPhase = Math.random() * 6;
    this.flee = 0; // seconds of fleeing left
    this.wait = 0;
    this.axis = opts.axis || 'x';
    this.line = opts.line || 0;
  }

  update(dt, threatPos) {
    const p = this.mesh.position;
    const dThreat = threatPos ? Math.hypot(p.x - threatPos.x, p.z - threatPos.z) : 999;
    if (dThreat < 9) this.flee = 2.5;
    if (this.flee > 0) {
      this.flee -= dt;
      // Run away from the threat, off the road.
      const away = Math.atan2(p.x - threatPos.x, p.z - threatPos.z);
      this.heading = away;
      p.x += Math.sin(away) * 4.5 * dt;
      p.z += Math.cos(away) * 4.5 * dt;
    } else {
      if (this.wait > 0) { this.wait -= dt; }
      else {
        p.x += Math.sin(this.heading) * this.speed * dt;
        p.z += Math.cos(this.heading) * this.speed * dt;
        // Turn at intersections sometimes; stay in the city.
        if (Math.abs(p.x) > 205 || Math.abs(p.z) > 205) this.heading += Math.PI;
        if (ROADS.some((r) => Math.abs((this.axis === 'x' ? p.x : p.z) - r) < 0.5) && Math.random() < dt * 0.12) {
          this.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
          if (Math.random() < 0.2) this.wait = 1 + Math.random() * 2;
        }
      }
    }
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * (this.flee > 0 ? 11 : 6);
    const s = Math.sin(this.walkPhase) * 0.5;
    this.mesh.userData.legL.rotation.x = s;
    this.mesh.userData.legR.rotation.x = -s;
    this.mesh.userData.armL.rotation.x = -s * 0.7;
    this.mesh.userData.armR.rotation.x = s * 0.7;
  }
}

export function spawnPedestrians(scene, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROADS);
    const along = range(rng, -200, 200);
    const off = rng() < 0.5 ? -7.5 : 7.5;
    const mesh = makePersonMesh(pick(rng, SHIRTS), pick(rng, PANTS));
    mesh.position.set(axis === 'x' ? along : line + off, 0, axis === 'x' ? line + off : along);
    scene.add(mesh);
    peds.push(new Pedestrian(mesh, {
      axis, line, speed: range(rng, 1.2, 2.2),
      heading: axis === 'x' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI),
    }));
  }
  return peds;
}

export class GangMember {
  constructor(mesh, pos) {
    this.mesh = mesh;
    this.mesh.position.copy(pos);
    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;
    this.attackCd = 0;
    this.shootCd = 1 + Math.random();
    this.bar = healthBar();
    this.bar.position.y = 2.15;
    this.mesh.add(this.bar);
    this.walkPhase = 0;
  }

  update(dt, playerPos, onShoot) {
    if (!this.alive) return;
    const p = this.mesh.position;
    const dx = playerPos.x - p.x, dz = playerPos.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.2) {
      const h = Math.atan2(dx, dz);
      this.mesh.rotation.y = h;
      const sp = dist > 14 ? 4.2 : 2.6;
      p.x += Math.sin(h) * sp * dt;
      p.z += Math.cos(h) * sp * dt;
      this.walkPhase += dt * 8;
      const s = Math.sin(this.walkPhase) * 0.5;
      this.mesh.userData.legL.rotation.x = s;
      this.mesh.userData.legR.rotation.x = -s;
    } else if (this.attackCd <= 0) {
      this.attackCd = 1.1;
      return 'punch'; // caller applies damage
    }
    this.attackCd -= dt;
    this.shootCd -= dt;
    if (dist > 8 && dist < 42 && this.shootCd <= 0) {
      this.shootCd = 1.8 + Math.random();
      if (onShoot) onShoot(this);
    }
    // Face the camera: health bar always faces viewer via lookAt in game loop.
    return null;
  }

  damage(amount) {
    this.health -= amount;
    const f = Math.max(0, this.health / this.maxHealth);
    this.bar.userData.fg.scale.x = f;
    this.bar.userData.fg.position.x = -(1 - f) * 0.53;
    if (this.health <= 0) {
      this.alive = false;
      this.mesh.rotation.x = -Math.PI / 2; // fall over
      this.mesh.position.y = 0.25;
      this.bar.visible = false;
      return true;
    }
    return false;
  }
}

export function spawnGang(scene, center, count, rng) {
  const gang = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePersonMesh(0x8a1a2a, 0x1a1a22, 0xc98a5a);
    const pos = new THREE.Vector3(
      center.x + range(rng, -10, 10), 0, center.z + range(rng, -10, 10));
    scene.add(mesh);
    gang.push(new GangMember(mesh, pos));
  }
  return gang;
}

// A simple pickup item: floating golden package.
export function makePickup(scene, pos) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x7a5a00 }));
  box.castShadow = true;
  g.add(box);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22 }));
  g.add(glow);
  g.position.copy(pos);
  g.position.y = 1.2;
  g.userData.spin = 0;
  scene.add(g);
  return g;
}
