// Orbit camera: drag to rotate, scroll to zoom, smoothed toward a target
// (azimuth, polar, radius, center) rather than snapping - both user drags
// and fitTo()/reset() calls just move the target, tick() eases toward it.

import * as THREE from 'three';

export function createOrbitCamera(camera, domElement){
  let azimuth = 0.7, polar = 1.15, radius = 5.8;
  let targetAzimuth = azimuth, targetPolar = polar, targetRadius = radius;
  let center = new THREE.Vector3(0, 0, 0);
  let defaults = { azimuth, polar, radius, center: center.clone() };

  let dragging = false, lastX = 0, lastY = 0;
  domElement.addEventListener('pointerdown', function(e){
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    domElement.style.cursor = 'grabbing'; domElement.setPointerCapture(e.pointerId);
  });
  domElement.addEventListener('pointermove', function(e){
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
    targetAzimuth -= dx * 0.006;
    targetPolar = Math.max(0.2, Math.min(Math.PI - 0.2, targetPolar - dy * 0.006));
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(ev){
    domElement.addEventListener(ev, function(){ dragging = false; domElement.style.cursor = 'grab'; });
  });
  domElement.style.cursor = 'grab';
  domElement.addEventListener('wheel', function(e){
    e.preventDefault();
    targetRadius = Math.max(2, Math.min(16, targetRadius * (1 + e.deltaY * 0.001)));
  }, { passive: false });

  function fitTo(atomPositions, view){
    const centroid = new THREE.Vector3();
    atomPositions.forEach(function(p){ centroid.add(new THREE.Vector3(p.x, p.y, p.z)); });
    centroid.divideScalar(Math.max(1, atomPositions.length));

    let maxExtent = 2;
    atomPositions.forEach(function(p){ maxExtent = Math.max(maxExtent, centroid.distanceTo(new THREE.Vector3(p.x, p.y, p.z))); });

    const rad = (view && view.radius) || Math.max(3.6, maxExtent * 2.6 + 2.2);
    defaults = { azimuth: (view && view.azimuth) || 0.7, polar: (view && view.polar) || 1.15, radius: rad, center: centroid };
    center = centroid;
    azimuth = targetAzimuth = defaults.azimuth;
    polar = targetPolar = defaults.polar;
    radius = targetRadius = defaults.radius;
  }

  function reset(){
    targetAzimuth = defaults.azimuth; targetPolar = defaults.polar; targetRadius = defaults.radius;
    center.copy(defaults.center);
  }

  function update(){
    azimuth += (targetAzimuth - azimuth) * 0.12;
    polar += (targetPolar - polar) * 0.12;
    radius += (targetRadius - radius) * 0.12;
    camera.position.set(
      center.x + radius * Math.sin(polar) * Math.cos(azimuth),
      center.y + radius * Math.cos(polar),
      center.z + radius * Math.sin(polar) * Math.sin(azimuth)
    );
    camera.lookAt(center);
  }

  return { fitTo, reset, update };
}
