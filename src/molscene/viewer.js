// Public entry point of the engine: takes molscene text and a DOM element,
// renders the 3D scene into it, and returns a small controller for the
// host page to drive (mode, play/pause, speed, which electron groups are
// visible) and to read a legend from. The host page owns its own UI chrome
// (buttons, panel layout) - this module only owns the canvas, and delegates
// to camera-controls.js / scene-build.js / electron-motion.js for anything
// beyond top-level wiring.

import * as THREE from 'three';
import { resolveMolscene } from './resolve.js';
import { ROLE_LABELS } from './roles.js';
import { makeDotTexture } from './orbitals.js';
import { buildAtomsAndConnectors, buildGroups } from './scene-build.js';
import { stepElectrons, applyVisibility } from './electron-motion.js';
import { createOrbitCamera } from './camera-controls.js';

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
  const orbitCamera = createOrbitCamera(camera, renderer.domElement);

  let sceneObjects = [];
  let groups = [];
  let mode = 'cloud';
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speedFactor = 1;
  let hiddenRoles = new Set();

  function clearScene(){
    sceneObjects.forEach(function(o){ scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    sceneObjects = [];
  }
  function track(o){ scene.add(o); sceneObjects.push(o); return o; }

  function load(text){
    clearScene();
    const resolved = resolveMolscene(text);
    if (resolved.errors.length){ groups = []; return resolved; }

    const nucleusOf = buildAtomsAndConnectors(scene, resolved, track, dotTexture);
    groups = buildGroups(scene, resolved, nucleusOf, track, dotTexture);

    orbitCamera.fitTo(resolved.atoms.map(function(a){ return a.pos; }), resolved.view);
    applyVisibility(groups, mode, hiddenRoles);
    return resolved;
  }

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function tick(){
    requestAnimationFrame(tick);
    orbitCamera.update();
    if (playing) stepElectrons(groups, mode, speedFactor, hiddenRoles);
    renderer.render(scene, camera);
  }
  tick();

  return {
    load,
    setMode: function(m){ mode = m; applyVisibility(groups, mode, hiddenRoles); },
    setPlaying: function(p){ playing = p; },
    setSpeed: function(f){ speedFactor = f; },
    setRoleHidden: function(role, hidden){ if (hidden) hiddenRoles.add(role); else hiddenRoles.delete(role); applyVisibility(groups, mode, hiddenRoles); },
    resetCamera: function(){ orbitCamera.reset(); },
    getLegend: function(){
      const seen = new Map();
      groups.forEach(function(g){
        if (!seen.has(g.role)) seen.set(g.role, { role: g.role, label: ROLE_LABELS[g.role] || g.role, color: '#' + g.color.getHexString(), count: 0 });
        seen.get(g.role).count += g.electrons.length;
      });
      return Array.from(seen.values());
    }
  };
}
