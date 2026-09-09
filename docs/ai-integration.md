# Usar molscene desde otra IA / sesión de chat

Este documento es para una IA (o quien la esté configurando) que quiere que
sus respuestas incluyan visualizaciones moleculares con este motor, en vez
de solo texto. Hay tres caminos, según dónde corra el artifact/página que
la IA genera - **elegí uno según el sandbox del host**, no son
intercambiables:

| | Camino A — motor hospedado | Camino B — bundle autocontenido | Camino C — userscript |
|---|---|---|---|
| Cuándo usarlo | El host puede cargar scripts desde `vfeest.github.io` (una web propia, un IDE, la mayoría de herramientas de IA para código) | El host bloquea toda petición de red saliente salvo a orígenes preaprobados (p. ej. los artifacts de claude.ai) | Querés que funcione en **cualquier** chat de IA (claude.ai, ChatGPT, Gemini...) sin que esa IA arme nada especial - solo que escriba el código molscene |
| Qué se pega | 5 líneas | El motor completo, una vez | Nada — se instala una vez en el navegador |
| Se actualiza solo con nuevos pushes al repo | Sí | No — hay que regenerar el bundle | Sí (el shell se descarga en cada carga de página) |
| Requiere que la IA sepa de este proyecto | Sí | Sí | No — alcanza con que escriba un bloque de código molscene, algo que ya hace por sí sola si se le pide "mostrame esto en molscene" |

## Camino A: motor hospedado (GitHub Pages)

El motor vive en `https://vfeest.github.io/Simulacion-quimica/src/molscene/`
como módulos ES nativos, cargables por `import` desde cualquier página que
pueda hacer peticiones de red a ese origen:

```html
<script type="importmap">
{ "imports": { "three": "https://vfeest.github.io/Simulacion-quimica/vendor/three/three.module.js" } }
</script>
<div id="stage" style="width:100%;height:480px;"></div>
<script type="module">
  import { createViewer } from 'https://vfeest.github.io/Simulacion-quimica/src/molscene/viewer.js';
  const viewer = createViewer(document.getElementById('stage'));
  const resolved = viewer.load(`
molecule H2

atom A: H
atom B: H

bond A-B: single
`);
  if (resolved.errors.length) console.error(resolved.errors);
</script>
```

Esto es lo que usa `demo/index.html` en el propio repo. Sirve para: una
página propia, un notebook/IDE con webview, cualquier herramienta de IA que
genere HTML con salida a internet sin restricción de CSP.

**No sirve para los artifacts de claude.ai**: ese sandbox corre con un CSP
estricto que bloquea peticiones a *cualquier* host externo (nada de
`<script src="https://...">` ni `import` de una URL) — no es que
`vfeest.github.io` esté fuera de una lista blanca, es que no hay lista
blanca de hosts arbitrarios en absoluto. Para eso está el Camino B.

## Camino B: bundle autocontenido (claude.ai y sandboxes similares)

`scripts/build-artifact.mjs` aplana `src/molscene/*.js` (mismo código,
sin cambios de lógica) en un único archivo sin `import`/`export` entre
módulos propios, en dos formatos ya generados en `dist/` (regenerar con
`npm run build:artifacts` tras tocar `src/molscene/` o `vendor/three/`):

- **`dist/molscene-engine.module.js`** — un módulo ES fusionado que
  conserva `import * as THREE from 'three'` y expone
  `export { createViewer, ROLE_LABELS, resolveMolscene }`. Pensado para
  cuando el host **ya trae three.js preinstalado como paquete** — que es
  el caso de los artifacts de tipo React de claude.ai (three.js está en su
  lista de paquetes disponibles para `import`). ~62 KB.
- **`dist/molscene-standalone-template.html`** — un HTML de una sola pieza
  con three.js *también* inlineado como variable global (sin `import` de
  ningún tipo, cero peticiones de red). Sirve en cualquier sandbox, incluso
  uno sin three.js preinstalado, a costa de pesar ~1.2 MB porque incluye
  three.js entero como texto. Tiene un bloque
  `<script id="molscene-source" type="text/plain">` bien delimitado al
  final, pensado para editar solo ese bloque al cambiar de molécula.

### Configurar un Proyecto de claude.ai para que renderice solo

1. Creá un Proyecto en claude.ai.
2. En **Project knowledge**, subí estos dos archivos del repo:
   - `docs/molscene-spec.md` (el lenguaje: gramática, qué infiere el motor,
     modos, reacciones)
   - `dist/molscene-engine.module.js` (el motor aplanado)
3. Pegá esto en **Custom instructions** del proyecto:

   > Cuando el usuario pida ver una molécula, un enlace o una reacción
   > química, generá un artifact de React que importe three.js
   > (`import * as THREE from 'three'`), pegue el contenido completo de
   > `molscene-engine.module.js` (adjunto en el proyecto) tal cual está,
   > y luego un componente que llame a `createViewer(ref.current)` y
   > `viewer.load(texto_molscene)` en un `useEffect`, escribiendo el texto
   > molscene según la gramática de `molscene-spec.md` (también adjunto).
   > No reescribas ni resumas el motor: es código ya probado, se copia
   > entero. Agregá botones para los 3 modos (`cloud`/`atmosphere`/
   > `ballstick`) y, si `viewer.isReaction()`, un botón "reproducir
   > reacción". Si `resolved.description` no está vacío, mostralo como
   > texto explicativo junto a la escena.

4. A partir de ahí, cualquier chat dentro del proyecto puede pedir
   "mostrame la molécula de X" y Claude arma el artifact solo.

**Costo real de esto**: el motor pesa ~62 KB (~15-16 mil tokens). Eso se
paga *una vez* la primera vez que Claude arma un artifact en la
conversación; si el usuario sigue pidiendo moléculas distintas en el mismo
hilo, Claude puede editar el artifact existente (cambiar solo el texto
molscene y la lógica de UI) en vez de repetir el motor entero cada vez. Es
barato comparado con `molscene-standalone-template.html` (~1.2 MB, ~300 mil
tokens de solo three.js) — por eso el Camino B usa el three.js
*preinstalado* del host en vez de reinlinearlo, siempre que se pueda.

Si el host de destino no tiene three.js disponible como paquete (poco
probable en claude.ai, posible en otros clones de este flujo), usá
`molscene-standalone-template.html` como base en su lugar — mismo patrón,
pero sin depender de nada preinstalado.

## Camino C: userscript (funciona en cualquier chat, sin configurar nada del lado de la IA)

Los caminos A y B necesitan que la IA "sepa" de este proyecto (Project
knowledge, instrucciones a medida). El Camino C da vuelta el problema: en
vez de enseñarle al chat a construir el visor, un userscript de
Tampermonkey vigila la página y arma el visor él mismo apenas detecta un
bloque de código que es molscene — igual que muchos chats ya renderizan un
diagrama Mermaid con solo ver un bloque ` ```mermaid `. Ya no importa si es
claude.ai, ChatGPT o Gemini: alcanza con pedirle a la IA "mostrame esto en
molscene" (o directamente pegarle `docs/molscene-spec.md`) y que la
respuesta traiga un bloque de código con esa gramática.

**Instalación**: instalar la extensión [Tampermonkey](https://www.tampermonkey.net/)
y luego abrir `https://vfeest.github.io/Simulacion-quimica/userscript/molscene-render.user.js`
— Tampermonkey detecta el encabezado `// ==UserScript==` y ofrece
instalarlo directo. Ya viene con `@match` para claude.ai, ChatGPT y
Gemini; agregar más sitios es una línea (`@match https://tu-sitio/*`).

**Cómo detecta el bloque**: no depende de que el sitio marque el lenguaje
del bloque de código (cada uno lo hace distinto, o no lo hace) — en vez de
eso, `userscript/molscene-render.user.js` mira el *contenido*: si la
primera línea no vacía y no-comentario empieza con `molecule` o
`reaction`, y en algún lado aparece `atom ...:` o `reactants`, lo trata
como molscene. Con un `MutationObserver` reacciona también a texto que
todavía se está transmitiendo en streaming (espera ~500 ms sin cambios
antes de renderizar, y vuelve a renderizar si el texto sigue cambiando).

**Cómo renderiza sin pisar el CSP del sitio**: crea un `<iframe
sandbox="allow-scripts">` con su propio documento (`srcdoc`) — no
inyecta nada en el DOM del host más que ese iframe, así que el CSP del
sitio (claude.ai, ChatGPT, etc.) no aplica al contenido de adentro, y el
`sandbox` evita que ese contenido pueda leer el DOM/cookies del sitio
anfitrión. Ese documento interno es el mismo bundle autocontenido del
Camino B, pero generado con `--mode=shell` (`dist/molscene-shell.html`):
igual que `molscene-standalone-template.html`, salvo que en vez de una
molécula fija trae un placeholder `{{MOLSCENE_SOURCE}}` que el userscript
reemplaza por el texto de cada bloque que encuentra. Se descarga una sola
vez por carga de página (vía `GM_xmlhttpRequest`, que no está sujeto al
CSP de la página) y se reutiliza para todos los bloques.

## Qué NO hace ninguno de los tres caminos

Ninguno mantiene el artifact sincronizado con cambios futuros del motor
por sí solo, salvo A y C (ambos apuntan siempre a la última versión en
`main`/GitHub Pages). El Camino B congela una copia en el momento en que
se generó el bundle — si `src/molscene/` cambia, hay que correr
`npm run build:artifacts` de nuevo y volver a subir el archivo actualizado
al Project knowledge.
