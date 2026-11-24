import {
  BackSide, Box3, CanvasTexture, Group, MathUtils, Mesh, MeshBasicMaterial, Plane, PlaneGeometry,
  Quaternion, Raycaster, ShaderMaterial, Vector2, Vector3,
} from 'three';
import { loadRapier } from './physics-loader.js';

const fixedStep = 1 / 120;
const gravity = -9.81;
const lowGravity = .055;
const returnScale = .18;
const up = new Vector3(0, 1, 0);
const pickRadius = 8; // CSS pixels, independent of the canvas pixel ratio.
const pickRings = [[4, 8], [pickRadius, 16]].map(([radius, count]) =>
  Array.from({ length: count }, (_, index) => {
    const angle = index * 2 * Math.PI / count;
    return new Vector2(radius * Math.cos(angle), radius * Math.sin(angle));
  }));
const propDefinitions = [
  {
    name: 'Desk_Mouse_Prop', parts: ['Mouse_Shell', 'Mouse_Scroll', 'Mouse_Split'],
    speed: .112, mass: .13, heading: [-.37, .78, .50], phase: 0,
  },
  { name: 'Desk_Sticky_Prop', parts: ['Prop_StickyNotes'], speed: .085, mass: .06, heading: [-.57, .75, .35], phase: 1.4 },
  { name: 'Desk_Notebook_Prop', parts: ['Prop_Notebook'], speed: .091, mass: .19, heading: [.4, .9, -.21], phase: 2.6, checkOverlap: true },
  { name: 'Desk_Pencil_Prop', parts: ['Prop_Pencil'], speed: .102, mass: .044, heading: [.3, .56, .78], phase: 3.8, checkOverlap: true },
];
const solidFurniture = [
  /^Desk_(?:Main_Ash_Top|Leather_Mat|Left_Cabinet|Right_(?:Foot|FrameLeg)|Underframe)/,
  /^Chair_(?:Seat_|Contoured_Mesh_Back|Armrest|Arm_Stem|Central_Piston|Curved_Spine|Spider_|Caster_)/,
  /^(?:yingyu_(?:Monitor_Enclosure|Stand_)|bounce_iPad_Enclosure|iPad_Folio_|Keyboard_Low_Profile)/,
  /^(?:Projector_(?:Body|Pedestal)|Lamp_(?:Base|Shade)|Plant_(?:Ceramic_Pot|Soil)|Shelf_(?:Floating|Underlight)|Window_Sill)/,
  /^(?:Console_(?:Divider|End|Lower_Shelf|Right_Ash_Top)|Mug_(?:Hollow_Ceramic|Handle))/,
  /^Experiment_Lantern_(?:Acrylic|Base|Brass_Corner)/,
];
const floatingFurniture = /^(?:Book_|Experiment_Analog_Receiver$|Receiver_|Storage_)/;
const displayCase = /^(?:Display_Case_|Collectible_Platform$)/;
const plantBranch = /^Plant_(?:(?:Upper|Trailing)_(?:Stem|Leaf)|Petiole)/;

function boxCollider(bounds, rapier) {
  const half = bounds.getSize(new Vector3()).multiplyScalar(.5).clampScalar(.002, Infinity);
  const center = bounds.getCenter(new Vector3());
  return rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(center.x, center.y, center.z);
}

function furnitureCollider(mesh, rapier, sway, leaf) {
  const positions = mesh.geometry.getAttribute('position');
  const waves = sway && mesh.geometry.morphAttributes.position;
  const points = [];
  const vertex = new Vector3();
  const first = new Vector3();
  const second = new Vector3();
  const edge = new Vector3();
  const bounds = new Box3();
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i);
    if (waves?.length === 2) {
      first.fromBufferAttribute(waves[0], i);
      second.fromBufferAttribute(waves[1], i);
      // Enclose the whole bend cycle of each leaf or stem while leaving gaps between them.
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          edge.copy(vertex).addScaledVector(first, a).addScaledVector(second, b).applyMatrix4(mesh.matrixWorld);
          if (leaf) bounds.expandByPoint(edge);
          else points.push(edge.x, edge.y, edge.z);
        }
      }
    } else {
      vertex.applyMatrix4(mesh.matrixWorld);
      points.push(vertex.x, vertex.y, vertex.z);
    }
  }
  // Very thin, bent leaves need enough depth to catch the edge of a tumbling pencil.
  if (!bounds.isEmpty()) return boxCollider(bounds, rapier);
  return rapier.ColliderDesc.convexHull(new Float32Array(points)) ??
    boxCollider(bounds.setFromObject(mesh), rapier);
}

function addRoomColliders(room, world, rapier, low, high) {
  const thickness = .09;
  const span = high.clone().sub(low).multiplyScalar(.5).addScalar(thickness);
  const center = low.clone().lerp(high, .5);
  function boundary(x, y, z, hx, hy, hz, restitution) {
    world.createCollider(rapier.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z).setRestitution(restitution).setFriction(.5));
  }
  boundary(center.x, low.y - thickness, center.z, span.x, thickness, span.z, .19);
  boundary(center.x, high.y + thickness, center.z, span.x, thickness, span.z, .5);
  boundary(low.x - thickness, center.y, center.z, thickness, span.y, span.z, .5);
  boundary(high.x + thickness, center.y, center.z, thickness, span.y, span.z, .5);
  boundary(center.x, center.y, low.z - thickness, span.x, span.y, thickness, .5);
  boundary(center.x, center.y, high.z + thickness, span.x, span.y, thickness, .5);

  const furniture = [];
  const movingColliders = [];
  const plantMeshes = [];
  const caseBounds = new Box3();
  room.traverse(mesh => {
    if (!mesh.isMesh) return;
    const name = mesh.userData.name ?? mesh.name;
    if (displayCase.test(name)) {
      caseBounds.expandByObject(mesh, true);
      furniture.push(mesh);
      return;
    }
    const moving = floatingFurniture.test(name);
    const sway = plantBranch.test(name);
    if (!moving && !sway && !solidFurniture.some(pattern => pattern.test(name))) return;
    const body = moving ? world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased()) : undefined;
    const collider = furnitureCollider(mesh, rapier, sway, sway && name.includes('_Leaf'));
    world.createCollider(collider.setFriction(.55).setRestitution(.35), body);
    if (body) movingColliders.push({ mesh, body, y: mesh.position.y, offset: 0 });
    (sway ? plantMeshes : furniture).push(mesh);
  });
  if (!caseBounds.isEmpty()) {
    // Close the open ends of the glass display so small props cannot enter the moving car's space.
    world.createCollider(boxCollider(caseBounds, rapier).setFriction(.55).setRestitution(.35));
  }
  return { furniture, plantMeshes, movingColliders };
}

function shadowTexture() {
  const image = document.createElement('canvas');
  image.width = image.height = 64;
  const context = image.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 5, 32, 32, 31);
  gradient.addColorStop(0, '#0009');
  gradient.addColorStop(1, '#0000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(image);
}

function propCollider(parts, half, home, rapier) {
  const points = [];
  const point = new Vector3();
  for (const part of parts) {
    part.traverse(mesh => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).sub(home);
        points.push(point.x, point.y, point.z);
      }
    });
  }
  return rapier.ColliderDesc.convexHull(new Float32Array(points)) ?? rapier.ColliderDesc.cuboid(half.x, half.y, half.z);
}

function makeProp(definition, parts, parent, world, rapier, matHeight, deskHeight, shadowMap) {
  const bounds = new Box3();
  for (const part of parts) bounds.expandByObject(part, true);
  const home = bounds.getCenter(new Vector3());
  const half = bounds.getSize(new Vector3()).multiplyScalar(.5);
  const resting = home.clone();
  const isMouse = definition.name === 'Desk_Mouse_Prop';
  if (isMouse) resting.y = Math.max(home.y, matHeight + half.y + .002);
  // The source pose straddles the sloped notebook and the desk's bevel. Give
  // the pencil a level, inset home on the clear desktop. Scene switches still
  // preserve its current body position, and reset returns to this same home.
  if (definition.name === 'Desk_Pencil_Prop') {
    resting.x += .7;resting.z -= .2;
    resting.y = deskHeight + half.y + .007;
  }
  const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic()
    .setTranslation(resting.x, resting.y, resting.z).setCcdEnabled(true)
    .setSoftCcdPrediction(.045).setAngularDamping(.7));
  const collider = world.createCollider(propCollider(parts, half, home, rapier)
    .setContactSkin(.005).setMass(definition.mass).setFriction(.36).setRestitution(.4), body);

  const model = new Group();
  model.name = definition.name;
  model.position.copy(home);
  parent.add(model);
  for (const part of parts) {
    model.attach(part);
    part.traverse(object => { if (object.isMesh) object.castShadow = false; });
  }
  model.position.copy(resting);
  const shadow = new Mesh(new PlaneGeometry(2 * half.x + .26, 2 * half.z + .25), new MeshBasicMaterial({
    map: shadowMap, transparent: true, depthWrite: false, toneMapped: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  parent.add(shadow);
  return {
    body, collider, model, shadow, half, home: resting, speed: definition.speed, phase: definition.phase,
    checkOverlap: definition.checkOverlap,
    initialHeading: new Vector3(...definition.heading).normalize(),
    heading: new Vector3(...definition.heading).normalize(),
    spinAxis: new Vector3(Math.cos(definition.phase) < 0 ? -.55 : .55, .8,
      Math.sin(definition.phase) < 0 ? -.42 : .42).normalize(),
  };
}

function makePropOutline() {
  return new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: { viewport: { value: new Vector2(1, 1) } },
    vertexShader: `
      uniform vec2 viewport;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vec4 clip = projectionMatrix * view;
        vec4 normalClip = projectionMatrix * (view + vec4(normalize(normalMatrix * normal), 0.0));
        vec2 screenNormal = (normalClip.xy / normalClip.w - clip.xy / clip.w) * viewport;
        clip.xy += screenNormal / max(length(screenNormal), 0.0001) * (2.8 / viewport) * clip.w;
        gl_Position = clip;
      }
    `,
    fragmentShader: `
      void main() {
        gl_FragColor = vec4(1.0, 0.88, 0.73, 0.48);
      }
    `,
  });
}

export async function createDeskProps(room, canvas, camera) {
  const propParts = propDefinitions.map(({ parts }) => parts.map(name => room.getObjectByName(name)));
  const mat = room.getObjectByName('Desk_Leather_Mat');
  const floor = room.getObjectByName('Arch_Floor_Substrate');
  const rightWall = room.getObjectByName('Arch_Right_Wall');
  const backWall = room.getObjectByName('Arch_Back_Window_Apron');
  if (!floor || !mat || !rightWall || !backWall || propParts.flat().some(part => !part)) {
    throw new Error('GLB 中缺少桌面道具或用于碰撞的室内模型。');
  }

  const rapier = await loadRapier();
  const matHeight = new Box3().setFromObject(mat, true).max.y;
  const deskHeight = new Box3().setFromObject(room.getObjectByName('Desk_Main_Ash_Top'), true).max.y;
  const floorBounds = new Box3().setFromObject(floor, true);
  const planks = [];
  const plankBounds = new Box3();
  room.traverse(mesh => {
    if (mesh.isMesh && (mesh.userData.name ?? mesh.name).startsWith('Arch_Ash_Plank_')) {
      planks.push(mesh);
      plankBounds.expandByObject(mesh, true);
    }
  });
  // Keep one continuous landing surface at the top of the visible boards, including their seams.
  const floorHeight = Math.max(floorBounds.max.y, plankBounds.max.y);
  const rightBounds = new Box3().setFromObject(rightWall, true);
  const low = new Vector3(floorBounds.min.x, floorHeight, new Box3().setFromObject(backWall, true).max.z);
  const high = new Vector3(rightBounds.min.x, rightBounds.max.y, floorBounds.max.z);
  const world = new rapier.World({ x: 0, y: gravity, z: 0 });
  world.timestep = fixedStep;
  world.integrationParameters.maxCcdSubsteps = 4;
  world.numSolverIterations = 8;
  room.updateWorldMatrix(true, true);
  const { furniture, plantMeshes, movingColliders } = addRoomColliders(room, world, rapier, low, high);
  const occluders = [...furniture, ...plantMeshes, ...planks, floor, rightWall, backWall];
  const shadowMap = shadowTexture();
  const props = propDefinitions.map((definition, index) =>
    makeProp(definition, propParts[index], room.parent, world, rapier, matHeight, deskHeight, shadowMap));
  const thinProps = props.filter(prop => prop.checkOverlap);
  const propByMesh = new WeakMap();
  const outlineMaterial = makePropOutline();
  for (const prop of props) {
    prop.meshes = [];
    prop.model.traverse(mesh => { if (mesh.isMesh) prop.meshes.push(mesh); });
    prop.pickBoundRadius = prop.half.length();
    prop.outlines = prop.meshes.map(mesh => {
      propByMesh.set(mesh, prop);
      const outline = new Mesh(mesh.geometry, outlineMaterial);
      outline.visible = false;
      mesh.add(outline);
      return outline;
    });
    prop.targetMin = low.clone().add(prop.half).addScalar(.008);
    prop.targetMax = high.clone().sub(prop.half).addScalar(-.008);
  }
  const pointer = new Vector2();
  const worldCenter = new Vector3();
  const ray = new Raycaster();
  const dragPlane = new Plane();
  const cameraDirection = new Vector3();
  const velocity = new Vector3();
  const angularVelocity = new Vector3();
  const spin = new Vector3();
  const rotation = new Quaternion();
  const dragPoint = new Vector3();
  const direction = new Vector3();
  const shadowRay = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  let orbit = false;
  let interactive = false;
  let driftEnabled = true;
  let time = 0;
  let remaining = 0;
  let grab;
  let grabbedPointerId;
  let mouse;
  let hoveredProp;
  let hoverNeedsUpdate = false;

  function setRay(x, y, rect) {
    pointer.set(2 * (x - rect.left) / rect.width - 1, 1 - 2 * (y - rect.top) / rect.height);
    ray.setFromCamera(pointer, camera);
  }

  function visibleHit(meshes) {
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const occluder = ray.intersectObjects(occluders, false)[0];
    return !occluder || hit.distance < occluder.distance ? hit : null;
  }

  function hitProp(x, y, target, rect) {
    if (target !== canvas && !target?.closest?.('.monitor-hit, .projector-hit, .ipad-hit')) return null;
    if (!rect.width || !rect.height) return null;
    setRay(x, y, rect);
    const anglePerPixel = 2 * Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2) / rect.height;
    const meshes = [];
    for (const prop of props) {
      prop.model.getWorldPosition(worldCenter);
      const distance = ray.ray.origin.distanceTo(worldCenter) + prop.pickBoundRadius;
      const margin = distance * anglePerPixel * pickRadius;
      if (ray.ray.distanceSqToPoint(worldCenter) > (prop.pickBoundRadius + margin) ** 2) continue;
      prop.model.updateMatrixWorld(true);
      meshes.push(...prop.meshes);
    }
    if (!meshes.length) return null;
    const direct = visibleHit(meshes);
    if (direct || target !== canvas) return direct;

    // Keep the screen/projector controls clickable and test occlusion on each nearby ray.
    for (const ring of pickRings) {
      let nearest;
      for (const offset of ring) {
        setRay(x + offset.x, y + offset.y, rect);
        const hit = visibleHit(meshes);
        if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
      }
      if (nearest) return nearest;
    }
    return null;
  }

  function setHover(prop) {
    if (hoveredProp === prop) return;
    hoveredProp?.outlines.forEach(outline => { outline.visible = false; });
    hoveredProp = prop;
    hoveredProp?.outlines.forEach(outline => { outline.visible = true; });
  }

  function updateHover(viewDragging) {
    hoverNeedsUpdate = false;
    if (!interactive) return;
    const rect = canvas.getBoundingClientRect();
    outlineMaterial.uniforms.viewport.value.set(rect.width, rect.height);
    if (grab) return;
    const hit = !viewDragging && mouse
      ? hitProp(mouse.x, mouse.y, document.elementFromPoint(mouse.x, mouse.y), rect)
      : null;
    setHover(hit ? propByMesh.get(hit.object) : undefined);
    if (hit) canvas.dataset.propCursor = 'grab';
    else delete canvas.dataset.propCursor;
  }

  function startDrag(event) {
    if (grab || event.button !== 0 || event.pointerType !== 'mouse') return;
    grabbedPointerId = undefined;
    if (!interactive) return;
    const rect = canvas.getBoundingClientRect();
    const hit = hitProp(event.clientX, event.clientY, event.target, rect);
    if (!hit) return;
    const prop = propByMesh.get(hit.object);
    const position = new Vector3().copy(prop.body.translation());
    dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(cameraDirection), hit.point);
    // Use the actual pointer ray as the anchor so an assisted grab never snaps to a sampled pixel.
    setRay(event.clientX, event.clientY, rect);
    if (!ray.ray.intersectPlane(dragPlane, dragPoint)) return;
    event.preventDefault();
    event.stopPropagation();
    grab = {
      id: event.pointerId, prop, target: position, offset: position.clone().sub(dragPoint), heading: prop.heading.clone(),
    };
    setHover(prop);
    hoverNeedsUpdate = true;
    grabbedPointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.propCursor = 'grabbing';
    prop.body.wakeUp();
  }

  function movePointer(event) {
    if (!interactive || event.pointerType !== 'mouse') return;
    mouse = { x: event.clientX, y: event.clientY };
    if (!grab) { hoverNeedsUpdate = true; return; }
    if (event.pointerId !== grab.id) return;
    setRay(mouse.x, mouse.y, canvas.getBoundingClientRect());
    if (ray.ray.intersectPlane(dragPlane, dragPoint)) {
      dragPoint.add(grab.offset).clamp(grab.prop.targetMin, grab.prop.targetMax);
      direction.copy(dragPoint).sub(grab.target);
      if (direction.lengthSq() > .000003) grab.heading.copy(direction).normalize();
      grab.target.copy(dragPoint);
    }
  }

  function release(keepDirection) {
    if (!grab) return;
    const { id: pointerId, prop } = grab;
    const driftOnRelease = keepDirection && orbit && driftEnabled;
    if (driftOnRelease) prop.heading.copy(grab.heading);
    grab = undefined;
    delete canvas.dataset.propCursor;
    hoverNeedsUpdate = true;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    velocity.copy(prop.heading).multiplyScalar(driftOnRelease ? prop.speed : 0);
    prop.body.setLinvel(velocity, true);
  }

  function setInteractive(active, animate = true) {
    driftEnabled = animate;
    interactive = active;
    if (interactive) return;
    release(false);
    setHover(undefined);
    delete canvas.dataset.propCursor;
  }

  const identity = new Quaternion();
  function planReset() {
    const routes = props.map(prop => {
      const start = prop.model.position.clone();
      const travel = prop.home.clone().sub(start);
      const radius = prop.half.length() * returnScale + .003;
      const sphere = new rapier.Ball(radius);
      const blocked = world.castShape(start, identity, travel, sphere, 0, 1, true,
        undefined, undefined, prop.collider);
      return { prop, start, travel, radius, clear: !blocked, rotation: prop.model.quaternion.clone() };
    });
    // All four props travel on the same clock. Also reserve clearance between their moving paths.
    for (const [index, route] of routes.entries()) {
      for (const other of routes.slice(index + 1)) {
        const delta = route.start.clone().sub(other.start);
        const relativeTravel = route.travel.clone().sub(other.travel);
        const t = MathUtils.clamp(-delta.dot(relativeTravel) / (relativeTravel.lengthSq() || 1), 0, 1);
        if (delta.addScaledVector(relativeTravel, t).length() < route.radius + other.radius) {
          route.clear = other.clear = false;
        }
      }
    }
    return routes;
  }

  function drawReset(routes, progress) {
    for (const { prop, start, travel, clear, rotation: startRotation } of routes) {
      const { model, shadow, home } = prop;
      const leave = MathUtils.smoothstep(progress, .06, .34);
      const arrive = MathUtils.smoothstep(progress, .69, .96);
      // When furniture blocks the path, tuck the prop away and restore it at its own place.
      // Contraction and expansion are each entirely within a known non-penetrating pose.
      const minimum = clear ? returnScale : 0;
      const scale = 1 - (1 - minimum) * (leave - arrive);
      const transit = MathUtils.smoothstep(progress, .34, .69);
      model.scale.setScalar(scale);
      model.visible = scale > .001;
      shadow.visible = progress < .34 && model.visible;
      if (clear) {
        model.position.copy(start).addScaledVector(travel, transit);
        model.quaternion.copy(startRotation).slerp(identity, transit);
      } else {
        model.position.copy(transit < .5 ? start : home);
        model.quaternion.copy(transit < .5 ? startRotation : identity);
      }
      shadow.material.opacity = .28 * scale;
    }
  }

  function reset(scene) {
    remaining = 0;
    time = 0;
    for (const prop of props) {
      const { body, model, shadow, home, heading, initialHeading } = prop;
      heading.copy(initialHeading);
      body.setTranslation(home, true);
      body.setRotation(identity, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      model.position.copy(home);
      model.quaternion.copy(identity);
      model.scale.setScalar(1);
      model.visible = shadow.visible = true;
      updateShadow(prop);
    }
    setMode(scene);
    if (!orbit || !driftEnabled) props.forEach(({ body }) => body.sleep());
  }

  function setMode(scene) {
    orbit = scene === 'orbit';
    world.gravity = { x: 0, y: gravity * (orbit ? lowGravity : 1), z: 0 };
    for (const { body, collider, heading, speed } of props) {
      body.resetForces(false);
      body.setLinearDamping(orbit ? .06 : 1.6);
      collider.setRestitution(orbit ? .4 : .12);
      if (orbit) {
        body.addForce({ x: 0, y: -world.gravity.y * body.mass(), z: 0 }, true);
        heading.y = Math.max(.36, Math.abs(heading.y));
        body.setLinvel(velocity.copy(heading.normalize()).multiplyScalar(speed), true);
      } else {
        body.setLinvel({ x: 0, y: Math.min(body.linvel().y, 0), z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  function updateShadow({ model, half, shadow }) {
    const { x, y, z } = model.position;
    shadowRay.ray.origin.set(x, y, z);
    const support = shadowRay.intersectObjects(furniture, false)[0]?.point.y ?? low.y;
    const rise = Math.max(0, y - half.y - support);
    shadow.position.set(x, support + .003, z);
    shadow.material.opacity = .62 / (1 + rise * 2.9);
    shadow.scale.setScalar(1 + .48 * rise);
  }

  const contactPosition = new Vector3();
  function resolveThinPropOverlap({ body, collider }) {
    if (body.isSleeping()) return;
    contactPosition.copy(body.translation());
    rotation.copy(body.rotation());
    const shape = collider.shape;
    velocity.copy(body.linvel());
    let corrected = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      let overlap;
      world.intersectionsWithShape(contactPosition, rotation, shape, other => {
        const contact = other.contactShape(shape, contactPosition, rotation, 0);
        if (contact && contact.distance < (overlap?.distance ?? -.001)) overlap = contact;
        return true;
      }, undefined, undefined, collider);
      if (!overlap) break;
      // CCD handles travel. Resolve residual contact from the new orientation and moving shelves.
      const normal = overlap.normal1;
      contactPosition.addScaledVector(normal, .002 - overlap.distance);
      const intoSurface = velocity.dot(normal);
      if (intoSurface < 0) velocity.addScaledVector(normal, -intoSurface);
      corrected = true;
    }
    if (corrected) {
      body.setTranslation(contactPosition, true);
      body.setLinvel(velocity, true);
      world.propagateModifiedBodyPositionsToColliders();
    }
  }

  function advance(deltaMs) {
    const furnitureMoved = movingColliders.some(({ mesh, y, offset }) => Math.abs(mesh.position.y - y - offset) > .00001);
    if (orbit && !driftEnabled && !grab) return false;
    if (!orbit && !grab && !furnitureMoved && props.every(({ body }) => body.isSleeping())) return false;
    remaining += deltaMs / 1000;
    const steps = Math.floor(remaining / fixedStep);
    remaining -= steps * fixedStep;
    const movingStep = { x: 0, y: 0, z: 0 };
    for (let step = 1; step <= steps; step++) {
      time += fixedStep;
      if (furnitureMoved) {
        for (const { mesh, body, y, offset } of movingColliders) {
          if (Math.abs(mesh.position.y - y - offset) <= .00001) continue;
          movingStep.y = MathUtils.lerp(offset, mesh.position.y - y, step / steps);
          body.setNextKinematicTranslation(movingStep);
        }
      }
      if (orbit || grab) {
        for (const prop of props) {
          const { body, heading, speed, phase, spinAxis } = prop;
          if (grab?.prop === prop) {
            velocity.copy(grab.target).sub(body.translation()).multiplyScalar(30).clampLength(0, 5);
            spin.set(0, 0, 0);
          } else if (orbit && driftEnabled) {
            velocity.copy(body.linvel());
            const currentSpeed = velocity.length();
            if (currentSpeed > .006) heading.copy(velocity).normalize();
            heading.applyAxisAngle(up, .043 * fixedStep);
            heading.y += .018 * Math.sin(.43 * time + phase) * fixedStep;
            // A fast drag can bump another prop, but released props return to a gentle drift.
            const drift = MathUtils.lerp(Math.min(currentSpeed, speed * 1.42), speed, .0135);
            velocity.copy(heading.normalize()).multiplyScalar(drift);
            spin.copy(spinAxis).multiplyScalar(.14 + .027 * Math.sin(.21 * time + phase));
          } else continue;
          angularVelocity.copy(body.angvel()).lerp(spin, grab?.prop === prop ? .24 : .035).clampLength(0, .19);
          body.setAngvel(angularVelocity, true);
          body.setLinvel(velocity, true);
        }
      }
      world.step();
      for (const prop of thinProps) resolveThinPropOverlap(prop);
    }
    if (furnitureMoved && steps) {
      for (const item of movingColliders) item.offset = item.body.translation().y;
    }
    let moved = false;
    for (const prop of props) {
      const position = prop.body.translation();
      rotation.copy(prop.body.rotation());
      if (prop.model.position.distanceToSquared(position) < 1e-9 &&
          1 - Math.abs(prop.model.quaternion.dot(rotation)) < 1e-8) continue;
      prop.model.position.copy(position);
      prop.model.quaternion.copy(rotation);
      updateShadow(prop);
      moved = true;
    }
    return moved;
  }

  window.addEventListener('pointerdown', startDrag, true);
  window.addEventListener('pointermove', movePointer);
  window.addEventListener('pointerup', event => { if (event.pointerId === grab?.id) release(true); }, true);
  window.addEventListener('pointercancel', event => { if (event.pointerId === grab?.id) release(false); }, true);
  window.addEventListener('click', event => {
    if (grabbedPointerId === undefined || !event.detail) return;
    if (event.pointerId !== undefined && event.pointerId !== grabbedPointerId) return;
    // Releasing a prop over the monitor or projector must not activate the underlying button.
    grabbedPointerId = undefined;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === grab?.id) release(false); });
  function clearPointer() {
    mouse = undefined;
    hoverNeedsUpdate = true;
  }
  window.addEventListener('pointerout', event => {
    if (event.pointerType === 'mouse' && !event.relatedTarget) clearPointer();
  });
  window.addEventListener('blur', () => { clearPointer(); release(false); });
  props.forEach(updateShadow);

  return {
    setMode, setInteractive, advance, planReset, drawReset, reset, updateHover,
    get hoverNeedsUpdate() { return hoverNeedsUpdate; },
    get isDragging() { return Boolean(grab); },
  };
}
