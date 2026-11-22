import {
  Box3, BoxGeometry, CanvasTexture, CylinderGeometry, Group, MathUtils, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader, Vector3,
} from 'three';
import { createOrbitStation } from './orbit-station.js';
import { createMonzaPass, loadMonzaCars } from './monza-pass.js';

const windowScenes = {
  orbit: { color: 0x9fb9f5, intensity: .85 },
  monza: { color: 0xffc697, intensity: 1.1 },
};
const sceneryLoader = new TextureLoader();

async function sceneryTexture(filename) {
  const url = new URL(`./${filename}`, import.meta.url);
  const texture = await sceneryLoader.loadAsync(url.href);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export async function loadScenery(id) {
  const orbit = id === 'orbit';
  const results = await Promise.allSettled([
    sceneryTexture(orbit ? 'window-orbit-sky.webp' : 'window-monza-clean.webp'),
    orbit ? sceneryTexture('window-orbit-body.webp') : loadMonzaCars(),
  ]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    results.forEach(result => result.value?.dispose?.());
    throw failure.reason;
  }
  const [background, subject] = results.map(result => result.value);
  return orbit ? { background, station: subject } : { background, cars: subject };
}

function shadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#d1c7b6';
  context.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 5) {
    const fold = context.createLinearGradient(0, y, 0, y + 5);
    fold.addColorStop(0, '#887b6e');
    fold.addColorStop(.38, '#c8bfaf');
    fold.addColorStop(1, '#dbd2be');
    context.fillStyle = fold;
    context.fillRect(0, y, 256, 5);
  }
  context.fillStyle = '#42322114';
  for (let x = 0; x < 256; x += 2) context.fillRect(x, 0, 1, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createWindowView(room, light, audio, firstGroupHasThree) {
  const windowAnchor = room.getObjectByName('Anchor_Window_View').getWorldPosition(new Vector3());
  const bottom = new Box3().setFromObject(room.getObjectByName('Window_Frame_199'));
  const topSlat = new Box3().setFromObject(room.getObjectByName('Window_Blind_Slat_0'));
  const cord = room.getObjectByName('Window_Blind_Cord001');
  const cordBounds = new Box3().setFromObject(cord);
  const curtainTop = topSlat.max.y;
  const curtainLength = curtainTop - bottom.max.y;
  const curtainWidth = bottom.max.x - bottom.min.x - .025;
  const curtainZ = topSlat.getCenter(new Vector3()).z - .026;
  const sceneryWidth = curtainWidth + .15;
  const sceneryHeight = 2.34;
  const backing = new Mesh(new PlaneGeometry(sceneryWidth, sceneryHeight),
    new MeshBasicMaterial({ color: 0x101929, toneMapped: false }));
  backing.position.copy(windowAnchor);
  const station = createOrbitStation();
  station.node.scale.setScalar(sceneryWidth * .274);
  const race = createMonzaPass(backing.geometry, audio, firstGroupHasThree);
  race.screen.position.copy(windowAnchor);

  const fabric = shadeTexture();
  const shade = new Mesh(new PlaneGeometry(curtainWidth, 1),
    new MeshStandardMaterial({ color: 0x746251, map: fabric, roughness: .96 }));
  const hem = new Mesh(new BoxGeometry(curtainWidth, .049, .066),
    new MeshStandardMaterial({ color: 0x312722, roughness: .68 }));

  const pull = new Group();
  const ropeMaterial = new MeshStandardMaterial({
    color: 0xc69254, roughness: .5, metalness: .3,
  });
  const extensionLength = .35;
  const extension = new Mesh(new CylinderGeometry(.01, .01, extensionLength, 8), ropeMaterial);
  const handle = new Mesh(new CylinderGeometry(.036, .048, .13, 16), ropeMaterial);
  handle.position.y = -.39;
  const pullOrigin = cordBounds.getCenter(new Vector3());
  pullOrigin.y = cordBounds.min.y + .025;
  pullOrigin.z = cordBounds.max.z + .035;
  const cordTop = cordBounds.getCenter(new Vector3());
  cordTop.y = cordBounds.max.y;
  const handlePositions = handle.geometry.getAttribute('position');
  pull.add(extension, handle);
  room.add(backing, station.node, race.screen, shade, hem, pull);

  let active;
  let coverage = 0;
  let orbitElapsed = 0;

  function select(id, { background, station: stationMap, cars }) {
    const previous = backing.material.map;
    backing.material.map = background;
    backing.material.color.set(0xffffff);
    backing.material.needsUpdate = !previous;
    previous?.dispose();
    station.setTexture(stationMap);
    race.reset(cars);
    active = id;
    light.color.set(windowScenes[id].color);
    move(coverage);
  }

  function drift(deltaMs) {
    orbitElapsed += deltaMs;
    const phase = (orbitElapsed % 30_000) / 30_000 * 2 * Math.PI;
    station.node.position.set(
      windowAnchor.x + sceneryWidth * (.028 + .048 * Math.sin(phase)),
      windowAnchor.y + sceneryHeight * (.08 - .012 * Math.cos(phase)),
      windowAnchor.z + .09,
    );
    station.rotateRing((orbitElapsed % 20_000) / 20_000 * 2 * Math.PI);
  }

  function advance(deltaMs) {
    if (active === 'monza') return race.advance(deltaMs);
    drift(deltaMs);
    return true;
  }

  function move(amount, tug = 0) {
    coverage = amount;
    const extended = MathUtils.lerp(.028, curtainLength + .026, amount);
    shade.position.set(windowAnchor.x, curtainTop - extended / 2, curtainZ);
    shade.scale.y = extended;
    fabric.repeat.y = extended / (curtainLength + .026);
    fabric.offset.y = 1 - fabric.repeat.y;
    hem.position.set(windowAnchor.x, curtainTop - extended, curtainZ + .008);
    pull.position.copy(pullOrigin);
    pull.position.y -= tug;
    extension.position.y = -.17 + tug / 2;
    extension.scale.y = 1 + tug / extensionLength;
    light.intensity = active ? windowScenes[active].intensity * (1 - amount) : .85;
  }

  function pullOutline() {
    return {
      cord: [cordTop, extension.getWorldPosition(new Vector3()), handle.getWorldPosition(new Vector3())],
      handle: Array.from({ length: handlePositions.count }, (_, index) =>
        new Vector3().fromBufferAttribute(handlePositions, index).applyMatrix4(handle.matrixWorld)),
    };
  }

  move(0);
  drift(0);
  return {
    load: loadScenery, select, move, advance, render: race.render, pauseAudio: race.pauseAudio, pullOutline,
    get raceVisible() { return active === 'monza' && race.screen.visible; },
  };
}
