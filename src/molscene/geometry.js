// Framework-agnostic 3D vector helpers + the two geometry problems the
// engine needs to solve, both handled with the same tool:
//
// 1) Where do an atom's lone pairs / unpaired electrons point, given the
//    directions of its existing bonds? (VSEPR)
// 2) Where should an atom with no explicit position go, given where its
//    already-placed neighbor is and what else is already attached to it?
//
// Both are "spread N points on a sphere away from M fixed points" - the
// same physical idea VSEPR itself is named after (electron pairs minimizing
// mutual repulsion). Solving it with literal repulsion relaxation avoids a
// hand-authored table of tetrahedral/trigonal-bipyramidal/etc angles and
// generalizes to any steric number for free.

export function v3(x, y, z){ return { x, y, z }; }
export function add(a, b){ return v3(a.x+b.x, a.y+b.y, a.z+b.z); }
export function sub(a, b){ return v3(a.x-b.x, a.y-b.y, a.z-b.z); }
export function scale(a, s){ return v3(a.x*s, a.y*s, a.z*s); }
export function dot(a, b){ return a.x*b.x + a.y*b.y + a.z*b.z; }
export function cross(a, b){ return v3(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x); }
export function length(a){ return Math.sqrt(dot(a, a)); }
export function normalize(a){ const l = length(a); return l < 1e-9 ? v3(0,0,1) : scale(a, 1/l); }

// Deterministic point spread on a unit sphere (golden-angle spiral). Used
// as a reproducible starting guess for the relaxation below - reproducible
// on every reload is the point: a random seed here previously caused
// electrons/lone-pairs to occasionally start in an unrecoverable spot.
export function fibonacciSphere(n){
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++){
    const y = 1 - (i / Math.max(1, n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y*y));
    const theta = golden * i;
    pts.push(v3(Math.cos(theta)*r, y, Math.sin(theta)*r));
  }
  return pts;
}

// Solve `freeCount` unit directions that stay as far as possible from each
// other and from `fixedDirs` (which never move). This is what turns "this
// atom has 2 bonds and needs 2 lone pairs" into actual 3D directions.
export function solveDirections(fixedDirs, freeCount, iterations){
  iterations = iterations || 120;
  if (freeCount === 0) return [];

  const candidates = fibonacciSphere(freeCount + fixedDirs.length + 6);
  const free = [];
  for (const c of candidates){
    if (free.length >= freeCount) break;
    const tooClose = fixedDirs.concat(free).some(function(d){ return dot(d, c) > 0.97; });
    if (!tooClose) free.push(v3(c.x, c.y, c.z));
  }
  while (free.length < freeCount) free.push(fibonacciSphere(freeCount)[free.length]);

  for (let it = 0; it < iterations; it++){
    const rate = 0.2 * (1 - it/iterations);
    const forces = free.map(function(){ return v3(0,0,0); });
    for (let i = 0; i < free.length; i++){
      const others = fixedDirs.concat(free.filter(function(_, j){ return j !== i; }));
      let f = v3(0,0,0);
      for (const o of others){
        const diff = sub(free[i], o);
        const d2 = Math.max(dot(diff, diff), 0.02);
        f = add(f, scale(diff, 1/d2));
      }
      forces[i] = f;
    }
    for (let i = 0; i < free.length; i++){
      free[i] = normalize(add(free[i], scale(forces[i], rate)));
    }
  }
  return free;
}

// A stable local perpendicular frame for a bond axis, shared by both atoms
// of the bond (both calls receive the same `axisLine`, sign-independent),
// so their leftover p orbitals (used for pi bonds) line up automatically
// instead of needing a manual sign/orientation convention per molecule.
export function perpFrame(axisLine){
  const reference = Math.abs(axisLine.y) > 0.9 ? v3(1,0,0) : v3(0,1,0);
  const p1 = normalize(cross(axisLine, reference));
  const p2 = normalize(cross(axisLine, p1));
  return [p1, p2];
}

// Connected components of a graph given as a Map(node -> [neighbor, ...]).
// Every node passed in `nodes` gets a component, even with no edges (a
// singleton). Shared by metallic.js (which atoms share an electron sea)
// and clusters.js (which atoms belong to the same rigid molecule).
export function connectedComponents(nodes, adjacency){
  const seen = new Set();
  const components = [];
  nodes.forEach(function(id){
    if (seen.has(id)) return;
    const comp = []; const queue = [id]; seen.add(id);
    while (queue.length){
      const cur = queue.shift(); comp.push(cur);
      (adjacency.get(cur) || []).forEach(function(n){ if (!seen.has(n)){ seen.add(n); queue.push(n); } });
    }
    components.push(comp);
  });
  return components;
}
