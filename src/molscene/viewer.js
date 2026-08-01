// Public entry point of the engine: takes molscene text and a DOM element,
// renders the 3D scene into it, and returns a small controller for the
// host page to drive (mode, play/pause, speed, which electron groups are
// visible) and to read a legend from. The host page owns its own UI chrome
// (buttons, panel layout) - this module only owns the canvas.

import * as THREE from 'three';
import { resolveMolscene, ROLE_COLORS } from './resolve.js';
import {
  groupDensity, groupInside, makeDotTexture, makeLabelSprite,
  rejectionCloud, metropolisStep, confinedStep
} from './orbitals.js';
import { participantShellMeshes } from './orbitals.js';

const ROLE_LABELS = {
  sigma: 'Enlace σ (compartido)', pi1: 'Enlace π', pi2: 'Enlace π (2)',
  lone: 'Par libre', radical: 'Electrón desapareado', ionicLone: 'Electrón transferido (iónico)'
};

const CLOUD_N = 900, MAX_TRAIL = 16;

export function createViewer(container){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a10);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0x070a10, 1);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x8fa5c9, 0.55));
  const key = new THREE.PointLight(0xffffff, 1.1, 30); key.position.set(2.8, 3, 3.5); scene.add(key);
  const fill = new THREE.PointLight(0x5b7fd6, 0.35, 30); fill.position.set(-3, -2, -2); scene.add(fill);

  const dotTexture = makeDotTexture();
  let sceneObjects = [];
  let groups = [];
  let positions = new Map();
  let mode = 'cloud';
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speedFactor = 1;
  let hiddenRoles = new Set();

  let camAzimuth = 0.7, camPolar = 1.15, camRadius = 5.8;
  let targetAzimuth = camAzimuth, targetPolar = camPolar, targetRadius = camRadius;
  let orbitCenter = new THREE.Vector3(0, 0, 0);
  let defaults = { az: camAzimuth, pol: camPolar, rad: camRadius, center: orbitCenter.clone() };

  function clearScene(){
    sceneObjects.forEach(function(o){ scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    sceneObjects = [];
  }
  function track(o){ scene.add(o); sceneObjects.push(o); return o; }

  function nucleusOfFactory(positions){ return function(id){ return positions.get(id); }; }

  function load(text){
    clearScene();
    const resolved = resolveMolscene(text);
    if (resolved.errors.length){ groups = []; return resolved; }

    positions = new Map(resolved.atoms.map(function(a){ return [a.id, new THREE.Vector3(a.pos.x, a.pos.y, a.pos.z)]; }));
    const nucleusOf = nucleusOfFactory(positions);

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
      const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
      const mat = new THREE.LineDashedMaterial({ color: 0x57647a, transparent: true, opacity: 0.6, dashSize: 0.08, gapSize: 0.06 });
      const line = track(new THREE.Line(geo, mat));
      line.computeLineDistances();
    });
    resolved.groups.filter(function(g){ return g.role === 'sigma'; }).forEach(function(g){
      const a = nucleusOf(g.participants[0].atomId), b = nucleusOf(g.participants[1].atomId);
      track(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x3a4a63, transparent: true, opacity: 0.25 })));
    });

    groups = resolved.groups.map(function(g){
      const col = new THREE.Color(g.color);
      const participants = g.participants.map(function(p){
        return { atomId: p.atomId, sFrac: p.sFrac, axis: p.axis ? new THREE.Vector3(p.axis.x, p.axis.y, p.axis.z) : null };
      });
      const density = function(pos){ return groupDensity(pos, participants, nucleusOf); };
      const inside = function(pos){ return groupInside(pos, participants, nucleusOf); };
      const anchor = nucleusOf(participants[0].atomId).clone();

      const pts = participants.map(function(p){ return nucleusOf(p.atomId); });
      const min = pts[0].clone(), max = pts[0].clone();
      pts.forEach(function(p){ min.min(p); max.max(p); });
      min.subScalar(2.2); max.addScalar(2.2);

      const cloudPts = rejectionCloud(density, min, max, CLOUD_N);
      const positionsArr = new Float32Array(cloudPts.length*3);
      cloudPts.forEach(function(p,i){ positionsArr[i*3]=p.x; positionsArr[i*3+1]=p.y; positionsArr[i*3+2]=p.z; });
      const cloudGeo = new THREE.BufferGeometry(); cloudGeo.setAttribute('position', new THREE.BufferAttribute(positionsArr,3));
      const cloudMat = new THREE.PointsMaterial({ size:0.045, map:dotTexture, color:col, transparent:true, opacity:0.55, depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true });
      const cloudPoints = track(new THREE.Points(cloudGeo, cloudMat));

      const shellMeshes = [];
      participants.forEach(function(p){ shellMeshes.push.apply(shellMeshes, participantShellMeshes(p, nucleusOf(p.atomId), g.color, scene).map(track)); });

      const electrons = [];
      for (let i=0;i<g.count;i++){
        const jitter = new THREE.Vector3((Math.random()-0.5)*0.12,(Math.random()-0.5)*0.12,(Math.random()-0.5)*0.12);
        const startPos = anchor.clone().add(jitter);
        const ball = track(new THREE.Mesh(new THREE.SphereGeometry(0.05,14,14), new THREE.MeshStandardMaterial({ color:col, emissive:col, emissiveIntensity:0.55, roughness:0.35 })));
        ball.position.copy(startPos);
        const eglow = track(new THREE.Sprite(new THREE.SpriteMaterial({ map:dotTexture, color:col, transparent:true, opacity:0.42, blending:THREE.AdditiveBlending, depthWrite:false })));
        eglow.scale.set(0.14,0.14,1); eglow.position.copy(startPos);
        const trail = new Array(MAX_TRAIL).fill(0).map(function(){ return startPos.clone(); });
        electrons.push({ pos:startPos, ball, glow:eglow, trail });
      }

      const trailTotal = g.count * MAX_TRAIL;
      const trailPositions = new Float32Array(trailTotal*3), trailColors = new Float32Array(trailTotal*3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions,3));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors,3));
      const trailMat = new THREE.PointsMaterial({ size:0.05, map:dotTexture, vertexColors:true, transparent:true, opacity:0.9, depthWrite:false, blending:THREE.AdditiveBlending, sizeAttenuation:true });
      const trailPoints = track(new THREE.Points(trailGeo, trailMat));

      return { role: g.role, color: col, density, inside, anchor, cloudPoints, shellMeshes, electrons, trailPoints, trailPositions, trailColors };
    });

    fitCamera(resolved.atoms.map(function(a){ return a.pos; }), resolved.view);
    applyVisibility();
    return resolved;
  }

  function fitCamera(atomPositions, view){
    const centroid = new THREE.Vector3();
    atomPositions.forEach(function(p){ centroid.add(new THREE.Vector3(p.x, p.y, p.z)); });
    centroid.divideScalar(Math.max(1, atomPositions.length));

    let maxExtent = 2;
    atomPositions.forEach(function(p){ maxExtent = Math.max(maxExtent, centroid.distanceTo(new THREE.Vector3(p.x, p.y, p.z))); });

    const rad = (view && view.radius) || Math.max(3.6, maxExtent*2.6 + 2.2);
    defaults = { az: (view && view.azimuth) || 0.7, pol: (view && view.polar) || 1.15, rad, center: centroid };
    orbitCenter = centroid;
    camAzimuth = targetAzimuth = defaults.az;
    camPolar = targetPolar = defaults.pol;
    camRadius = targetRadius = defaults.rad;
  }

  function updateTrailGeometry(g){
    let w = 0;
    g.electrons.forEach(function(e){
      for (let i=0;i<MAX_TRAIL;i++){
        const p = e.trail[i]; const t = i/(MAX_TRAIL-1); const b = t*t;
        g.trailPositions[w*3]=p.x; g.trailPositions[w*3+1]=p.y; g.trailPositions[w*3+2]=p.z;
        g.trailColors[w*3]=g.color.r*b; g.trailColors[w*3+1]=g.color.g*b; g.trailColors[w*3+2]=g.color.b*b;
        w++;
      }
    });
    g.trailPoints.geometry.attributes.position.needsUpdate = true;
    g.trailPoints.geometry.attributes.color.needsUpdate = true;
  }

  function applyVisibility(){
    groups.forEach(function(g){
      const visible = !hiddenRoles.has(g.role);
      g.cloudPoints.visible = visible && mode === 'cloud';
      g.trailPoints.visible = visible && mode === 'cloud';
      g.shellMeshes.forEach(function(m){ m.visible = visible && mode === 'atmosphere'; });
      g.electrons.forEach(function(e){ e.ball.visible = visible; e.glow.visible = visible; });
    });
  }

  const dom = renderer.domElement;
  let dragging = false, lastX = 0, lastY = 0;
  dom.addEventListener('pointerdown', function(e){ dragging=true; lastX=e.clientX; lastY=e.clientY; dom.style.cursor='grabbing'; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointermove', function(e){
    if (!dragging) return;
    const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY;
    targetAzimuth -= dx*0.006; targetPolar = Math.max(0.2, Math.min(Math.PI-0.2, targetPolar - dy*0.006));
  });
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){ dom.addEventListener(ev, function(){ dragging=false; dom.style.cursor='grab'; }); });
  dom.style.cursor = 'grab';
  dom.addEventListener('wheel', function(e){ e.preventDefault(); targetRadius = Math.max(2, Math.min(16, targetRadius*(1+e.deltaY*0.001))); }, { passive:false });

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w/h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function tick(){
    requestAnimationFrame(tick);
    camAzimuth += (targetAzimuth-camAzimuth)*0.12;
    camPolar += (targetPolar-camPolar)*0.12;
    camRadius += (targetRadius-camRadius)*0.12;
    camera.position.set(
      orbitCenter.x + camRadius*Math.sin(camPolar)*Math.cos(camAzimuth),
      orbitCenter.y + camRadius*Math.cos(camPolar),
      orbitCenter.z + camRadius*Math.sin(camPolar)*Math.sin(camAzimuth)
    );
    camera.lookAt(orbitCenter);

    if (playing){
      const sigma = (mode === 'cloud' ? 0.16 : 0.1) * speedFactor;
      const substeps = Math.max(1, Math.round(2*speedFactor)+1);
      groups.forEach(function(g){
        if (hiddenRoles.has(g.role)) return;
        g.electrons.forEach(function(e){
          for (let s=0;s<substeps;s++){
            if (mode === 'cloud') metropolisStep(e, g.density, sigma);
            else confinedStep(e, g, sigma);
          }
          e.ball.position.copy(e.pos); e.glow.position.copy(e.pos);
          e.trail.push(e.pos.clone()); if (e.trail.length > MAX_TRAIL) e.trail.shift();
        });
        if (mode === 'cloud') updateTrailGeometry(g);
      });
    }
    renderer.render(scene, camera);
  }
  tick();

  return {
    load,
    setMode: function(m){ mode = m; applyVisibility(); },
    setPlaying: function(p){ playing = p; },
    setSpeed: function(f){ speedFactor = f; },
    setRoleHidden: function(role, hidden){ if (hidden) hiddenRoles.add(role); else hiddenRoles.delete(role); applyVisibility(); },
    resetCamera: function(){ targetAzimuth = defaults.az; targetPolar = defaults.pol; targetRadius = defaults.rad; orbitCenter.copy(defaults.center); },
    getLegend: function(){
      const seen = new Map();
      groups.forEach(function(g){ if (!seen.has(g.role)) seen.set(g.role, { role: g.role, label: ROLE_LABELS[g.role] || g.role, color: '#' + g.color.getHexString(), count: 0 }); seen.get(g.role).count += g.electrons.length; });
      return Array.from(seen.values());
    }
  };
}

export { ROLE_COLORS };
