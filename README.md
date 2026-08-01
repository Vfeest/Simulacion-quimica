# Simulación química

Motor de visualización molecular 3D en tiempo real: orbitales, electrones y
enlaces, descritos en un lenguaje de texto declarativo (**molscene**) para
que una IA pueda generarlos igual que genera un diagrama Mermaid.

- **`docs/molscene-spec.md`** — especificación completa del lenguaje: la
  parte pensada para que la lea una IA.
- **`src/molscene/`** — el motor: parser → inferencia química (VSEPR /
  enlace de valencia simplificado) → geometría 3D → renderizado (Three.js).
- **`examples/*.molscene`** — moléculas de ejemplo (H₂, N₂, H₂O, NH₃, CH₄,
  CO₂, HCl, NaCl, puente de hidrógeno).
- **`demo/`** — reproductor interactivo: editor de texto, selector de
  ejemplos, modo nube de probabilidad / modo atmósfera, controles.

## Probar el demo

Los módulos son ES modules nativos del navegador (sin bundler), así que
hace falta servirlos por HTTP — abrir `demo/index.html` directo con
`file://` no funciona por las políticas de módulos del navegador.

```bash
npx serve .
# o: python3 -m http.server 8000
```

y abrir `demo/index.html` (por ejemplo `http://localhost:3000/demo/`).

## Alcance de esta versión

Cubre bien química general y orgánica de bloque principal: orbitales s/p,
hibridación sp/sp2/sp3/sp3d/sp3d2 inferida automáticamente, enlaces
covalentes simples/dobles/triples, iónicos y puente de hidrógeno, pares
libres y radicales. No incluye orbitales d/f reales de metales de
transición, enlace metálico, ni sistemas aromáticos deslocalizados —
detalle completo en la sección "Limitaciones" de la spec.

## Vendored

`vendor/three/` y `vendor/fonts/` son dependencias vendorizadas (Three.js
r128 y las tipografías Fraunces / IBM Plex Sans / IBM Plex Mono) para que
el demo funcione sin depender de un CDN. Actualizar con
`npm pack three@<version>` y reemplazar `vendor/three/three.module.js`.
