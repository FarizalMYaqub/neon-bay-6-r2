# neon-bay-6-r2

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/FarizalMYaqub/neon-bay-6-r2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/FarizalMYaqub/neon-bay-6-r2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Bay** is an original open-world crime game built with Three.js, in the spirit of GTA 6 — no Rockstar names, places, characters, or assets. You are **Rook**, a driver fresh out of the Marina lockup, working three jobs for **Mara** across a sun-soaked sunset city.

## What is in the game

- **A city to explore** — a street grid of lit-window towers, a beach and sea, palm trees, streetlights, a neon-arch plaza, benches and hydrants, all under a sunset sky.
- **On foot and by car** — walk, run and jump with WASD + mouse, then steal one of the parked cars with **E** and drive it with arcade physics and a chase camera.
- **Living streets** — AI traffic following the road network and pedestrians strolling the sidewalks who scatter when threatened.
- **Wanted level 0–5 stars** — stealing cars, hitting pedestrians, shooting, and speeding past police raise the heat; police cruisers with flashing light bars chase and ram you until you lay low.
- **Three missions with a story** — *First Job* (drive to Marina Point), *The Pickup* (grab the package, fight the rival Vipers), and *Getaway* (lose a 3-star wanted level).
- **Combat** — punch with **F**, pistol with mouse click (raycast, tracer, ammo, **R** to reload), enemies with health bars.
- **HUD** — health, cash, wanted stars, in-game clock, objective tracker, speed, and a live 2D minimap with roads, traffic, police, and the mission marker.
- **Start screen, pause (P / Esc), and save/load** via localStorage (cash, mission progress, position).
- **Synthesized sound only** — engine hum, sirens, gunshots, pickup chimes, and a synthwave music loop, all generated with WebAudio. No audio files, no network: every file the game loads lives under `game/`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Keyboard + mouse.

Deterministic screenshots: `?shot=start&seed=7`, `?shot=drive&seed=7`, `?shot=chase&seed=7`, `?shot=mission&seed=7`.

## Layout

- `game/index.html` — page shell, import map, HUD, overlays
- `game/src/game.js` — main loop, player, driving, wanted, combat, camera, save/load
- `game/src/city.js` — procedural city, beach, plaza, lighting
- `game/src/vehicles.js` — stealable cars, traffic AI, police AI
- `game/src/people.js` — pedestrians, gang members, pickups
- `game/src/missions.js` — the three jobs from Mara
- `game/src/hud.js` — DOM HUD + live minimap
- `game/src/audio.js` — synthesized WebAudio sound and music
- `game/src/input.js` — keyboard + mouse
- `game/src/rng.js` — seeded random
- `game/src/shots.js` — deterministic screenshot setups
- `main.ts` — entrypoint: copies `game/` + `screenshots/` to the output dir and writes `dossier.json`

<sub>Entered on [make.fun](https://make.fun/?ref=qk9k9vgs&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
