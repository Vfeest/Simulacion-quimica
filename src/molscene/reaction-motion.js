// Drives a reaction's timeline (t: 0 -> 1). t < 0.5 is the approach: each
// reactant cluster eases from its own starting position toward the point
// where the product will appear. At t = 0.5 the clusters have exactly
// reached that point, so swapping their visibility for the (already-built,
// static) product's is a clean cut rather than a jump - punctuated with a
// brief flash so the "they just bonded" moment actually reads as an event,
// not a glitch.

function smoothstep(t){ return t * t * (3 - 2 * t); }

export const IMPACT_T = 0.5;

export function updateReactionRig(rig, t){
  const localT = Math.min(1, Math.max(0, t / IMPACT_T));
  const eased = smoothstep(localT);
  rig.clusterRigs.forEach(function(c){ c.group.position.lerpVectors(c.start, rig.convergence, eased); });

  const showProduct = t >= IMPACT_T;
  rig.clusterRigs.forEach(function(c){ c.group.visible = !showProduct; });
  rig.productRig.group.visible = showProduct;

  if (rig.flash){
    const d = Math.abs(t - IMPACT_T);
    rig.flash.material.opacity = d < 0.1 ? (1 - d / 0.1) * 0.85 : 0;
  }
}

export function activeReactionGroups(rig, t){
  if (t >= IMPACT_T) return rig.productRig.groups;
  const out = [];
  rig.clusterRigs.forEach(function(c){ out.push.apply(out, c.groups); });
  return out;
}
