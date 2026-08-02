// Per-frame simulation: advances every visible group's electrons (Metropolis
// sampling in "cloud" mode, confined random walk in "atmosphere" mode - both
// from orbitals.js), refreshes their fading trail geometry, and applies
// mode/role visibility to the objects scene-build.js allocated.

import { metropolisStep, confinedStep } from './orbitals.js';
import { MAX_TRAIL } from './scene-build.js';

function updateTrailGeometry(g){
  let w = 0;
  g.electrons.forEach(function(e){
    for (let i = 0; i < MAX_TRAIL; i++){
      const p = e.trail[i]; const t = i / (MAX_TRAIL - 1); const b = t * t;
      g.trailPositions[w*3]=p.x; g.trailPositions[w*3+1]=p.y; g.trailPositions[w*3+2]=p.z;
      g.trailColors[w*3]=g.color.r*b; g.trailColors[w*3+1]=g.color.g*b; g.trailColors[w*3+2]=g.color.b*b;
      w++;
    }
  });
  g.trailPoints.geometry.attributes.position.needsUpdate = true;
  g.trailPoints.geometry.attributes.color.needsUpdate = true;
}

export function stepElectrons(groups, mode, speedFactor, hiddenRoles){
  const sigma = (mode === 'cloud' ? 0.16 : 0.1) * speedFactor;
  const substeps = Math.max(1, Math.round(2 * speedFactor) + 1);
  groups.forEach(function(g){
    if (hiddenRoles.has(g.role)) return;
    g.electrons.forEach(function(e){
      for (let s = 0; s < substeps; s++){
        if (mode === 'cloud') metropolisStep(e, g.density, sigma); else confinedStep(e, g, sigma);
      }
      e.ball.position.copy(e.pos); e.glow.position.copy(e.pos);
      e.trail.push(e.pos.clone()); if (e.trail.length > MAX_TRAIL) e.trail.shift();
    });
    if (mode === 'cloud') updateTrailGeometry(g);
  });
}

export function applyVisibility(groups, mode, hiddenRoles){
  groups.forEach(function(g){
    const visible = !hiddenRoles.has(g.role);
    g.cloudPoints.visible = visible && mode === 'cloud';
    g.trailPoints.visible = visible && mode === 'cloud';
    g.shellMeshes.forEach(function(m){ m.visible = visible && mode === 'atmosphere'; });
    g.electrons.forEach(function(e){ e.ball.visible = visible; e.glow.visible = visible; });
  });
}
