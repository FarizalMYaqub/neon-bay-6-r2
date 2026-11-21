// Missions + story: three jobs from Mara, with dialogue, objective beacons,
// a minimap marker and saved progress. Completing all three ends the story.
import * as THREE from 'three';

export const MISSION_DEFS = [
  {
    id: 1, title: 'MISSION 1 — FIRST JOB',
    objective: 'Drive to the meet point at Marina Point (gold marker).',
    mara: 'Rook. You are out, I am in. First job is easy: get to Marina Point and meet my man. Wheels help — steal something nice.',
    target: new THREE.Vector3(150, 0, 200),
    reward: 500,
  },
  {
    id: 2, title: 'MISSION 2 — THE PICKUP',
    objective: 'Grab the package at the plaza, then deal with the rival crew.',
    mara: 'Package is waiting at the plaza. Word is the Vipers want it too. Take it, and take care of them — fists or pistol, your call.',
    target: new THREE.Vector3(0, 0, 0),
    reward: 900,
  },
  {
    id: 3, title: 'MISSION 3 — GETAWAY',
    objective: 'Lose the 3-star heat. Stay out of sight until the stars clear.',
    mara: 'Cops are all over you, Rook. Lose them — duck down side streets, lay low — and when the heat dies, you are free. Finish this and the night is ours.',
    target: null,
    reward: 1500,
  },
];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    this.index = 0; // 0-based; 3 means all done
    this.stage = 'idle'; // idle | active | pickup | fight | escape | done
    this.beacon = null;
    this.pickupMesh = null;
    this.gang = [];
    this.onEvent = null; // (type, data) — game wires sound, cash, HUD
    this._beaconT = 0;
  }

  get current() { return MISSION_DEFS[this.index] || null; }
  get done() { return this.index >= MISSION_DEFS.length; }

  start(index) {
    this.index = index;
    this.stage = 'active';
    this._clearBeacon();
    const def = this.current;
    if (!def) return;
    if (def.target) this._makeBeacon(def.target);
    this._say(def.mara);
    if (this.onEvent) this.onEvent('mission-start', def);
  }

  _say(line) { if (this.onEvent) this.onEvent('dialogue', { who: 'MARA', line }); }

  _makeBeacon(pos) {
    this._clearBeacon();
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 30;
    g.add(beam);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    marker.position.y = 5; marker.rotation.x = Math.PI;
    g.add(marker);
    g.userData.marker = marker;
    g.position.set(pos.x, 0, pos.z);
    this.scene.add(g);
    this.beacon = g;
  }

  _clearBeacon() {
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
  }

  setPickupMesh(mesh) { this.pickupMesh = mesh; }

  setGang(gang) { this.gang = gang; }

  // Called every frame by the game loop. Returns nothing; fires events.
  update(dt, playerPos, wanted) {
    if (this.beacon) {
      this._beaconT += dt;
      this.beacon.userData.marker.position.y = 5 + Math.sin(this._beaconT * 2.4) * 0.7;
      this.beacon.userData.marker.rotation.y += dt * 1.5;
    }
    if (this.pickupMesh) {
      this.pickupMesh.userData.spin += dt;
      this.pickupMesh.rotation.y = this.pickupMesh.userData.spin;
      this.pickupMesh.position.y = 1.2 + Math.sin(this.pickupMesh.userData.spin * 2) * 0.15;
    }
    const def = this.current;
    if (!def || this.stage === 'done') return;
    if (this.index === 0 && this.stage === 'active') {
      if (Math.hypot(playerPos.x - def.target.x, playerPos.z - def.target.z) < 6) {
        this._complete('Nice. My man says you drive like you mean it. Next job is waiting.');
      }
    } else if (this.index === 1) {
      if (this.stage === 'active' && this.pickupMesh) {
        if (Math.hypot(playerPos.x - this.pickupMesh.position.x, playerPos.z - this.pickupMesh.position.z) < 2.6) {
          this.scene.remove(this.pickupMesh); this.pickupMesh = null;
          this.stage = 'fight';
          this._say('Package secured — but here come the Vipers! Three of them. Put them down.');
          if (this.onEvent) this.onEvent('gang-spawn', def);
        }
      } else if (this.stage === 'fight') {
        if (this.gang.length && this.gang.every((g) => !g.alive)) {
          this._complete('Clean work. The Vipers will think twice now. One last job, Rook — the big one.');
        }
      }
    } else if (this.index === 2 && this.stage === 'active') {
      if (wanted === 0) this._complete('Heat is gone. You did it, Rook — Neon Bay is ours tonight.');
    }
  }

  _complete(line) {
    const def = this.current;
    this._clearBeacon();
    this.stage = 'done';
    if (this.onEvent) this.onEvent('mission-complete', { def, line });
    this.index++;
    if (this.done) {
      if (this.onEvent) this.onEvent('story-complete', {});
    } else {
      this.stage = 'idle';
    }
  }

  // Begin the next mission after a short beat (game calls this after the banner).
  beginNext() {
    if (!this.done) this.start(this.index);
  }
}
