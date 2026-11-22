import {
  ACESFilmicToneMapping, Box3, CanvasTexture, DirectionalLight, Group, HemisphereLight,
  MathUtils, Mesh, MeshBasicMaterial, PCFShadowMap, PerspectiveCamera, PlaneGeometry,
  PointLight, Quaternion, Scene, ShadowMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { desktopLayout } from './desktop-layout.js';
import { createDeskProps } from './desk-props.js';
import { loadRapier } from './physics-loader.js';
import { createShelfMotion } from './shelf-motion.js';
import { createWindowView, loadScenery } from './window-view.js';
import { loadPackedModel, loadPackedImage } from './model-loader.js';

const modelUrl = new URL('../../../models/studio_interior/v0.6/OvO_Studio_Interior.glb', import.meta.url);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const warmBackground = 0x0c0909;
const activeFrameInterval = 1000 / 60;

const imageCache = new Map();
async function loadImage(relativeUrl) {
  if(imageCache.has(relativeUrl))return imageCache.get(relativeUrl);
  const promise=decodeImage(relativeUrl); imageCache.set(relativeUrl,promise);
  try{return await promise;}catch(error){imageCache.delete(relativeUrl);throw error;}
}
async function decodeImage(relativeUrl) {
  const image = new Image();
  image.src = new URL(relativeUrl, import.meta.url).href;
  await image.decode();
  return image;
}

function screenTexture(canvas) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 4;
  return texture;
}

async function desktopTexture() {
  const { width, height, iconLeft, iconSize, labelBaseline, apps } = desktopLayout;
  const { works } = window.studioCaseView;
  const [wallpaper, ...pictures] = await Promise.all([
    loadPackedImage('wallpaper'),
    ...apps.map(app => loadImage(works[app.id].icon)),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const scale = Math.max(canvas.width / wallpaper.width, canvas.height / wallpaper.height);
  const imageWidth = wallpaper.width * scale;
  const imageHeight = wallpaper.height * scale;
  context.drawImage(wallpaper, (canvas.width - imageWidth) / 2, (canvas.height - imageHeight) / 2, imageWidth, imageHeight);

  context.font = '500 20px "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  const center = iconLeft + iconSize / 2;
  apps.forEach(({ id, y, imageSize, color }, index) => {
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(iconLeft, y, iconSize, iconSize, 19);
    context.fill();
    context.drawImage(pictures[index], center - imageSize / 2, y + (iconSize - imageSize) / 2, imageSize, imageSize);
    context.fillStyle = '#fff';
    context.fillText(window.ovoPrefs.language==='en'?(id==='yingyu'?'Yingyu':'Bounce'):works[id].title, center, y + labelBaseline);
  });
  return screenTexture(canvas);
}

function signTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 544;
  const context = canvas.getContext('2d');
  context.fillStyle = '#e1e8dc';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#2d241d';
  context.font = '600 164px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('OvO', canvas.width / 2, canvas.height / 2-32);
  context.font = '500 43px "Microsoft YaHei", sans-serif';
  context.fillText(window.ovoPrefs.language==='en'?'About me':'关于我',canvas.width/2,canvas.height/2+102);
  return screenTexture(canvas);
}

function lightRoom(scene, modelBounds) {
  const key = new DirectionalLight(0xffd5a8, 2.6);
  key.position.set(-4.8, 7.5, 5.5);
  key.target.position.set(0.2, 1.2, -.45);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .4, far: 17 });
  key.shadow.normalBias = .018;
  key.shadow.bias = -.0003;

  const windowFill = new DirectionalLight(0x9fb9f5, .85);
  windowFill.position.set(2, 6, -4);
  const frontFill = new DirectionalLight(0xffe4ce, .65);
  frontFill.position.set(5, 4, 9);
  const taskLight = new PointLight(0xffc078, 13, 4);
  taskLight.position.set(1.94, 2.56, -1.15);
  const posterLight = new PointLight(0xffd19a, 3.8, 2.5);
  posterLight.position.set(-2.55, 3.48, -1.64);
  scene.add(new HemisphereLight(0xd8d8ed, 0x967360, 1.32), key, key.target, windowFill, frontFill, taskLight, posterLight);

  const ground = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({ opacity: .27 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = modelBounds.min.y - .018;
  ground.receiveShadow = true;
  scene.add(ground);

  return windowFill;
}

function convexHull(points) {
  const sorted = points.toSorted((a, b) => a.x - b.x || a.y - b.y);
  function edge(order) {
    const chain = [];
    for (const point of order) {
      while (chain.length >= 2) {
        const [a, b] = chain.slice(-2);
        if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0) break;
        chain.pop();
      }
      chain.push(point);
    }
    return chain.slice(0, -1);
  }
  return [...edge(sorted), ...edge(sorted.reverse())];
}

export async function createStudio(canvas, placeSceneTargets, placeDesktop, initialWindow, audio, firstGroupHasThree, placeProfile = () => {}) {
  // Download physics alongside the room, rather than after its models/textures.
  loadRapier().catch(() => {}); // prepareDeskProps handles errors and retries.
  const sceneryReady = loadScenery(initialWindow);
  sceneryReady.catch(() => {}); // Awaited with the initial view below.
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(warmBackground);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
  const scene = new Scene();
  const studioStage = new Group();
  scene.add(studioStage);
  const overviewNear = .035;
  const camera = new PerspectiveCamera(28, 1, overviewNear, 95);

  performance.mark('studio-model-start');
  const { scene: room } = await loadPackedModel(new GLTFLoader(), 'room', modelUrl);
  performance.measure('studio-model-and-desktop-assets', 'studio-model-start');
  studioStage.add(room);
  const mainScreen = room.getObjectByName('Screen_yingyu_Surface');
  const tabletScreen = room.getObjectByName('Screen_bounce_Surface');
  const projector = room.getObjectByName('Directory_Projector');
  const lamp = room.getObjectByName('Lamp_Diffuser');
  if (!mainScreen?.isMesh || !tabletScreen?.isMesh || !projector || !lamp) throw new Error('GLB 中缺少显示器、平板、台灯或放映机。');

  room.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = ![].concat(object.material).some(material => material.transparent);
    object.receiveShadow = true;
  });
  mainScreen.material = new MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  let desktopRequest;
  function prepareDesktop() {
    desktopRequest ??= desktopTexture().then(texture => {
      mainScreen.material.map = texture;
      mainScreen.material.needsUpdate = true;
      draw();
    }).catch(error => { desktopRequest = undefined; throw error; });
    return desktopRequest;
  }
  tabletScreen.material = new MeshBasicMaterial({ map: signTexture(), toneMapped: false });
  const roomBounds = new Box3().setFromObject(room);
  const windowView = createWindowView(room, lightRoom(studioStage, roomBounds), audio, firstGroupHasThree);
  const shelfMotion = createShelfMotion(room);
  let deskProps;
  let deskPropsRequest;
  function prepareDeskProps() {
    deskPropsRequest ??= createDeskProps(room, canvas, camera).then(props => {
      deskProps = props;
      renderer.shadowMap.needsUpdate = true;
    }).catch(error => {
      deskPropsRequest = undefined;
      console.warn('工作室桌面道具物理暂不可用。', error);
    });
    return deskPropsRequest;
  }
  const [initialScenery] = await Promise.all([
    sceneryReady,
    prepareDeskProps(),
  ]);
  windowView.select(initialWindow, initialScenery);
  deskProps?.setMode(initialWindow);
  shelfMotion.setMode(initialWindow, !motionPreference.matches);
  scene.updateMatrixWorld(true);
  canvas.dataset.windowScene = initialWindow;
  canvas.dataset.windowPhase = 'open';

  mainScreen.geometry.computeBoundingBox();
  const screenBounds = mainScreen.geometry.boundingBox;
  const localCenter = screenBounds.getCenter(new Vector3());
  const screenCenter = mainScreen.localToWorld(localCenter.clone());
  const screenSize = screenBounds.getSize(new Vector3()).multiply(mainScreen.getWorldScale(new Vector3()));
  const screenNormal = new Vector3(0, 0, 1).applyQuaternion(mainScreen.getWorldQuaternion(new Quaternion()));
  const worldCorners = [
    [screenBounds.min.x, screenBounds.max.y], [screenBounds.max.x, screenBounds.max.y],
    [screenBounds.max.x, screenBounds.min.y], [screenBounds.min.x, screenBounds.min.y],
  ].map(([x, y]) => mainScreen.localToWorld(new Vector3(x, y, localCenter.z)));
  tabletScreen.geometry.computeBoundingBox();
  const tabletBounds=tabletScreen.geometry.boundingBox;
  const tabletLocal=tabletBounds.getCenter(new Vector3());
  const tabletCenter=tabletScreen.localToWorld(tabletLocal.clone());
  const tabletSize=tabletBounds.getSize(new Vector3()).multiply(tabletScreen.getWorldScale(new Vector3()));
  const tabletRotation=tabletScreen.getWorldQuaternion(new Quaternion());
  const tabletNormal=new Vector3(0,0,1).applyQuaternion(tabletRotation);
  const tabletUp=new Vector3(0,1,0).applyQuaternion(tabletRotation);
  const tabletCorners=[[tabletBounds.min.x,tabletBounds.max.y],[tabletBounds.max.x,tabletBounds.max.y],[tabletBounds.max.x,tabletBounds.min.y],[tabletBounds.min.x,tabletBounds.min.y]].map(([x,y])=>tabletScreen.localToWorld(new Vector3(x,y,tabletLocal.z)));
  // Use the visible outer parts of the actual model for the projected hover outline.
  const projectorSurfaces = projector.children
    .filter(object => object.isMesh && /^Projector_(Body|Brass_Panel|Pedestal|Lens_|Reel_Rim|Reel_Support)/.test(object.name))
    .map(object => {
      const positions = object.geometry.getAttribute('position');
      return Array.from({ length: positions.count }, (_, index) =>
        new Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld));
    });
  // Match the active Blender overview direction in glTF's Y-up coordinates.
  const overview = { position: new Vector3(-11.8, 7.35, 14.4), target: new Vector3(0, 1.45, -.05) };
  const defaultPosition=overview.position.clone();
  let yaw=0, pitch=0, viewDrag;
  function resetView(){yaw=0;pitch=0;overview.position.copy(defaultPosition);draw();}
  function dragStart(e){
    if(!overviewActive||windowSwitching||resetting||travel!==0||e.target!==canvas||e.button!==0||canvas.dataset.propCursor)return;
    viewDrag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);
  }
  function dragMove(e){if(!viewDrag||viewDrag.id!==e.pointerId)return;
    yaw=MathUtils.clamp(viewDrag.yaw+(e.clientX-viewDrag.x)*.0007,-.14,.14);
    pitch=MathUtils.clamp(viewDrag.pitch+(e.clientY-viewDrag.y)*.003,-.65,.65);
    overview.position.copy(defaultPosition).sub(overview.target).applyAxisAngle(new Vector3(0,1,0),yaw).add(overview.target);overview.position.y+=pitch;draw();
  }
  const stopDrag=()=>{viewDrag=undefined;};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopDrag();});
  window.addEventListener('pointerdown',dragStart);window.addEventListener('pointermove',dragMove);
  window.addEventListener('pointerup',stopDrag);window.addEventListener('pointercancel',stopDrag);window.addEventListener('blur',stopDrag);
  async function refreshLanguage(){const next=await desktopTexture();const old=mainScreen.material.map;mainScreen.material.map=next;mainScreen.material.needsUpdate=true;old?.dispose();const sign=tabletScreen.material.map;tabletScreen.material.map=signTexture();sign?.dispose();draw();}
  const reelMeshes=[];projector.traverse(o=>{if(o.isMesh&&/^Projector_Reel_(Hub|Rim|Spoke)/.test(o.name))reelMeshes.push(o);});
  const hubs=reelMeshes.filter(o=>o.name.startsWith('Projector_Reel_Hub'));
  const pivots=hubs.map(h=>{const p=new Group();p.position.copy(h.position);projector.add(p);return p;});
  for(const mesh of reelMeshes){let closest=0;for(let i=1;i<hubs.length;i++)if(mesh.position.distanceTo(pivots[i].position)<mesh.position.distanceTo(pivots[closest].position))closest=i;pivots[closest]?.attach(mesh);}
  const lens=room.getObjectByName('Projector_Lens_Glass');if(lens?.material.emissive){lens.material=lens.material.clone();lens.material.emissive.set('#ffd6a0');}
  let cueTime=0;
  const lampCenter = lamp.getWorldPosition(new Vector3());
  const overviewFromLamp = overview.position.clone().sub(lampCenter);
  const up = new Vector3(0, 1, 0);
  const desktop = { position: new Vector3(), target: screenCenter, fov: 38 };
  const profileView={position:new Vector3(),target:tabletCenter,fov:38};
  let focusKind='desktop';
  const gaze = new Vector3();
  const point = new Vector3();
  const offColor = mainScreen.material.color.clone();
  const onColor = offColor.clone().set(0xffffff);
  let travel = 0;
  let screenPower = 0;
  let cameraMotion = 0;
  let arrival;
  let overviewActive = false;
  let windowSwitching = false;
  let resetting = false;
  let sceneryFrame;
  let sceneryLastTick;
  let sceneryNextFrame;

  function toViewport(worldPoint) {
    point.copy(worldPoint).project(camera);
    return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
  }

  function positionCamera() {
    if (!arrival) {
      if (camera.view?.enabled) camera.clearViewOffset();
      camera.near = overviewNear;
      const destination=focusKind==='profile'?profileView:desktop;
      camera.position.lerpVectors(overview.position, destination.position, travel);
      camera.fov = MathUtils.lerp(overview.fov, destination.fov, travel);
      camera.up.copy(up).lerp(focusKind==='profile'?tabletUp:up,travel).normalize();
      camera.lookAt(gaze.lerpVectors(overview.target, destination.target, MathUtils.smoothstep(travel, 0, .9)));
      camera.updateProjectionMatrix();
      return;
    }

    const amount = MathUtils.smoothstep(arrival.elapsed, 0, 1);
    const remaining = 1 - amount;
    const origin = arrival.origin();
    const width = innerWidth;
    const height = innerHeight;
    camera.position.copy(overviewFromLamp)
      .applyAxisAngle(up, -MathUtils.degToRad(12) * remaining)
      .multiplyScalar(3.1 ** remaining)
      .add(lampCenter);
    camera.fov = overview.fov;
    // The camera stays outside the room during arrival, so retain more depth precision.
    camera.near = 1.2;
    camera.lookAt(gaze.lerpVectors(lampCenter, overview.target, amount));
    // Keep the first rendered lamp behind the breathing light, then center the normal view.
    camera.setViewOffset(width, height,
      (width / 2 - origin.x) * remaining, (height / 2 - origin.y) * remaining, width, height);
    camera.updateMatrixWorld();
    arrival.update({
      origin,
      lamp: toViewport(lampCenter),
      reveal: MathUtils.smoothstep(arrival.elapsed, .12, .92),
      light: 1 - MathUtils.smoothstep(arrival.elapsed, .30, .68),
    });
  }

  function draw(updateTargets = true) {
    positionCamera();
    camera.updateMatrixWorld();
    mainScreen.material.color.lerpColors(offColor, onColor, focusKind==='profile'?0:screenPower);
    windowView.render(renderer);
    renderer.render(scene, camera);
    if (!updateTargets) return;
    if (travel === 0 && !arrival) {
      const outlines = projectorSurfaces.map(surface => convexHull(surface.map(toViewport)));
      const pull = windowView.pullOutline();
      placeSceneTargets(worldCorners.map(toViewport), convexHull(outlines.flat()), outlines, {
        cord: pull.cord.map(toViewport), handle: convexHull(pull.handle.map(toViewport)),
      },tabletCorners.map(toViewport));
    }
    if (travel === 1) {
      if(focusKind==='profile')placeProfile(tabletCorners.map(toViewport));
      else placeDesktop(worldCorners.map(toViewport));
    }
  }

  function animateScenery(now) {
    sceneryLastTick ??= now;
    const elapsed = now - sceneryLastTick;
    const smoothMotion = (canvas.dataset.windowScene === 'orbit' && deskProps?.isDragging) ||
      (!motionPreference.matches && windowView.raceVisible);
    if (smoothMotion) sceneryNextFrame ??= sceneryLastTick + activeFrameInterval;
    else sceneryNextFrame = undefined;
    const activeElapsed = smoothMotion ? now + .5 - sceneryNextFrame : 0;
    if (smoothMotion ? activeElapsed >= 0 : elapsed >= 32) {
      // Keep the 60 Hz schedule even when callbacks land on a faster display's refresh ticks.
      if (smoothMotion) sceneryNextFrame += (Math.floor(activeElapsed / activeFrameInterval) + 1) * activeFrameInterval;
      sceneryLastTick = now;
      const elapsedMs = Math.min(elapsed, 80);
      if(!motionPreference.matches){cueTime+=elapsedMs/1000;const pulse=Math.max(0,1-Math.abs((cueTime%8)-1));for(const p of pivots)p.rotation.z+=pulse*elapsedMs*.0014;if(lens?.material.emissive)lens.material.emissiveIntensity=pulse*.7;}
      const sceneryChanged = !motionPreference.matches && windowView.advance(elapsedMs);
      const shelfChanged = !motionPreference.matches && shelfMotion.advance(elapsedMs);
      const propsChanged = deskProps?.advance(elapsedMs);
      if (sceneryChanged || propsChanged || shelfChanged || !motionPreference.matches) draw(!!viewDrag);
    }
    sceneryFrame = requestAnimationFrame(animateScenery);
  }

  function stopScenery() {
    if (sceneryFrame !== undefined) cancelAnimationFrame(sceneryFrame);
    sceneryFrame = undefined;
    sceneryLastTick = undefined;
    sceneryNextFrame = undefined;
    windowView.pauseAudio();
    deskProps?.setInteractive(false, !motionPreference.matches);
  }

  function syncScenery() {
    if (!overviewActive || windowSwitching || resetting || document.hidden) {
      stopScenery();
      return;
    }
    if (motionPreference.matches) windowView.pauseAudio();
    deskProps?.setInteractive(true, !motionPreference.matches);
    sceneryFrame ??= requestAnimationFrame(animateScenery);
  }

  function setOverviewActive(active) {
    overviewActive = active;
    if(!active)stopDrag();
    syncScenery();
  }

  async function resetProps() {
    if (!overviewActive || windowSwitching || resetting) return false;
    resetting = true;
    syncScenery();
    try {
      await prepareDeskProps();
      if (!deskProps) return false;
      if (!motionPreference.matches) {
        const routes = deskProps.planReset();
        await new Promise(resolve => {
          let started;
          function step(now) {
            started ??= now;
            const elapsed = motionPreference.matches ? 1 : Math.min((now - started) / 1500, 1);
            if (elapsed === 1) {
              resolve();
              return;
            }
            studioStage.rotation.y = Math.PI * 2 * MathUtils.smoothstep(elapsed, 0, 1);
            deskProps.drawReset(routes, elapsed);
            renderer.shadowMap.needsUpdate = true;
            draw(false);
            requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
      }
      studioStage.rotation.y = 0;
      studioStage.updateMatrixWorld(true);
      deskProps.reset(canvas.dataset.windowScene);
      renderer.shadowMap.needsUpdate = true;
      draw();
      return true;
    } finally {
      resetting = false;
      syncScenery();
    }
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    const overviewSize = Math.max(7.32, 11.1 / camera.aspect);
    overview.fov = MathUtils.radToDeg(2 * Math.atan(overviewSize / (2 * overview.position.distanceTo(overview.target))));
    const verticalTangent = Math.tan(MathUtils.degToRad(desktop.fov / 2));
    const frameDistance = Math.max(screenSize.x / (.87 * 2 * verticalTangent * camera.aspect), screenSize.y / (.82 * 2 * verticalTangent));
    desktop.position.copy(screenCenter).addScaledVector(screenNormal, frameDistance);
    const tabletDistance=Math.max(tabletSize.x/(.88*2*verticalTangent*camera.aspect),tabletSize.y/(.82*2*verticalTangent));
    profileView.position.copy(tabletCenter).addScaledVector(tabletNormal,tabletDistance);
    draw();
  }

  function moveCamera(opening,kind='desktop') {
    if(opening)focusKind=kind;
    const motion = ++cameraMotion;
    const startTravel = travel;
    const startPower = screenPower;
    const destination = Number(opening);
    const duration = motionPreference.matches ? 0 : opening ? 900 : 680;
    const started = performance.now();
    return new Promise(resolve => {
      function step(now) {
        if (motion !== cameraMotion) {
          resolve(false);
          return;
        }
        const elapsed = duration ? MathUtils.clamp((now - started) / duration, 0, 1) : 1;
        travel = MathUtils.lerp(startTravel, destination, MathUtils.smoothstep(elapsed, opening ? 0 : .13, 1));
        const powerProgress = opening ? MathUtils.smoothstep(elapsed, .77, 1) : MathUtils.smoothstep(elapsed, 0, .13);
        screenPower = MathUtils.lerp(startPower, destination, powerProgress);
        draw();
        if (elapsed < 1) requestAnimationFrame(step);
        else resolve(true);
      }
      requestAnimationFrame(step);
    });
  }

  function restoreOverview() {
    cameraMotion++;
    travel = 0;
    screenPower = 0;
    draw();
  }

  function animateShade(closing, duration) {
    return new Promise(resolve => {
      let started;
      let lastFrame;
      function step(now) {
        started ??= now;
        if (!closing && canvas.dataset.windowScene === 'monza' && overviewActive && !document.hidden) {
          const elapsedMs = Math.min(now - (lastFrame ?? now), 80);
          shelfMotion.advance(elapsedMs);
          deskProps?.advance(elapsedMs);
        }
        lastFrame = now;
        const elapsed = MathUtils.clamp((now - started) / duration, 0, 1);
        const progress = MathUtils.smoothstep(elapsed, 0, 1);
        const pull = closing ? .085 * Math.sin(Math.PI * Math.min(elapsed * 2.6, 1)) : 0;
        windowView.move(closing ? progress : 1 - progress, pull);
        draw();
        if (elapsed < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  async function switchWindow(next, signal, onLoaded = () => {}) {
    windowSwitching = true;
    syncScenery();
    try {
      const animated = !motionPreference.matches;
      const scenery = windowView.load(next).catch(() => null);
      const propPhysics = prepareDeskProps();
      if (animated) {
        canvas.dataset.windowPhase = 'closing';
        await animateShade(true, 545);
        canvas.dataset.windowPhase = 'covered';
        await new Promise(resolve => setTimeout(resolve, 170));
      }
      let timer;
      let cancel;
      const cancelled=new Promise(resolve=>{
        cancel=()=>resolve(null);
        if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
        timer=setTimeout(cancel,30000);
      });
      const textures=await Promise.race([Promise.all([scenery,propPhysics]).then(([loaded])=>loaded),cancelled]);
      clearTimeout(timer);signal?.removeEventListener('abort',cancel);
      onLoaded();
      if (textures && !signal?.aborted) {
        windowView.select(next, textures);
        canvas.dataset.windowScene = next;
        deskProps?.setMode(next);
        shelfMotion.setMode(next, animated);
        draw();
      }
      if (animated) {
        canvas.dataset.windowPhase = 'opening';
        await animateShade(false, 660);
      }
      canvas.dataset.windowPhase = 'open';
      return Boolean(textures) && !signal?.aborted;
    } finally {
      windowSwitching = false;
      syncScenery();
    }
  }

  function arriveFromLamp(origin, update) {
    const duration = 1470;
    arrival = { origin, update, elapsed: 0 };
    draw();
    return new Promise(resolve => {
      let started;
      function step(now) {
        started ??= now;
        const elapsed = MathUtils.clamp((now - started) / duration, 0, 1);
        if (elapsed === 1) {
          arrival = undefined;
          draw();
          resolve();
          return;
        }
        arrival.elapsed = elapsed;
        draw();
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  renderer.shadowMap.needsUpdate = true;
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncScenery);
  window.addEventListener('pagehide', stopScenery);
  window.addEventListener('pageshow', syncScenery);
  motionPreference.addEventListener('change', syncScenery);
  return { arriveFromLamp, moveCamera, restoreOverview, switchWindow, setOverviewActive, resetProps, resetView, refreshLanguage, prepareDesktop };
}
