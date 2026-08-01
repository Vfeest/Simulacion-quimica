# molscene — lenguaje declarativo para estructuras moleculares

`molscene` es a las estructuras moleculares lo que Mermaid es a los diagramas:
un texto corto y declarativo que describe *qué* hay (átomos, enlaces, cargas),
no *cómo dibujarlo*. El motor (`src/molscene/`) se encarga de inferir
hibridación, pares libres y geometría 3D, y de renderizarlo.

Pensado para que lo generen modelos de lenguaje: la gramática es tolerante
línea por línea (un error en una línea no rompe el resto), y los mensajes de
error están en español, con número de línea y una sugerencia concreta.

## Ejemplo mínimo

```molscene
molecule H2

atom A: H
atom B: H

bond A-B: single
```

## Ejemplo con hibridación, pares libres y carga

```molscene
molecule Agua

atom O: O
atom H1: H
atom H2: H

bond O-H1: single
bond O-H2: single
```

El motor calcula solo: O tiene 6 electrones de valencia, usa 2 en enlaces σ,
le sobran 4 → 2 pares libres → número estérico 4 → hibridación **sp3** →
geometría angular (~104.5°) resuelta por repulsión electrónica (VSEPR), sin
que el autor del texto tenga que calcular ningún ángulo ni eje.

## Gramática

Una instrucción por línea. `#` inicia un comentario. Líneas en blanco se
ignoran. Las palabras clave no distinguen mayúsculas/minúsculas.

```
molecule <nombre libre>

atom <id>: <Elemento> [charge <±entero>] [lonepairs <entero>] [at (x, y, z)]

bond <id>-<id>: <single|double|triple|ionic|hydrogen>

view [azimuth <rad>] [polar <rad>] [radius <unidades>]
```

- **`<id>`**: identificador corto (`\w+`), arbitrario, solo se usa para
  referenciar el átomo en `bond`.
- **`<Elemento>`**: símbolo químico soportado (ver `src/molscene/elements.js`
  para la lista exacta — actualmente H–Ca del grupo principal, más
  Br, I, y unos pocos metales de transición comunes sin soporte de
  orbitales d, ver "Limitaciones").
- **`charge`**: carga formal (afecta los electrones de valencia disponibles).
- **`lonepairs`**: fuerza el número de pares libres en vez de inferirlo del
  balance de electrones (para casos ambiguos o efectos didácticos).
- **`at (x, y, z)`**: posición 3D explícita, en unidades de radio de Bohr
  (a₀). Si se omite, el motor la calcula automáticamente a partir de la
  conectividad (ver "Auto-layout").
- **`bond` order**:
  - `single` / `double` / `triple`: enlace covalente, con 1/2/3 pares
    compartidos (σ, o σ+π, o σ+2π).
  - `ionic`: transferencia completa de electrones. No genera un orbital
    compartido; el electrón "vive" enteramente del lado aceptor (afecta el
    cálculo de pares libres de ambos átomos vía sus cargas). Se dibuja como
    conector punteado.
  - `hydrogen`: interacción débil, solo se dibuja como guía punteada; no
    consume electrones de ningún átomo.
- **`view`**: opcional, fija la cámara inicial en vez del encuadre
  automático.

## Qué infiere el motor automáticamente

Para cada átomo:

1. **Electrones de valencia** = valencia del elemento − carga.
2. **Dominios de enlace σ** = un enlace covalente cuenta 1, sin importar su
   orden (doble o triple siguen siendo un solo dominio: la molécula solo
   necesita *una* dirección para ese vecino).
3. **Pares libres** = lo que sobra de electrones de valencia tras restar los
   usados en enlaces, dividido 2. Un electrón sobrante sin pareja queda
   como **radical** (grupo de 1 electrón, para especies como NO).
4. **Número estérico** = dominios σ + pares libres → tabla estándar de
   hibridación (steric 2 → sp, 3 → sp2, 4 → sp3, 5 → sp3d, 6 → sp3d2).
   El hidrógeno y el helio nunca hibridan (usan su 1s puro), como en la
   química real.
5. **Direcciones 3D**: cada enlace σ apunta literalmente hacia el átomo
   vecino real. Los pares libres (y radicales) rellenan las direcciones
   restantes resolviendo un problema de repulsión mutua en la esfera
   unitaria — la misma idea física que le da nombre a VSEPR — en vez de
   usar una tabla de ángulos fija. Es determinista (mismo resultado en
   cada carga de la página).
6. **Orbitales π**: cada orden de enlace por encima de 1 añade un orbital p
   sin hibridar, perpendicular al eje del enlace, en un marco compartido
   por ambos átomos (para que sus lóbulos queden paralelos y se solapen
   constructivamente, sin necesidad de convención de signos manual).

## Auto-layout (posiciones automáticas)

Si un átomo no tiene `at (...)`, el motor lo ubica recorriendo el grafo de
enlaces en anchura desde el primer átomo declarado (o desde cualquier átomo
con posición explícita, si la hay): cada vecino nuevo se coloca a lo largo
de una de las direcciones libres del átomo ya ubicado, a la distancia de
enlace correspondiente (radios covalentes reales, con un factor de
acortamiento para enlaces dobles/triples).

Esto alcanza bien para cadenas y moléculas simples/ramificadas. Para anillos
o geometrías conocidas (que el cierre de un ciclo no puede resolver por sí
solo), especificá `at (x, y, z)` a mano en los átomos que lo necesiten —
podés mezclar átomos con y sin posición explícita en la misma molécula.

## Modos de visualización

El motor separa **qué es cada grupo de electrones** (resuelto por la
química) de **cómo se dibuja** (elegido por quien mira):

- **Nube**: muestreo Monte Carlo (Metropolis) de la densidad de
  probabilidad real |ψ|² de cada grupo. Es lo físicamente correcto, pero
  difuso — así se ven realmente los orbitales.
- **Atmósfera**: cada orbital es una envolvente sólida translúcida (una
  esfera para carácter s puro, un par de lóbulos elipsoidales asimétricos
  para carácter p/híbrido — el lóbulo grande crece con el carácter s
  mezclado, igual que un orbital sp/sp2/sp3 real), y cada electrón es una
  esfera opaca que se mueve al azar *confinada* dentro de su envolvente
  (sin peso probabilístico). Pensado para ser más fácil de leer de un
  vistazo.

Ambos modos comparten el mismo color por **rol** de grupo de electrones
(σ, π, π secundario, par libre, radical, transferido), no por molécula —
así el color siempre significa lo mismo sin importar qué se esté mirando.

## Limitaciones (roadmap)

Alcance actual: química general y orgánica de bloque principal (s/p),
enlace covalente simple/doble/triple, iónico, puente de hidrógeno,
hibridación sp/sp2/sp3/sp3d/sp3d2, radicales.

Deliberadamente fuera de esta versión:

- Orbitales d/f reales de metales de transición y teoría de campo
  cristalino (los metales de transición se pueden declarar y enlazar, pero
  sin lóbulos d auténticos).
- Enlace metálico / mar de electrones / teoría de bandas.
- Sistemas aromáticos deslocalizados (un anillo bencénico hoy se describe
  como enlaces alternados simples/dobles, no como una nube deslocalizada).
- Animaciones de reacciones (transición entre dos estructuras en el
  tiempo) — el DSL está pensado para poder agregar esto después (p. ej. un
  bloque `reaction { step ... }`), pero no existe todavía.

## Uso programático

```js
import { createViewer } from './src/molscene/viewer.js';

const viewer = createViewer(document.getElementById('canvas-container'));
const result = viewer.load(molsceneText); // { errors, warnings, name }
if (result.errors.length) {
  // mostrar result.errors (strings listos para el usuario) en vez de tirar
}
viewer.setMode('atmosphere');   // o 'cloud'
viewer.setPlaying(true);
viewer.setSpeed(1.2);
viewer.setRoleHidden('lone', true);
viewer.resetCamera();
viewer.getLegend(); // [{ role, label, color, count }] — para pintar la leyenda
```

Ver `demo/` para un reproductor completo (editor + selector de ejemplos +
controles) y `examples/*.molscene` para más casos resueltos.
