# Simulación química

Motor de visualización molecular 3D en tiempo real: orbitales, electrones y
enlaces, descritos en un lenguaje de texto declarativo (**molscene**) para
que una IA pueda generarlos igual que genera un diagrama Mermaid.

Demo en vivo: **https://vfeest.github.io/Simulacion-quimica/demo/index.html**

- **`docs/molscene-spec.md`** — especificación completa del lenguaje: la
  parte pensada para que la lea una IA.
- **`docs/ai-integration.md`** — cómo usar el motor desde otra IA o sesión
  de chat (motor hospedado vs. bundle autocontenido, según qué peticiones
  de red le permitan al sandbox de destino).
- **`src/molscene/`** — el motor: parser → inferencia química (VSEPR /
  enlace de valencia simplificado) → geometría 3D → renderizado (Three.js).
- **`scripts/build-artifact.mjs`** / **`dist/`** — aplana `src/molscene/`
  en un único archivo sin módulos propios, para hosts que no pueden cargar
  el motor como ~19 archivos separados (ver `docs/ai-integration.md`).
  Regenerar con `npm run build:artifacts` tras tocar `src/molscene/` o
  `vendor/three/`.
- **`userscript/molscene-render.user.js`** — userscript de Tampermonkey:
  detecta un bloque de código molscene en cualquier chat de IA
  (claude.ai, ChatGPT, Gemini...) y renderiza la molécula justo debajo,
  sin que la IA necesite saber nada de este proyecto.
- **`extension/`** — lo mismo que el userscript, pero como extensión
  nativa de Chrome (Manifest V3, motor empaquetado adentro, sin depender
  de Tampermonkey ni de red en tiempo de render): oculta el bloque de
  código y lo reemplaza por el visor, con botón para copiar el texto
  original o volver a verlo.
- **`examples/*.molscene`** — moléculas de ejemplo (H₂, N₂, H₂O, NH₃, CH₄,
  CO₂, HCl, NaCl, cúmulo metálico, puente de hidrógeno, glucosa con
  descripción, y dos reacciones animadas: H₂ + Cl₂ → 2 HCl y
  2 H₂ + O₂ → 2 H₂O).
- **`demo/`** — reproductor interactivo: editor de texto, selector de
  ejemplos, tres modos de visualización (nube de probabilidad / atmósfera /
  bola-palito), reproducción de reacciones, controles.

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
covalentes simples/dobles/triples, iónicos, metálicos (mar de electrones
simplificado) y puente de hidrógeno, pares libres y radicales, y
animación de reacciones (dos moléculas — antes/después — con acercamiento
rígido y una transición fluida, sin corte brusco, en el instante de la
unión). No incluye
orbitales d/f reales de metales de transición, teoría de bandas, ni
sistemas aromáticos deslocalizados — detalle completo en la sección
"Limitaciones" de la spec.

## Estructura de `src/molscene/`

Cada archivo tiene una sola responsabilidad — pensado para que abrir uno
alcance para entenderlo, sin tener que cargar el resto del motor:

| Archivo | Responsabilidad |
|---|---|
| `elements.js` | Datos por elemento (valencia, radio covalente, color). |
| `parser.js` | Texto molscene → AST (átomos, enlaces, vista). |
| `chemistry.js` | Electrones de valencia → pares libres / radicales / hibridación por átomo. |
| `geometry.js` | Vectores + el solver de repulsión (VSEPR) + componentes conexas. |
| `layout.js` | Posiciones 3D automáticas cuando falta `at (...)`. |
| `bonds.js` | Enlaces covalentes → grupos σ/π (y la lista de enlaces con su orden, para bola-palito). |
| `ball-stick.js` | Modo bola-palito: un cilindro por enlace, sin electrones ni orbitales. |
| `lone-pairs.js` | Pares libres / radicales → grupos. |
| `metallic.js` | Cúmulos de enlace metálico → grupo de "mar de electrones". |
| `clusters.js` | Qué átomos forman una misma molécula rígida (para animar reacciones). |
| `roles.js` | Color y etiqueta de cada rol de grupo (única fuente de verdad). |
| `resolve.js` | Orquesta todo lo anterior → el modelo de escena resuelto (molécula o reacción). |
| `orbitals.js` | Matemática de orbitales (s/p/híbrido) y su malla 3D — no sabe nada de molscene. |
| `scene-build.js` | Modelo resuelto → objetos Three.js (núcleos, nubes, esferas). |
| `camera-controls.js` | Cámara orbital (arrastre, zoom, encuadre automático). |
| `electron-motion.js` | Simulación por cuadro + visibilidad por modo/rol. |
| `reaction-scene.js` | Construye los cuerpos rígidos de "reactants" y el producto de "products". |
| `reaction-motion.js` | Anima el acercamiento y el corte al instante de la unión. |
| `viewer.js` | Punto de entrada público: conecta todo lo anterior. |

## Vendored

`vendor/three/` y `vendor/fonts/` son dependencias vendorizadas (Three.js
r128 y las tipografías Fraunces / IBM Plex Sans / IBM Plex Mono) para que
el demo funcione sin depender de un CDN. Actualizar con
`npm pack three@<version>` y reemplazar `vendor/three/three.module.js`.
