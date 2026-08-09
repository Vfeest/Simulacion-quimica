// Builds the Three.js objects for a reaction's two phases:
//
//  - one rigid THREE.Group per original reactant molecule (a "cluster",
//    see clusters.js), each holding its own static nuclei/orbitals built
//    in local coordinates around that molecule's centroid, so animating
//    the group's position moves the whole molecule as one rigid piece
//    (see reaction-motion.js for the actual approach animation);
//  - one static group for the resolved product structure, shifted so its
//    centroid lands wherever the reactant clusters are converging to.
//
// Both reuse buildAtomsAndConnectors/buildGroups unchanged - a "local"
// resolved model (atoms re-centered on an origin, groups/connectors
// filtered to the relevant atoms) looks exactly like a normal resolved
// molecule to those functions.

import * as THREE from 'three';
import { buildAtomsAndConnectors, buildGroups } from './scene-build.js';
import { buildBallStick } from './ball-stick.js';
import { computeClusters } from './clusters.js';

function centroidOf(atoms){
  const v = new THREE.Vector3();
  atoms.forEach(function(a){ v.add(new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z)); });
  return v.divideScalar(Math.max(1, atoms.length));
}

function localize(resolved, ids, origin){
  const idSet = new Set(ids);
  const atoms = resolved.atoms.filter(function(a){ return idSet.has(a.id); }).map(function(a){
    return { id: a.id, element: a.element, charge: a.charge, color: a.color,
      pos: { x: a.pos.x - origin.x, y: a.pos.y - origin.y, z: a.pos.z - origin.z } };
  });
  const groups = resolved.groups.filter(function(g){ return g.participants.every(function(p){ return idSet.has(p.atomId); }); });
  const connectors = resolved.connectors.filter(function(c){ return idSet.has(c.a) && idSet.has(c.b); });
  const bonds = resolved.bonds.filter(function(b){ return idSet.has(b.a) && idSet.has(b.b); });
  return { atoms, groups, connectors, bonds };
}

function buildRig(resolved, ids, origin, track, dotTexture){
  const group = new THREE.Group();
  group.position.copy(origin);
  track(group);
  const localTrack = function(o){ group.add(o); return o; };
  const local = localize(resolved, ids, origin);
  const built = buildAtomsAndConnectors(local, localTrack, dotTexture);
  const groups = buildGroups(local, built.nucleusOf, localTrack, dotTexture);
  const stickMeshes = buildBallStick(local, built.nucleusOf, localTrack);
  const decor = { nucleiSpheres: built.nucleiSpheres, sigmaGuideLines: built.sigmaGuideLines, stickMeshes };
  return { group, groups, decor };
}

export function buildClusterRigs(resolved, track, dotTexture){
  return computeClusters(resolved).map(function(ids){
    const origin = centroidOf(resolved.atoms.filter(function(a){ return ids.indexOf(a.id) !== -1; }));
    const rig = buildRig(resolved, ids, origin, track, dotTexture);
    return { group: rig.group, groups: rig.groups, decor: rig.decor, start: origin.clone() };
  });
}

export function buildProductRig(resolved, track, dotTexture, convergencePoint){
  const allIds = resolved.atoms.map(function(a){ return a.id; });
  const origin = centroidOf(resolved.atoms);
  const rig = buildRig(resolved, allIds, origin, track, dotTexture);
  rig.group.position.copy(convergencePoint);
  return rig;
}

export { centroidOf };
