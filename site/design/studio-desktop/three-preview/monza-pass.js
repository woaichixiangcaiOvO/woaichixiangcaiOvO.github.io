import {
  CanvasTexture, CatmullRomCurve3, Color, DirectionalLight, Group, HemisphereLight, MathUtils,
  Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera, Plane, PlaneGeometry, Ray, Scene, Vector3,
  WebGLRenderTarget,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const plateWidth = 960;
const plateHeight = 519;
const passDuration = 5700;
const firstPassDelay = 2550;
const chaseDelay = 850;
const threeCarInterval = 4;
const modelUrl = new URL('../../../models/track_car/sf26/v0.2/SF-26_Preview.glb', import.meta.url);
let carsRequest;

function trackCar(scene) {
  const spinning = [];
  const steering = [];
  scene.traverse(node => {
    const name = node.userData.name ?? '';
    if (name.endsWith(' · wheel spin')) spinning.push(node);
    if (name.startsWith('Front ') && name.endsWith(' · steering pivot')) steering.push(node);
  });
  if (spinning.length !== 4 || steering.length !== 2) throw new Error('赛车模型缺少车轮轴心。');
  return { scene, spinning, steering };
}

function repaintedCar(leadScene, { bodyColor, accentColor, paintWings = false }) {
  const scene = leadScene.clone();
  const body = new MeshPhysicalMaterial({
    color: bodyColor, roughness: .34, metalness: .12, clearcoat: .42, clearcoatRoughness: .27,
  });
  const accent = body.clone();
  accent.color.set(accentColor);
  const bodyPanels = new Set([
    'SF-26 · Red and white cockpit surround', 'SF-26 · White engine cover and red tail',
  ]);
  const wings = new Set([
    'Front wing · first flap L', 'Front wing · first flap R', 'Front wing · main plane',
    'Rear wing · main plane', 'Rear wing · second element',
  ]);
  scene.traverse(node => {
    if (!node.isMesh) return;
    const paint = node.material.name;
    if (bodyPanels.has(paint)) node.material = body;
    else if (paint === 'SF-26 · Rosso bodywork' || (paintWings && wings.has(node.userData.name))) node.material = accent;
  });
  return scene;
}

export function loadMonzaCars() {
  carsRequest ??= new GLTFLoader().loadAsync(modelUrl.href).then(({ scene }) => {
    const blueWhite = repaintedCar(scene, { bodyColor: 0x2463df, accentColor: 0xf7f8ff, paintWings: true });
    const papaya = repaintedCar(scene, { bodyColor: 0xff851a, accentColor: 0x37383c });
    return [scene, blueWhite, papaya].map(trackCar);
  }).catch(error => {
    carsRequest = undefined;
    throw error;
  });
  return carsRequest;
}

function contactShadow() {
  const image = document.createElement('canvas');
  image.width = image.height = 64;
  const context = image.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 10, 32, 32, 32);
  gradient.addColorStop(0, '#0008');
  gradient.addColorStop(.54, '#0006');
  gradient.addColorStop(1, '#0000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const mesh = new Mesh(new PlaneGeometry(6.1, 3.15), new MeshBasicMaterial({
    map: new CanvasTexture(image), transparent: true, depthWrite: false, toneMapped: false,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(.12, .012, .12);
  return mesh;
}

function racingLine(camera) {
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const ray = new Ray(camera.position.clone());
  // Plate pixels, following the far lane into the left-hand bend and back along the near lane.
  const platePoints = [
    [1066, 266], [960, 242], [866, 229], [752, 211], [645, 200], [537, 193],
    [424, 191], [314, 191], [238, 193], [181, 198], [151, 210], [158, 225],
    [200, 239], [282, 259], [392, 278], [520, 294], [663, 308], [797, 317], [934, 323], [1056, 327],
  ];
  const points = platePoints.map(([x, y]) => {
    ray.direction.set(2 * x / plateWidth - 1, 1 - 2 * y / plateHeight, .5)
      .unproject(camera).sub(ray.origin).normalize();
    return ray.intersectPlane(ground, new Vector3());
  });
  return new CatmullRomCurve3(points);
}

function foregroundMask() {
  const canvas = document.createElement('canvas');
  canvas.width = plateWidth;
  canvas.height = plateHeight;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, plateWidth, plateHeight);
  // The right canopy overlaps the exit lane. Cut it out of the car layer in the same plate coordinates.
  const canopy = [
    [838, 359], [847, 343], [850, 332], [855, 326], [860, 327], [865, 318],
    [871, 314], [875, 308], [882, 307], [886, 313], [892, 304], [898, 308],
    [903, 305], [908, 309], [913, 303], [918, 309], [920, 315], [928, 319],
    [936, 312], [941, 315], [947, 307], [953, 304], [960, 302],
    [960, plateHeight], [838, plateHeight],
  ];
  context.beginPath();
  context.moveTo(...canopy[0]);
  for (const [x, y] of canopy.slice(1)) context.lineTo(x, y);
  context.closePath();
  context.fillStyle = '#000';
  context.fill();
  return new CanvasTexture(canvas);
}

export function createMonzaPass(windowGeometry, audio, firstGroupHasThree = false) {
  const target = new WebGLRenderTarget(plateWidth, plateHeight, { samples: 4 });
  const screen = new Mesh(windowGeometry, new MeshBasicMaterial({
    map: target.texture, alphaMap: foregroundMask(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  screen.visible = false;

  const world = new Scene();
  const camera = new PerspectiveCamera(26, plateWidth / plateHeight, .1, 180);
  camera.position.set(0, 19, 52);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const sun = new DirectionalLight(0xffd1a0, 2.8);
  sun.position.set(-18, 13, 9);
  const fill = new HemisphereLight(0xffefe0, 0x61534a, 2.1);
  world.add(sun, fill);
  const shadow = contactShadow();
  const vehicles = [0, chaseDelay, 2 * chaseDelay].map(delay => {
    const group = new Group();
    group.add(shadow.clone());
    world.add(group);
    return { group, delay, car: undefined };
  });
  const path = racingLine(camera);
  const pathLength = path.getLength();
  const heading = new Vector3();
  const nextHeading = new Vector3();
  const screenPosition = new Vector3();
  const clearColor = new Color();
  let elapsed = -firstPassDelay;
  let nextPass = 15000;
  let groupNumber = 1;
  let groupSize = 2;
  let dirty = false;
  let quietPass = false;

  function reset(cars) {
    if (cars) {
      vehicles.forEach((vehicle, index) => {
        const car = cars[index];
        if (vehicle.car === car) return;
        vehicle.car?.scene.removeFromParent();
        vehicle.group.add(car.scene);
        vehicle.car = car;
      });
    }
    elapsed = -firstPassDelay;
    nextPass = MathUtils.randInt(10000, 20000);
    groupNumber = 1;
    groupSize = firstGroupHasThree ? 3 : 2;
    quietPass = false;
    audio.silence();
    screen.visible = false;
    dirty = false;
  }

  function pauseAudio() {
    audio.silence();
    if (elapsed >= 0 && elapsed < passDuration + chaseDelay * (groupSize - 1)) quietPass = true;
  }

  function drive({ group, delay, car }, index) {
    const progress = (elapsed - delay) / passDuration;
    const wasVisible = group.visible;
    group.visible = index < groupSize && progress >= 0 && progress < 1;
    if (!group.visible) {
      if (wasVisible) audio.moveCar(index, 0, 0, groupSize);
      return false;
    }
    // A little more speed on approach and exit, leaving the apex readable.
    const distance = progress + .064 * Math.sin(2 * Math.PI * progress);
    path.getPointAt(distance, group.position);
    path.getTangentAt(distance, heading);
    path.getTangentAt(Math.min(distance + .035, 1), nextHeading);
    group.rotation.y = Math.atan2(heading.z, -heading.x);
    const crossY = heading.z * nextHeading.x - heading.x * nextHeading.z;
    const turn = Math.atan2(crossY, heading.dot(nextHeading));
    for (const wheel of car.steering) wheel.rotation.y = MathUtils.clamp(turn * 1.5, -.21, .21);
    for (const wheel of car.spinning) wheel.rotation.z = distance * pathLength / .351;
    if (!quietPass) {
      const screenX = screenPosition.copy(group.position).project(camera).x;
      audio.moveCar(index, progress, screenX, groupSize);
    }
    return true;
  }

  function advance(deltaMs) {
    elapsed += deltaMs;
    if (elapsed >= nextPass) {
      elapsed -= nextPass;
      nextPass = MathUtils.randInt(10000, 20000);
      groupNumber++;
      groupSize = groupNumber % threeCarInterval === 0 ? 3 : 2;
      quietPass = false;
    }
    const wasVisible = screen.visible;
    let driving = false;
    for (const [index, vehicle] of vehicles.entries()) {
      if (drive(vehicle, index)) driving = true;
    }
    screen.visible = driving;
    dirty = driving;
    return driving || wasVisible;
  }

  function render(renderer) {
    if (!screen.visible || !dirty) return;
    const previousTarget = renderer.getRenderTarget();
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0, 0);
    renderer.render(world, camera);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clearColor, clearAlpha);
    dirty = false;
  }

  return { screen, reset, advance, render, pauseAudio };
}
