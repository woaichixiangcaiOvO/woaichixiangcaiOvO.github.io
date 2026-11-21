import { Float32BufferAttribute, Group, MathUtils, Matrix3, Vector3 } from 'three';

const bookRows = [
  { label: '3.39', indices: [0, 2, 4], delay: 0, phase: 0, height: .031, amplitude: .017 },
  { label: '2.71', indices: [0, 3, 6], delay: .24, phase: .78, height: .030, amplitude: .015 },
  { label: '0.3', indices: [0, 3], delay: .42, phase: 1.3, height: .024, amplitude: .012 },
];
const consoleProps = [
  { parts: /^(?:Experiment_Analog_Receiver$|Receiver_)/, delay: .48, phase: 2.4, height: .025, amplitude: .011 },
  { parts: /^Experiment_Lantern_Layer(?:\.\d+)?$/, delay: .28, phase: .4, height: .019, amplitude: .009 },
  { parts: /^Storage_/, delay: .66, phase: 3.3, height: .020, amplitude: .009 },
];
const plantSettleTime = 1.42;
const bookSpine = /^Book_Spine_(?:Band|Title)/;
const plantBranches = /^Plant_(?:Upper|Trailing)_(?:Stem|Leaf)|^Plant_Petiole/;

function bindLift(meshes, { delay, phase, height, amplitude }) {
  const parts = meshes.map(mesh => {
    mesh.castShadow = false;
    return { mesh, y: mesh.position.y };
  });
  return { parts, lift: 0, start: 0, delay, phase, height, amplitude };
}

function bindBooks(assets) {
  const spineDetails = [...assets.entries()].filter(([name]) => bookSpine.test(name)).map(([, mesh]) => mesh);
  return bookRows.flatMap(row => row.indices.map((index, i) => {
    const book = assets.get(`Book_${row.label}_${index}`);
    const spine = spineDetails.filter(mesh => Math.abs(mesh.position.z - book.position.z) < .035 &&
      Math.abs(mesh.position.y - book.position.y) < .28);
    return bindLift([book, ...spine], { ...row, delay: row.delay + .34 * i, phase: row.phase + 1.57 * i });
  }));
}

function bindConsole(assets) {
  return consoleProps.map(definition => {
    const meshes = [...assets.entries()].filter(([name]) => definition.parts.test(name)).map(([, mesh]) => mesh);
    return bindLift(meshes, definition);
  });
}

function bindCollectible(exhibit) {
  const car = new Group();
  car.name = 'Shelf_Collectible_Car';
  car.position.y = .15;
  const pieces = exhibit.children.filter(part =>
    /^Collectible_/.test(part.userData.name ?? part.name) && (part.userData.name ?? part.name) !== 'Collectible_Platform');
  exhibit.add(car);
  for (const piece of pieces) {
    car.attach(piece);
    piece.traverse(object => { if (object.isMesh) object.castShadow = false; });
  }
  return car;
}

function bindPlant(assets) {
  const soil = assets.get('Plant_Soil').getWorldPosition(new Vector3());
  const worldPoint = new Vector3();
  const delta = new Vector3();
  const meshes = [];
  for (const [name, mesh] of assets) {
    if (!mesh.isMesh || !plantBranches.test(name)) continue;
    const geometry = mesh.geometry.clone();
    const positions = geometry.getAttribute('position');
    const localFromWorld = new Matrix3().setFromMatrix4(mesh.matrixWorld).invert();
    const wave = new Float32Array(positions.count * 3);
    const crossWave = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      worldPoint.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).sub(soil);
      // Sample one continuous bend for all the leaves and stems so their junctions stay connected.
      const bend = .064 * MathUtils.smoothstep(worldPoint.length(), .09, .87);
      const phase = .85 * worldPoint.z - .7 * worldPoint.y;
      const sin = Math.sin(phase);
      const cos = Math.cos(phase);
      delta.set(bend * cos, .12 * bend * sin, .46 * bend * sin).applyMatrix3(localFromWorld).toArray(wave, 3 * i);
      delta.set(bend * sin, -.12 * bend * cos, -.46 * bend * cos).applyMatrix3(localFromWorld).toArray(crossWave, 3 * i);
    }
    geometry.morphAttributes.position = [
      new Float32BufferAttribute(wave, 3), new Float32BufferAttribute(crossWave, 3),
    ];
    geometry.morphTargetsRelative = true;
    mesh.geometry = geometry;
    mesh.updateMorphTargets();
    mesh.castShadow = false;
    meshes.push(mesh);
  }
  return meshes;
}

export function createShelfMotion(room) {
  room.updateWorldMatrix(true, true);
  // glTF node names retain their punctuation in userData even when Three.js sanitizes them.
  const assets = new Map();
  room.traverse(object => assets.set(object.userData.name ?? object.name, object));
  const lifts = [...bindBooks(assets), ...bindConsole(assets)];
  const car = bindCollectible(assets.get('Decor_OpenWheel_Collectible'));
  const carHomeY = car.position.y;
  const plant = bindPlant(assets);
  let orbit = false;
  let elapsed = plantSettleTime;
  let time = 0;
  let startCarLift = 0;
  let startCarPitch = 0;
  let plantAmount = 0;
  let startPlantAmount = 0;

  function placePlant(amount) {
    plantAmount = amount;
    const phase = time * Math.PI * 2 / 6.8;
    const wave = amount * Math.sin(phase);
    const crossWave = amount * Math.cos(phase);
    for (const { morphTargetInfluences } of plant) {
      morphTargetInfluences[0] = wave;
      morphTargetInfluences[1] = crossWave;
    }
  }

  function placeLift(item, lift) {
    item.lift = lift;
    for (const { mesh, y } of item.parts) mesh.position.y = y + lift;
  }

  function setMode(mode, animated) {
    const nextOrbit = mode === 'orbit';
    if (animated && nextOrbit === orbit) return;
    orbit = nextOrbit;
    elapsed = 0;
    if (!animated) {
      for (const item of lifts) placeLift(item, 0);
      car.position.y = carHomeY;
      car.rotation.x = 0;
      placePlant(0);
    }
    for (const item of lifts) item.start = item.lift;
    startCarLift = car.position.y - carHomeY;
    startCarPitch = car.rotation.x;
    startPlantAmount = plantAmount;
    if (!orbit && !animated) elapsed = plantSettleTime;
  }

  function advance(deltaMs) {
    if (!orbit && elapsed >= plantSettleTime) return false;
    const dt = deltaMs / 1000;
    elapsed += dt;
    time += dt;
    for (const item of lifts) {
      const amount = MathUtils.smoothstep(elapsed - (orbit ? item.delay : 0), 0, orbit ? 1.28 : .84 + .12 * item.delay);
      const lift = orbit ? item.height + item.amplitude * Math.sin(time * 1.05 + item.phase) : 0;
      placeLift(item, MathUtils.lerp(item.start, lift, amount));
    }
    const carAmount = MathUtils.smoothstep(elapsed - (orbit ? .26 : 0), 0, orbit ? 1.33 : 1.02);
    const carPhase = time * 1.28 + .46;
    const carLift = orbit ? .032 + .014 * Math.sin(carPhase) : 0;
    const carPitch = orbit ? .017 * Math.sin(carPhase + .64) : 0;
    car.position.y = carHomeY + MathUtils.lerp(startCarLift, carLift, carAmount);
    car.rotation.x = MathUtils.lerp(startCarPitch, carPitch, carAmount);
    placePlant(MathUtils.lerp(startPlantAmount, Number(orbit),
      MathUtils.smoothstep(elapsed, 0, orbit ? 1.8 : plantSettleTime)));
    return true;
  }

  return { setMode, advance };
}
