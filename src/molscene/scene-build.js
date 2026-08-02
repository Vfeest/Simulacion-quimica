// Turns a resolved scene model (resolve.js output) into actual Three.js
// objects: nuclei + labels + connector lines (static), and per-group
// bundles - static cloud points, atmosphere shell meshes, electron
// balls/glows, and the trail buffer they animate into (electron-motion.js
// updates these every frame; this file only allocates them once).

import * as THREE from 'three';
import { groupDensity, groupInside, makeLabelSprite, rejectionCloud, participantShellMeshes } from './orbitals.js';

export const CLOUD_N = 900, MAX_TRAIL = 16;

export function buildAtomsAndConnectors(scene, resolved, track, dotTexture){
  const positions = new Map(resolved.atoms.map(function(a){ return [a.id, new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z)]; }));
  const nucleusOf = function(id){ return positions.get(id); };

  resolved.atoms.forEach(function(a){
    const pos = nucleusOf(a.id);
    const sphere = track(new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 22, 22),
      new THREE.MeshStandardMaterial({ color: a.color, emissive: a.color, emissiveIntensity: 0.32, roughness: 0.45, metalness: 0.1 })
    ));
    sphere.position.copy(pos);
    const glow = track(new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture, color: a.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })));
    glow.position.copy(pos); glow.scale.set(0.5, 0.5, 1);
    const label = track(makeLabelSprite(a.id, '#e8ecf3'));
    label.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
  });

  resolved.connectors.forEach(function(c){
    const a = nucleusOf(c.a), b = nucleusOf(c.b);
    if (c.kind === 'metallic'){
      track(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x3f6f8f, transparent: true, opacity: 0.35 })));
      return;
    }
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineDashedMaterial({ color: 0x57647a, transparent: true, opacity: 0.6, dashSize: 0.08, gapSize: 0.06 });
    const line = track(new THREE.Line(geo, mat));
    line.computeLineDistances();
  });

  resolved.groups.filter(function(g){ return g.role === 'sigma'; }).forEach(function(g){
    const a = nucleusOf(g.participants[0].atomId), b = nucleusOf(g.participants[1].atomId);
    track(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x3a4a63, transparent: true, opacity: 0.25 })));
  });

  return nucleusOf;
}

export function buildGroups(scene, resolved, nucleusOf, track, dotTexture){
  return resolved.groups.map(function(g){
    const col = new THREE.Color(g.color);
    const participants = g.participants.map(function(p){
      return { atomId: p.atomId, sFrac: p.sFrac, radius: p.radius, a0: p.a0, axis: p.axis ? new THREE.Vector3(p.axis.x, p.axis.y, p.axis.z) : null };
    });
    const density = function(pos){ return groupDensity(pos, participants, nucleusOf); };
    const inside = function(pos){ return groupInside(pos, participants, nucleusOf); };
    const anchor = nucleusOf(participants[0].atomId).clone();

    const pts = participants.map(function(p){ return nucleusOf(p.atomId); });
    const min = pts[0].clone(), max = pts[0].clone();
    pts.forEach(function(p){ min.min(p); max.max(p); });
    min.subScalar(2.2); max.addScalar(2.2);

    const cloudPts = rejectionCloud(density, min, max, CLOUD_N);
    const positionsArr = new Float32Array(cloudPts.length * 3);
    cloudPts.forEach(function(p, i){ positionsArr[i*3]=p.x; positionsArr[i*3+1]=p.y; positionsArr[i*3+2]=p.z; });
    const cloudGeo = new THREE.BufferGeometry(); cloudGeo.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
    const cloudMat = new THREE.PointsMaterial({ size: 0.045, map: dotTexture, color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const cloudPoints = track(new THREE.Points(cloudGeo, cloudMat));

    const shellMeshes = [];
    participants.forEach(function(p){ shellMeshes.push.apply(shellMeshes, participantShellMeshes(p, nucleusOf(p.atomId), g.color, scene).map(track)); });

    const electrons = [];
    for (let i = 0; i < g.count; i++){
      const jitter = new THREE.Vector3((Math.random()-0.5)*0.12, (Math.random()-0.5)*0.12, (Math.random()-0.5)*0.12);
      const startPos = anchor.clone().add(jitter);
      const ball = track(new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 14), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.35 })));
      ball.position.copy(startPos);
      const eglow = track(new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture, color: col, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false })));
      eglow.scale.set(0.14, 0.14, 1); eglow.position.copy(startPos);
      const trail = new Array(MAX_TRAIL).fill(0).map(function(){ return startPos.clone(); });
      electrons.push({ pos: startPos, ball, glow: eglow, trail });
    }

    const trailTotal = g.count * MAX_TRAIL;
    const trailPositions = new Float32Array(trailTotal * 3), trailColors = new Float32Array(trailTotal * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    const trailMat = new THREE.PointsMaterial({ size: 0.05, map: dotTexture, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const trailPoints = track(new THREE.Points(trailGeo, trailMat));

    return { role: g.role, color: col, density, inside, anchor, cloudPoints, shellMeshes, electrons, trailPoints, trailPositions, trailColors };
  });
}
