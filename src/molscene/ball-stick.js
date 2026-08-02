// The classic textbook look: a solid cylinder ("stick") per bond, doubled
// or tripled with a small parallel offset for double/triple bonds. No
// electrons, no orbitals - just the skeleton, for when the audience wants
// to read connectivity and geometry at a glance rather than see orbitals
// at all.

import * as THREE from 'three';

const RADIUS = 0.05;
const GAP = 0.22;
const MATERIAL = function(){ return new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.35, metalness: 0.25 }); };

function perpOffset(dir){
  const reference = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(dir, reference).normalize();
}

function offsetsFor(order){
  if (order === 2) return [-GAP/2, GAP/2];
  if (order === 3) return [-GAP, 0, GAP];
  return [0];
}

export function buildBallStick(resolved, nucleusOf, track){
  const sticks = [];
  resolved.bonds.forEach(function(b){
    const a = nucleusOf(b.a), c = nucleusOf(b.b);
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const dir = c.clone().sub(a).normalize();
    const height = a.distanceTo(c);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const perp = perpOffset(dir);

    offsetsFor(b.order).forEach(function(off){
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS, RADIUS, height, 10), MATERIAL());
      mesh.position.copy(mid).add(perp.clone().multiplyScalar(off));
      mesh.quaternion.copy(quat);
      sticks.push(track(mesh));
    });
  });
  return sticks;
}
