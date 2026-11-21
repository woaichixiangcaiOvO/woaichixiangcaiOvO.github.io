import {
  BoxGeometry, CylinderGeometry, Group, InstancedMesh, MathUtils, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PlaneGeometry, TorusGeometry,
} from 'three';

function createRing() {
  const rotor = new Group();
  rotor.name = 'StationRing';
  const rimRadius = .272;
  const metal = new MeshStandardMaterial({
    color: 0x8796aa, roughness: .5, metalness: .46, emissive: 0x677c96, emissiveIntensity: .22,
  });
  const trim = new MeshStandardMaterial({ color: 0x394759, roughness: .64, metalness: .34 });
  rotor.add(new Mesh(new TorusGeometry(rimRadius, .024, 10, 72), metal));
  const innerRail = new Mesh(new TorusGeometry(rimRadius - .017, .008, 8, 72), trim);
  innerRail.position.z = .013;
  rotor.add(innerRail);

  const spokeProfile = new CylinderGeometry(.009, .013, .215, 8);
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI / 3;
    const spoke = new Mesh(spokeProfile, metal);
    spoke.position.set(.143 * Math.cos(angle), .143 * Math.sin(angle), 0);
    spoke.rotation.z = angle - Math.PI / 2;
    rotor.add(spoke);
  }

  const count = 36;
  const panes = new InstancedMesh(new BoxGeometry(.022, .015, .008),
    new MeshBasicMaterial({ color: 0xffa750, toneMapped: false }), count);
  const pane = new Object3D();
  for (let index = 0; index < count; index++) {
    const angle = index * 2 * Math.PI / count;
    pane.position.set(rimRadius * Math.cos(angle), rimRadius * Math.sin(angle), .026);
    pane.rotation.z = angle + Math.PI / 2;
    pane.scale.x = index % 6 === 0 ? .46 : 1;
    pane.updateMatrix();
    panes.setMatrixAt(index, pane.matrix);
  }
  rotor.add(panes);
  return rotor;
}

export function createOrbitStation() {
  const node = new Group();
  node.name = 'OrbitalStation';
  node.visible = false;
  const body = new Mesh(new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ transparent: true, alphaTest: .01, toneMapped: false }));
  const axle = new Group();
  axle.rotation.y = MathUtils.degToRad(38);
  const ringDepth = new Group();
  // Keep both sides of the tilted ring between the background and the window frame.
  ringDepth.scale.z = .26;
  ringDepth.position.set(-.084, -.014, 0);
  const rotor = createRing();
  axle.add(rotor);
  ringDepth.add(axle);
  node.add(body, ringDepth);

  function setTexture(map) {
    body.material.map?.dispose();
    body.material.map = map ?? null;
    body.material.needsUpdate = true;
    node.visible = Boolean(map);
    if (map) body.scale.y = map.image.height / map.image.width;
  }

  function rotateRing(angle) {
    rotor.rotation.z = angle;
  }

  return { node, setTexture, rotateRing };
}
