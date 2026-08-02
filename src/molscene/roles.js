// What each electron-group role means: its color (used by every group
// builder) and its legend label (used by the host page). Kept as one file
// so "what does this color mean" always has a single source of truth.

export const ROLE_COLORS = {
  sigma: 0xffb454,
  pi1: 0x4cd6c2,
  pi2: 0xe07de0,
  lone: 0x9d8cf0,
  radical: 0xff6b6b,
  ionicLone: 0xff7fb0,
  metallic: 0x6fd1ff
};

export const ROLE_LABELS = {
  sigma: 'Enlace σ (compartido)',
  pi1: 'Enlace π',
  pi2: 'Enlace π (2)',
  lone: 'Par libre',
  radical: 'Electrón desapareado',
  ionicLone: 'Electrón transferido (iónico)',
  metallic: 'Mar de electrones (metálico)'
};
