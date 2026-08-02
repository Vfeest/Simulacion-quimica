// The rendering-facing orbital math: turns a resolved group/participant
// (see resolve.js) into either a probability density (for the "cloud"
// visualization mode) or a solid geometric envelope (for the "atmosphere"
// mode). Every participant is one of exactly two shapes:
//
//  - sFrac ~= 1 (pure s character - lone hydrogen, an unhybridized ion's
//    lone pair): a sphere. No axis needed.
//  - sFrac < 1 (some/all p character - a hybrid pointing at a bond or
//    lone pair, or a pure unhybridized p used for a pi bond): a pair of
//    ellipsoid lobes along `axis`, sized asymmetrically by how much s
//    character is mixed in (sFrac=0, a bare p orbital, comes out
//    perfectly symmetric; higher sFrac skews toward one big front lobe).
//
// That single rule is what lets one code path render an s orbital, a p
// orbital, and any sp^n hybrid without special-casing each one.

import * as THREE from 'three';

export const A0 = 1.0;
export const SPHERE_RADIUS = 1.1;
const LOBE_OFFSET = 0.38, LOBE_LONG = 0.72, LOBE_WIDE = 0.4;

export function isSpherical(sFrac){ return sFrac >= 0.999; }

function lobeParams(sFrac){
  return {
    frontOffset: LOBE_OFFSET * (1 + 0.4*sFrac), frontLong: LOBE_LONG * (1 + 0.35*sFrac), frontWide: LOBE_WIDE * (1 + 0.1*sFrac),
    backOffset: LOBE_OFFSET * (1 - 0.55*sFrac), backLong: LOBE_LONG * (1 - 0.55*sFrac), backWide: LOBE_WIDE * (1 - 0.25*sFrac)
  };
}

// psi for one participant: sFrac=1 reduces to a plain s orbital (axis-
// independent); sFrac=0 reduces to a plain symmetric p orbital.
export function psiParticipant(pos, nucleus, axis, sFrac, a0){
  a0 = a0 || A0;
  const d = pos.clone().sub(nucleus);
  const r = d.length();
  const t = axis ? d.dot(axis) : 0;
  const sPart = Math.sqrt(Math.max(0, sFrac));
  const pPart = Math.sqrt(Math.max(0, 1 - sFrac));
  return Math.exp(-r / a0) * (sPart + pPart * t);
}

export function groupDensity(pos, participants, nucleusOf){
  let psi = 0;
  for (const p of participants) psi += psiParticipant(pos, nucleusOf(p.atomId), p.axis, p.sFrac, p.a0);
  return psi * psi;
}

export function participantInside(pos, participant, nucleus){
  if (isSpherical(participant.sFrac)) return pos.distanceTo(nucleus) <= (participant.radius || SPHERE_RADIUS);
  const d = pos.clone().sub(nucleus);
  const t = d.dot(participant.axis);
  const perp = d.clone().sub(participant.axis.clone().multiplyScalar(t)).length();
  const L = lobeParams(participant.sFrac);
  const front = Math.pow((t - L.frontOffset)/L.frontLong, 2) + Math.pow(perp/L.frontWide, 2) <= 1;
  const back = Math.pow((t + L.backOffset)/L.backLong, 2) + Math.pow(perp/L.backWide, 2) <= 1;
  return front || back;
}

export function groupInside(pos, participants, nucleusOf){
  return participants.some(function(p){ return participantInside(pos, p, nucleusOf(p.atomId)); });
}

export function makeDotTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}

export function makeLabelSprite(text, color){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '700 ' + (text.length > 1 ? 66 : 88) + 'px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.34, 0.34, 1);
  return sp;
}

export function participantShellMeshes(participant, nucleus, colorHex, scene){
  const meshes = [];
  const mat = function(){ return new THREE.MeshPhysicalMaterial({ color: colorHex, transparent: true, opacity: 0.15, roughness: 0.3, metalness: 0, side: THREE.DoubleSide, depthWrite: false }); };

  if (isSpherical(participant.sFrac)){
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(participant.radius || SPHERE_RADIUS, 22, 22), mat());
    mesh.position.copy(nucleus);
    scene.add(mesh);
    return [mesh];
  }

  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1), participant.axis);
  const L = lobeParams(participant.sFrac);
  [
    { offset: L.frontOffset, long: L.frontLong, wide: L.frontWide },
    { offset: -L.backOffset, long: L.backLong, wide: L.backWide }
  ].forEach(function(lobe){
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 18), mat());
    mesh.position.copy(nucleus).add(participant.axis.clone().multiplyScalar(lobe.offset));
    mesh.quaternion.copy(quat);
    mesh.scale.set(lobe.wide, lobe.wide, lobe.long);
    scene.add(mesh);
    meshes.push(mesh);
  });
  return meshes;
}

export function randomInBox(min, max){
  return new THREE.Vector3(
    min.x + Math.random()*(max.x-min.x),
    min.y + Math.random()*(max.y-min.y),
    min.z + Math.random()*(max.z-min.z)
  );
}
function estimateMaxDensity(densityFn, boxMin, boxMax){
  let maxD = 0;
  for (let i=0;i<3000;i++){ const d = densityFn(randomInBox(boxMin,boxMax)); if (d>maxD) maxD=d; }
  return maxD*1.2 || 1e-9;
}
export function rejectionCloud(densityFn, boxMin, boxMax, count){
  const maxD = estimateMaxDensity(densityFn, boxMin, boxMax);
  const pts = []; let guard = 0;
  while (pts.length < count && guard < count*500){
    guard++;
    const p = randomInBox(boxMin, boxMax);
    if (Math.random()*maxD < densityFn(p)) pts.push(p);
  }
  return pts;
}

export function gaussianRandom(sigma){
  let u=0, v=0;
  while (u===0) u=Math.random();
  while (v===0) v=Math.random();
  return sigma * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}
export function randGaussVec(sigma){ return new THREE.Vector3(gaussianRandom(sigma), gaussianRandom(sigma), gaussianRandom(sigma)); }

export function metropolisStep(e, densityFn, sigma){
  const prop = e.pos.clone().add(randGaussVec(sigma));
  const dCur = densityFn(e.pos), dProp = densityFn(prop);
  if (dCur < 1e-10 || Math.random() < Math.min(1, dProp/dCur)) e.pos.copy(prop);
}

// Confined random walk for "atmosphere" mode, with self-recovery: if an
// electron is ever outside its own envelope (e.g. right after spawning),
// a tiny random step essentially never wanders back in on its own (the
// envelope is thin), which is what caused electrons to visibly freeze in
// earlier builds. Drifting deliberately toward a known-interior anchor
// point guarantees it always finds its way back.
export function confinedStep(e, group, sigma){
  if (!group.inside(e.pos)){
    const toAnchor = group.anchor.clone().sub(e.pos);
    const dist = toAnchor.length();
    const pull = Math.min(dist, Math.max(sigma*3, 0.05));
    if (dist > 1e-6) e.pos.add(toAnchor.multiplyScalar(pull/dist));
    return;
  }
  const prop = e.pos.clone().add(randGaussVec(sigma));
  if (group.inside(prop)) e.pos.copy(prop);
}
