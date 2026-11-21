// Neon Bay city: street grid, lit-window towers, beach + sea, palms, streetlights,
// neon-arch plaza, sidewalks and street props. All geometry is procedural; window
// textures are painted on canvases at runtime — no image files, no network.
import * as THREE from 'three';
import { range, intRange, pick } from './rng.js';

export const CITY = {
  half: 220,            // city extends -220..220 on x and z
  roadSpacing: 44,
  roadWidth: 10,
  beachZ: 196,          // sand starts here
  seaZ: 214,            // water starts here
};

export const ROADS = [];
for (let v = -176; v <= 176; v += 44) { ROADS.push(v); }

export function isOnRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < CITY.roadWidth / 2 + 1.2) return true;
    if (Math.abs(z - r) < CITY.roadWidth / 2 + 1.2) return true;
  }
  return false;
}

// Snap a point to the nearest road centre line (used by traffic + spawns).
export function nearestRoadPoint(x, z) {
  let bx = ROADS[0], bz = ROADS[0];
  for (const r of ROADS) { if (Math.abs(x - r) < Math.abs(x - bx)) bx = r; if (Math.abs(z - r) < Math.abs(z - bz)) bz = r; }
  return Math.abs(x - bx) < Math.abs(z - bz) ? { x: bx, z } : { x, z: bz };
}

function windowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const lit = ['#ffd27a', '#ffe9a8', '#9be8ff', '#ffb46b', '#fff3c4'];
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      if (rng() < litRatio) { g.fillStyle = pick(rng, lit); g.globalAlpha = 0.75 + rng() * 0.25; }
      else { g.fillStyle = '#101018'; g.globalAlpha = 0.9; }
      g.fillRect(x, y, 10, 11);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1b0f3d');
  grad.addColorStop(0.42, '#5b2160');
  grad.addColorStop(0.62, '#c94b6d');
  grad.addColorStop(0.74, '#ff8a4c');
  grad.addColorStop(0.82, '#ffc46b');
  grad.addColorStop(1, '#2c1445');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm(rng) {
  const palm = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 6.5, 6), trunkMat);
  trunk.position.y = 3.25;
  trunk.rotation.z = range(rng, -0.08, 0.08);
  trunk.castShadow = true;
  palm.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2fae5f, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.4), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 6.6, Math.sin(a) * 1.1);
    leaf.rotation.set(Math.sin(a) * 1.1, a, -Math.cos(a) * 1.1);
    leaf.castShadow = true;
    palm.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
  nut.position.y = 6.4;
  palm.add(nut);
  return palm;
}

export function buildCity(scene, rng) {
  const out = { palms: [], lamps: [], buildings: 0, boxes: [], marinaPoint: new THREE.Vector3(150, 0, 200) };

  // Sunset sky dome + fog.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog(0x3a1c52, 180, 700);

  // Ground: asphalt-grey city slab.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x35353f }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Beach sand + sea.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 60),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.06, CITY.beachZ + 26);
  sand.receiveShadow = true;
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 140),
    new THREE.MeshLambertMaterial({ color: 0x14586e, transparent: true, opacity: 0.92 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.12, CITY.seaZ + 66);
  scene.add(sea);
  // Sun glitter strip on the water.
  const glitter = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 120),
    new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.35 }));
  glitter.rotation.x = -Math.PI / 2;
  glitter.position.set(-40, 0.18, CITY.seaZ + 60);
  scene.add(glitter);

  // Roads: dark strips + centre dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x262633 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  const roadLen = 460;
  for (const r of ROADS) {
    for (const horizontal of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CITY.roadWidth), roadMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(horizontal ? 0 : r, 0.05, horizontal ? r : 0);
      if (!horizontal) strip.rotation.z = Math.PI / 2;
      strip.receiveShadow = true;
      scene.add(strip);
      for (let d = -220; d <= 220; d += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (horizontal) { dash.position.set(d, 0.07, r); }
        else { dash.position.set(r, 0.07, d); dash.rotation.z = Math.PI / 2; }
        scene.add(dash);
      }
    }
  }

  // Sidewalk slabs along every road edge.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x4a4a58 });
  for (const r of ROADS) {
    for (const off of [-CITY.roadWidth / 2 - 2.5, CITY.roadWidth / 2 + 2.5]) {
      const s1 = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 5), walkMat);
      s1.rotation.x = -Math.PI / 2; s1.position.set(0, 0.04, r + off); s1.receiveShadow = true; scene.add(s1);
      const s2 = new THREE.Mesh(new THREE.PlaneGeometry(5, roadLen), walkMat);
      s2.rotation.x = -Math.PI / 2; s2.position.set(r + off, 0.04, 0); s2.receiveShadow = true; scene.add(s2);
    }
  }

  // Buildings: one per block cell, varied heights, lit windows, neon roof trim.
  const facades = [
    windowTexture(rng, '#232338', 0.42),
    windowTexture(rng, '#2e2a3e', 0.5),
    windowTexture(rng, '#1d2a3a', 0.38),
    windowTexture(rng, '#33222e', 0.46),
  ];
  const trimColors = [0xff5da2, 0x37e6ff, 0xffb347, 0x8affc1, 0xc77dff];
  const blockCenters = [];
  for (let gx = -176; gx <= 176; gx += 44) {
    for (let gz = -176; gz <= 176; gz += 44) {
      const cx = gx + 22, cz = gz + 22;
      if (Math.abs(cx) < 30 && Math.abs(cz) < 30) continue; // plaza
      if (cz > 176) continue; // beach row
      blockCenters.push({ x: cx, z: cz });
    }
  }
  for (const b of blockCenters) {
    const w = range(rng, 13, 24), d = range(rng, 13, 24);
    const h = intRange(rng, 12, 62) * (rng() < 0.18 ? 1.6 : 1);
    const tex = pick(rng, facades);
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 });
    const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    bld.position.set(b.x + range(rng, -2, 2), h / 2, b.z + range(rng, -2, 2));
    bld.castShadow = true; bld.receiveShadow = true;
    scene.add(bld);
    out.boxes.push({ x: bld.position.x, z: bld.position.z, hw: w / 2 + 0.6, hd: d / 2 + 0.6 });
    // Neon roof trim.
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.5, d + 0.3),
      new THREE.MeshBasicMaterial({ color: pick(rng, trimColors) }));
    trim.position.set(bld.position.x, h + 0.2, bld.position.z);
    scene.add(trim);
    // Rooftop box on tall towers.
    if (h > 40) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4),
        new THREE.MeshLambertMaterial({ color: 0x3a3a48 }));
      roof.position.set(bld.position.x + 3, h + 1.6, bld.position.z - 2);
      scene.add(roof);
    }
    out.buildings++;
  }

  // Neon-arch plaza at the centre.
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(26, 32),
    new THREE.MeshLambertMaterial({ color: 0x5a4a72 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.08, 0); plaza.receiveShadow = true;
  scene.add(plaza);
  const archMat = new THREE.MeshBasicMaterial({ color: 0xff5da2 });
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 12, 8), archMat);
    pillar.position.set(sx * 9, 6, 0);
    scene.add(pillar);
  }
  const archTop = new THREE.Mesh(new THREE.TorusGeometry(9, 0.7, 8, 24, Math.PI), archMat);
  archTop.position.set(0, 12, 0);
  scene.add(archTop);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(16, 2.2, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x37e6ff }));
  sign.position.set(0, 14.5, 0);
  scene.add(sign);

  // Palm trees: beach row + scattered along roads.
  const palmSpots = [];
  for (let x = -200; x <= 200; x += 18) palmSpots.push({ x, z: CITY.beachZ + 8 + range(rng, 0, 10) });
  for (let i = 0; i < 26; i++) {
    const r = pick(rng, ROADS);
    palmSpots.push({ x: r + (rng() < 0.5 ? -9 : 9), z: range(rng, -180, 180) });
    palmSpots.push({ x: range(rng, -180, 180), z: r + (rng() < 0.5 ? -9 : 9) });
  }
  for (const p of palmSpots) {
    if (Math.abs(p.x) < 28 && Math.abs(p.z) < 28) continue;
    const palm = makePalm(rng);
    palm.position.set(p.x, 0, p.z);
    scene.add(palm);
    out.palms.push(palm);
  }

  // Streetlights along roads, warm pools of light (emissive bulbs only).
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22222c });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (const r of ROADS) {
    for (let d = -198; d <= 198; d += 44) {
      for (const [lx, lz] of [[r + 7, d], [d, r + 7]]) {
        if (Math.abs(lx) < 28 && Math.abs(lz) < 28) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
        pole.position.set(lx, 3.5, lz); pole.castShadow = true;
        scene.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), poleMat);
        arm.position.set(lx - 0.8, 6.9, lz);
        scene.add(arm);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bulbMat);
        bulb.position.set(lx - 1.6, 6.8, lz);
        scene.add(bulb);
        out.lamps.push(bulb);
      }
    }
  }

  // Props: benches, hydrants, signs near the plaza and beach walk.
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a4a2b });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 1), benchMat);
    seat.position.y = 0.6; seat.castShadow = true; bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.2), benchMat);
    back.position.set(0, 1.1, -0.45); bench.add(back);
    bench.position.set(Math.cos(a) * 21, 0, Math.sin(a) * 21);
    bench.rotation.y = -a + Math.PI / 2;
    scene.add(bench);
  }
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xd43d2a });
  for (const [hx, hz] of [[30, 30], [-34, 22], [24, -40], [-20, -30], [120, 130]]) {
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.1, 8), hydMat);
    hyd.position.set(hx, 0.55, hz); hyd.castShadow = true;
    scene.add(hyd);
  }

  // Marina Point marker base (mission 1 destination) — a pier + glowing ring.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.8, 26),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
  pier.position.set(150, 0.4, 208); pier.castShadow = true; pier.receiveShadow = true;
  scene.add(pier);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(150, 1.1, 200);
  scene.add(ring);
  out.marinaRing = ring;

  // Sunset sun + hemisphere light.
  const sun = new THREE.DirectionalLight(0xff9a4d, 2.6);
  sun.position.set(-180, 110, 240);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -240; sun.shadow.camera.right = 240;
  sun.shadow.camera.top = 240; sun.shadow.camera.bottom = -240;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8a5aa8, 0x2a1a2e, 1.15));
  out.sun = sun;
  return out;
}
