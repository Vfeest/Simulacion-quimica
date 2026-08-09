// Drives a reaction's timeline (t: 0 -> 1). Approach (t < 0.5): each
// reactant cluster eases toward the point where the product will appear.
// Around that same midpoint, instead of an instant visibility swap, the
// reactant clusters shrink toward their own centroid while the (already
// built, static) product grows from its centroid, overlapping - the two
// read as dissolving into one another rather than a hard cut, with a
// small, brief, warm-toned spark (not a flash) marking the instant.

function smoothstep(t){ return t * t * (3 - 2 * t); }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

const APPROACH_END = 0.5;
const MORPH_START = 0.42, MORPH_END = 0.58;
export const IMPACT_T = 0.5;

export function updateReactionRig(rig, t){
  const approach = smoothstep(clamp01(t / APPROACH_END));
  rig.clusterRigs.forEach(function(c){ c.group.position.lerpVectors(c.start, rig.convergence, approach); });

  const morph = smoothstep(clamp01((t - MORPH_START) / (MORPH_END - MORPH_START)));
  const clusterScale = Math.max(0.001, 1 - morph);
  rig.clusterRigs.forEach(function(c){
    c.group.scale.setScalar(clusterScale);
    c.group.visible = clusterScale > 0.002;
  });
  const productScale = Math.max(0.001, morph);
  rig.productRig.group.scale.setScalar(productScale);
  rig.productRig.group.visible = productScale > 0.002;

  if (rig.flash){
    const d = Math.abs(t - IMPACT_T);
    const w = 0.09;
    rig.flash.material.opacity = d < w ? (1 - d / w) * 0.35 : 0;
  }
}

export function activeReactionGroups(rig, t){
  if (t >= IMPACT_T) return rig.productRig.groups;
  const out = [];
  rig.clusterRigs.forEach(function(c){ out.push.apply(out, c.groups); });
  return out;
}
