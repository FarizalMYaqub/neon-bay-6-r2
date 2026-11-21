// Deterministic screenshot setups: ?shot=<name>&seed=7 puts the game into a
// fixed, readable scene so the four screenshots show the city, driving, a
// police chase and a mission. Seeded RNG keeps every run identical.
export function applyShot(game, name) {
  if (!name) return false;
  const g = game;
  if (name === 'start') {
    // Title screen over the city: player on foot at the plaza, camera wide.
    g.startGame({ keepOverlay: true });
    document.getElementById('startOverlay').style.background =
      'linear-gradient(180deg, rgba(26,8,52,.42), rgba(8,4,24,.55))';
    g.player.pos.set(14, 0, 18);
    g.player.heading = Math.PI * 0.75;
    g.camYaw = Math.PI * 0.75 + Math.PI;
    g.camPitch = 0.32;
    g.camDistance = 26;
    g.hud.setObjective('NEON BAY', 'An open-world crime story. Steal a car, run jobs for Mara, outrun the law.');
    return true;
  }
  if (name === 'drive') {
    g.startGame({ keepOverlay: false });
    // Player driving a stolen car down a main road with traffic around.
    const car = g.parkedCars[0];
    g.enterCar(car);
    g.setWanted(0, true);
    car.pos.set(-88, 0, -44);
    car.heading = Math.PI / 2;
    car.speed = 16;
    g.camYaw = Math.PI / 2 + Math.PI;
    g.camPitch = 0.22;
    g.hud.setHint('Cruising Neon Bay at sunset — traffic, palms and neon.');
    g.hud.setObjective('FREE ROAM', 'Cruising Neon Bay — traffic, palms and neon as the sun goes down.');
    return true;
  }
  if (name === 'chase') {
    g.startGame({ keepOverlay: false });
    const car = g.parkedCars[1] || g.parkedCars[0];
    g.enterCar(car);
    car.pos.set(0, 0, 44);
    car.heading = Math.PI / 2;
    car.speed = 20;
    g.setWanted(3, true);
    g.spawnPoliceNear(3, 26);
    g.driveCamDistance = 21;
    g.camYaw = Math.PI / 2 + Math.PI;
    g.camPitch = 0.3;
    g.hud.setHint('Lose the police — duck down side streets and lay low!');
    g.hud.setObjective('WANTED ★★★', 'The Neon Bay police are on your tail — lose them!');
    return true;
  }
  if (name === 'mission') {
    g.startGame({ keepOverlay: false });
    g.missions.start(0);
    g.player.pos.set(120, 0, 176);
    g.player.heading = Math.atan2(150 - 120, 200 - 176);
    g.camYaw = g.player.heading + Math.PI;
    g.camPitch = 0.3;
    g.camDistance = 18;
    return true;
  }
  return false;
}
