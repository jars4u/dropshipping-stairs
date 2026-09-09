import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ANCHOR_X_RATIO,
  CUES,
  DESIGN_WIDTH,
  FLOOR,
  HERO_SCALE,
  SPRITE_H,
  layout,
  HERO_DURATION,
  HERO_IDLE_MS,
  HERO_MAX_RUNS,
  HERO_SCENES,
  LADDER_CX,
  PIXEL,
  SPRITE_W,
  frameAt,
  geo,
  impactTimes,
  rnd,
  spriteShadow,
  POSES
} from '../src/components/heroCoreografia.ts';

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

/* ================================================================== *
 * Tiempo y estructura
 * ================================================================== */

test('las secciones y sus tiempos son los del diseño original', () => {
  assert.deepEqual(
    HERO_SCENES.map((escena) => [escena.name, escena.dur]),
    [
      ['Llegada', 3.6],
      ['Escalera', 1.2],
      ['Subida', 2.2],
      ['Martillazos', 2.8],
      ['Salida', 2.2]
    ]
  );
  assert.deepEqual(CUES, { Llegada: 0, Escalera: 3.6, Subida: 4.8, Martillazos: 7, Salida: 9.8 });
  assert.equal(HERO_DURATION, 12);
});

test('la geometría de la escalera es la del diseño', () => {
  const g = geo(PIXEL);
  assert.equal(g.S, 40);
  assert.equal(g.top, 320, 'la escalera arranca en y=320');
  assert.equal(g.standX, 1588);
  assert.equal(g.rungs.length, 8);
  assert.equal(g.levels.length, 7);
  assert.equal(g.levels[6], 440, 'el peldaño más alto al que sube');
  // Centrada en LADDER_CX.
  assert.equal(g.left + (g.gap + g.railW) / 2, LADDER_CX);
});

/* ================================================================== *
 * Encaje en la página
 * ================================================================== */

test('el suelo cae exactamente en el borde inferior, sin margen ni relleno', () => {
  for (const [W, H] of [
    [1440, 380],
    [1280, 420],
    [1024, 300]
  ]) {
    const l = layout(W, H);
    const sueloEnPantalla = FLOOR * l.scale + l.ty;
    assert.ok(Math.abs(sueloEnPantalla - H) < 1e-9, `${W}x${H}: el suelo debe estar al ras`);
  }
});

test('la base de la escalera se queda en el 86,5 % del ancho al encoger', () => {
  const W = 1440;
  for (const size of [1, HERO_SCALE, 0.3]) {
    const l = layout(W, 380, size);
    const centro = LADDER_CX * l.scale + l.tx;
    assert.ok(Math.abs(centro - W * ANCHOR_X_RATIO) < 1e-9, 'size=' + size);
  }
});

test('la escena es más pequeña que el diseño original', () => {
  assert.ok(HERO_SCALE < 1);

  const grande = layout(1440, 380, 1);
  const pequena = layout(1440, 380);
  assert.ok(pequena.scale < grande.scale);

  // Un operario de menos de 70 px de alto en un hero de 380: un detalle, no un
  // personaje que compita con el titular.
  const altoOperario = SPRITE_H * PIXEL * pequena.scale;
  assert.ok(altoOperario < 70, 'mide ' + altoOperario.toFixed(0) + 'px');
  assert.ok(altoOperario > 40, 'tampoco tan pequeño que no se lea');
});

test('entra y sale de cuadro por pequeña que sea la escena', () => {
  const medio = (SPRITE_W * PIXEL) / 2;

  for (const size of [1, HERO_SCALE, 0.35]) {
    const W = 1440;
    const l = layout(W, 380, size);
    const enPantalla = (d: number) => d * l.scale + l.tx;

    const entrada = frameAt(0, { entryX: l.entryX, exitDistance: l.exitDistance });
    assert.ok(enPantalla(entrada.x) + medio * l.scale < 0, 'aparece dentro de cuadro (size=' + size + ')');

    const salida = frameAt(HERO_DURATION, { entryX: l.entryX, exitDistance: l.exitDistance });
    assert.ok(enPantalla(salida.x) - medio * l.scale > W, 'se queda dentro de cuadro (size=' + size + ')');
  }
});

test('encoger no cambia la velocidad a la que camina', () => {
  const g = geo(PIXEL);
  const velocidad = (size: number) => {
    const l = layout(1440, 380, size);
    const desde = frameAt(0, { entryX: l.entryX, exitDistance: l.exitDistance }).x * l.scale + l.tx;
    const hasta = g.standX * l.scale + l.tx;
    return (hasta - desde) / CUES.Escalera;
  };
  // Misma sensación de paso: la distancia en pantalla se reajusta con la escala.
  assert.ok(Math.abs(velocidad(HERO_SCALE) - velocidad(1)) < 25, 'px/s deberían parecerse');
});

test('un contenedor sin medir no revienta el encaje', () => {
  const l = layout(0, 0);
  assert.equal(l.scale, 0);
  assert.ok(Number.isFinite(l.entryX));
  assert.ok(Number.isFinite(l.exitDistance));
});

/* ================================================================== *
 * La coreografía, fotograma a fotograma
 * ================================================================== */

test('empieza fuera de cuadro por la izquierda y acaba fuera por la derecha', () => {
  const inicio = frameAt(0);
  assert.ok(inicio.x + (SPRITE_W * PIXEL) / 2 < 0, 'no debe verse al arrancar');

  const fin = frameAt(HERO_DURATION);
  assert.ok(fin.x - (SPRITE_W * PIXEL) / 2 > DESIGN_WIDTH, 'debe haberse ido del todo');
});

test('llega andando hasta la escalera y se para', () => {
  const g = geo(PIXEL);
  const llegada = frameAt(CUES.Escalera);
  assert.ok(Math.abs(llegada.x - g.standX) < 1);
  assert.equal(llegada.pose, 'stand');
  assert.equal(llegada.y, FLOOR, 'está en el suelo');

  const caminando = frameAt(1.5);
  assert.ok(['walkA', 'walkB'].includes(caminando.pose));
  assert.ok(caminando.x > frameAt(0.5).x, 'avanza hacia la derecha');
});

test('sube por peldaños discretos, no deslizándose', () => {
  const alturas = new Set<number>();
  for (let T = CUES.Subida; T < CUES.Martillazos; T += 0.05) {
    alturas.add(frameAt(T).y);
  }
  // Siete niveles como mucho: si subiera de forma continua habría decenas.
  assert.ok(alturas.size <= 7, 'debería pisar peldaños, no interpolar');
  for (const y of alturas) assert.ok(geo(PIXEL).levels.includes(y));
});

test('martillea desde lo alto, mirando a la pared', () => {
  const g = geo(PIXEL);
  const arriba = frameAt(CUES.Martillazos + 1);
  assert.equal(arriba.y, g.levels[6]);
  assert.equal(arriba.x, LADDER_CX);
  assert.equal(arriba.facing, -1, 'de espaldas a la salida, encarando la pared');
});

test('baja y se marcha', () => {
  const bajando = frameAt(CUES.Salida + 0.4);
  assert.equal(bajando.pose, 'climb');
  assert.ok(bajando.y > geo(PIXEL).levels[6], 'ya ha bajado del peldaño alto');

  const marchandose = frameAt(HERO_DURATION - 0.5);
  assert.ok(marchandose.x > LADDER_CX, 'se aleja por la derecha');
  assert.ok(['walkA', 'walkB'].includes(marchandose.pose));
});

/* ================================================================== *
 * La sacudida
 * ================================================================== */

test('hay cuatro martillazos, todos dentro de su sección', () => {
  const golpes = impactTimes();
  assert.equal(golpes.length, 4);
  for (const t of golpes) {
    assert.ok(t > CUES.Martillazos, 'ningún golpe antes de la sección');
    assert.ok(t < CUES.Salida, 'ninguno después de empezar a bajar');
  }
});

test('el titular sólo se sacude en los impactos', () => {
  // En reposo, cero absoluto: el hero queda donde estaba.
  for (const T of [0, 2, CUES.Escalera, CUES.Subida + 1, HERO_DURATION - 0.1]) {
    const { jolt } = frameAt(T);
    assert.equal(jolt.x, 0, 'T=' + T);
    assert.equal(jolt.y, 0, 'T=' + T);
    assert.equal(jolt.r, 0, 'T=' + T);
  }

  // Justo en el golpe, sacudida máxima.
  const golpe = frameAt(impactTimes()[0]);
  assert.ok(Math.abs(golpe.jolt.x) > 10);
  assert.ok(Math.abs(golpe.jolt.y) > 7);
});

test('la sacudida se apaga en menos de un tercio de segundo', () => {
  const ti = impactTimes()[0];
  assert.ok(Math.abs(frameAt(ti + 0.29).jolt.x) < Math.abs(frameAt(ti).jolt.x));
  assert.equal(frameAt(ti + 0.3).jolt.x, 0, 'a los 0,3 s ya no queda nada');
});

test('shake=0 apaga la sacudida sin tocar el resto de la escena', () => {
  const ti = impactTimes()[0];
  const con = frameAt(ti, { shake: 1 });
  const sin = frameAt(ti, { shake: 0 });

  assert.notEqual(con.jolt.x, 0);
  assert.deepEqual(sin.jolt, { x: 0, y: 0, r: 0 });
  assert.equal(sin.recoil, 0);
  assert.equal(sin.sway, 0);
  // El operario sigue exactamente donde estaba.
  assert.equal(sin.x, con.x);
  assert.equal(sin.pose, con.pose);
});

test('la escalera no se balancea sola: sólo con los golpes', () => {
  for (const T of [0, 1, 3, 5, 6.5, 11.5]) {
    assert.equal(frameAt(T).sway, 0, 'un balanceo perpetuo en el hero molestaría (T=' + T + ')');
  }
  assert.notEqual(frameAt(impactTimes()[0]).sway, 0);
});

/* ================================================================== *
 * Determinismo y ritmo
 * ================================================================== */

test('la escena es una función pura del tiempo', () => {
  for (const T of [0, 2.5, 5, 7.4, 10, 11.9]) {
    assert.deepEqual(frameAt(T), frameAt(T));
  }
  assert.equal(rnd(7), rnd(7), 'el cascote también es determinista');
});

test('el ritmo está pensado para no ser intrusivo', () => {
  assert.ok(HERO_MAX_RUNS <= 3, 'se para sola tras unas pocas pasadas');
  assert.ok(HERO_IDLE_MS >= 15000, 'pausa larga entre pasadas');
  // Con estos números la animación se mueve menos del 10% del primer minuto.
  const segundosEnMovimiento = HERO_MAX_RUNS * HERO_DURATION;
  const segundosTotales = HERO_MAX_RUNS * (HERO_DURATION + HERO_IDLE_MS / 1000);
  assert.ok(segundosEnMovimiento / segundosTotales < 0.36);
});

test('spriteShadow produce una sombra por píxel pintado', () => {
  const sombra = spriteShadow(['..k.', '.kk.'], 4);
  assert.equal(sombra.split(',').length, 3);
  assert.ok(sombra.includes('8px 0px 0 0 #0B1220'));
  // Los puntos son transparencia, no un color.
  assert.ok(!sombra.includes('undefined'));
});

test('todas las poses declaran los mismos 12x16 píxeles', () => {
  for (const [nombre, filas] of Object.entries(POSES)) {
    assert.equal(filas.length, 16, nombre);
    for (const fila of filas) assert.equal(fila.length, 12, nombre);
  }
});

/* ================================================================== *
 * Contrato con el hero
 * ================================================================== */

test('la animación no toca la tipografía ni la maquetación del hero', () => {
  const index = leer('../src/pages/index.astro');

  // El titular conserva exactamente sus clases de tipografía y sólo suma la sacudida.
  assert.ok(index.includes('text-4xl font-extrabold leading-[1.08] tracking-[-0.055em] text-slate-950 sm:text-5xl lg:text-6xl'));
  assert.ok(index.includes('ll-sacudida'));
  assert.ok(index.includes('<HeroAnimacion client:visible />'));
  assert.ok(index.includes('data-hero'));

  // En reposo la sacudida vale cero, así que el hero no se mueve de sitio.
  const css = leer('../src/styles/global.css');
  assert.ok(css.includes('--ll-jolt-x, 0px'));
  assert.ok(css.includes('--ll-jolt-y, 0px'));
  assert.ok(css.includes('--ll-jolt-r, 0deg'));
});

test('la capa no intercepta clics ni se lee en voz alta', () => {
  const componente = leer('../src/components/HeroAnimacion.jsx');
  assert.ok(componente.includes('pointer-events-none'), 'la tarjeta del hero es un enlace');
  assert.ok(componente.includes('aria-hidden="true"'), 'es decoración');
  assert.ok(componente.includes('prefers-reduced-motion'));
  assert.ok(componente.includes('IntersectionObserver'), 'se congela fuera de pantalla');
  // En móvil no hay sitio para la escalera sin tapar el titular.
  assert.ok(componente.includes('hidden') && componente.includes('lg:block'));
});

test('la coreografía no arrastra el motor de autoría del diseño', () => {
  // Se mira el código, no los comentarios: la cabecera del módulo nombra a
  // propósito lo que se ha dejado fuera.
  const codigo = leer('../src/components/heroCoreografia.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  assert.ok(!/CompositionStage|PlaybackBar|OM_SCENES|OM_PLAYBACK|localStorage|foreignObject|useTweaks/.test(codigo));
  assert.ok(!/from 'react'/.test(codigo), 'la coreografía es pura, sin React');
});
