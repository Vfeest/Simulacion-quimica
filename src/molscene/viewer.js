// Public entry point of the engine: takes molscene text and a DOM element,
// renders the 3D scene into it, and returns a small controller for the
// host page to drive (mode, play/pause, speed, which electron groups are
// visible, and - for a reaction - playback of the approach/bonding
// animation) and to read a legend from. The host page owns its own UI
// chrome; this module delegates to camera-controls.js / scene-build.js /
// electron-motion.js / reaction-scene.js / reaction-motion.js for anything
// beyond top-level wiring.

import * as THREE from 'three';
import { resolveMolscene } from './resolve.js';
import { ROLE_LABELS } from './roles.js';
import { makeDotTexture } from './orbitals.js';
import { buildAtomsAndConnectors, buildGroups } from './scene-build.js';
import { buildBallStick } from './ball-stick.js';
import { stepElectrons, applyVisibility, applyDecorMode } from './electron-motion.js';
import { createOrbitCamera } from './camera-controls.js';
import { buildClusterRigs, buildProductRig, centroidOf } from './reaction-scene.js';
import { updateReactionRig, activeReactionGroups } from './reaction-motion.js';

const REACTION_DURATION_S = 6;

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
  let staticGroups = [];
  let staticDecor = null;
  let reaction = null;
  let mode = 'cloud';
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speedFactor = 1;
  let hiddenRoles = new Set();

  function clearScene(){
    sceneObjects.forEach(function(o){ scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    sceneObjects = [];
  }
  function track(o){ scene.add(o); sceneObjects.push(o); return o; }
  function currentGroups(){ return reaction ? activeReactionGroups(reaction, reaction.t) : staticGroups; }
  function currentDecors(){
    if (!reaction) return staticDecor ? [staticDecor] : [];
    return reaction.clusterRigs.map(function(c){ return c.decor; }).concat([reaction.productRig.decor]);
  }
  function refreshVisibility(){
    applyVisibility(currentGroups(), mode, hiddenRoles);
    currentDecors().forEach(function(d){ applyDecorMode(d, mode); });
  }

  function makeFlash(){
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture, color: 0xffb454, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.set(0.7, 0.7, 1);
    return track(sprite);
  }

  function load(text){
    clearScene();
    const resolved = resolveMolscene(text);
    if (resolved.errors.length){ staticGroups = []; staticDecor = null; reaction = null; return resolved; }

    if (resolved.kind === 'reaction'){
      const convergence = centroidOf(resolved.reactants.atoms);
      const clusterRigs = buildClusterRigs(resolved.reactants, track, dotTexture);
      const productRig = buildProductRig(resolved.products, track, dotTexture, convergence);
      const flash = makeFlash();
      flash.position.copy(convergence);
      reaction = { clusterRigs, productRig, convergence, flash, t: 0, playing: false };
      staticGroups = []; staticDecor = null;
      updateReactionRig(reaction, 0);
      orbitCamera.fitTo(resolved.reactants.atoms.map(function(a){ return a.pos; }), resolved.reactants.view || resolved.products.view);
    } else {
      reaction = null;
      const built = buildAtomsAndConnectors(resolved, track, dotTexture);
      staticGroups = buildGroups(resolved, built.nucleusOf, track, dotTexture);
      const stickMeshes = buildBallStick(resolved, built.nucleusOf, track);
      staticDecor = { nucleiSpheres: built.nucleiSpheres, sigmaGuideLines: built.sigmaGuideLines, stickMeshes };
      orbitCamera.fitTo(resolved.atoms.map(function(a){ return a.pos; }), resolved.view);
    }
    refreshVisibility();
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

  let lastTime = performance.now();
  function tick(){
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    orbitCamera.update();

    if (reaction && reaction.playing){
      reaction.t = Math.min(1, reaction.t + dt / REACTION_DURATION_S);
      if (reaction.t >= 1) reaction.playing = false;
      updateReactionRig(reaction, reaction.t);
      refreshVisibility();
    }
    if (playing) stepElectrons(currentGroups(), mode, speedFactor, hiddenRoles);

    renderer.render(scene, camera);
  }
  tick();

  return {
    load,
    setMode: function(m){ mode = m; refreshVisibility(); },
    setPlaying: function(p){ playing = p; },
    setSpeed: function(f){ speedFactor = f; },
    setRoleHidden: function(role, hidden){ if (hidden) hiddenRoles.add(role); else hiddenRoles.delete(role); refreshVisibility(); },
    resetCamera: function(){ orbitCamera.reset(); },
    isReaction: function(){ return !!reaction; },
    playReaction: function(){ if (!reaction) return; reaction.t = 0; reaction.playing = true; updateReactionRig(reaction, 0); refreshVisibility(); },
    setReactionProgress: function(t){ if (!reaction) return; reaction.playing = false; reaction.t = Math.min(1, Math.max(0, t)); updateReactionRig(reaction, reaction.t); refreshVisibility(); },
    getReactionProgress: function(){ return reaction ? reaction.t : 0; },
    getLegend: function(){
      const seen = new Map();
      currentGroups().forEach(function(g){
        if (!seen.has(g.role)) seen.set(g.role, { role: g.role, label: ROLE_LABELS[g.role] || g.role, color: '#' + g.color.getHexString(), count: 0 });
        seen.get(g.role).count += g.electrons.length;
      });
      return Array.from(seen.values());
    }
  };
}
