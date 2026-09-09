/**
 * Coreografía del operario de 8 bits del hero.
 *
 * Portado desde el proyecto de Claude Design (`ladder-hero.jsx`), pero SIN el
 * motor de autoría `animations-v3`: aquella pieza arrastra barra de reproducción,
 * envoltorio svg/foreignObject para exportar vídeo, localStorage y atajos de
 * teclado — todo eso no pinta nada en una web de producción. Aquí queda sólo lo
 * que importa: la escena como función pura del tiempo.
 *
 * Se conservan tal cual del diseño original: los sprites, la paleta, la
 * geometría de la escalera, las tres curvas de easing y los tiempos de cada
 * sección. Se deja fuera la cámara (hacía zoom sobre la página entera: eso sí
 * sería tocar el hero) y el `HeroWall`, porque el muro es la página real.
 *
 * Todo se calcula en el espacio de diseño de 1920x1080 y se escala luego, así
 * que el operario y la escalera caen donde caían en la animación.
 */

/* ------------------------------------------------------------------ *
 * Espacio de diseño
 * ------------------------------------------------------------------ */

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

/** Suelo de la escena: se ancla al borde inferior del hero. */
export const FLOOR = 680;

/** Centro de la escalera: 86,5 % del ancho, como en el diseño. */
export const LADDER_CX = 1660;

/** Lado del píxel del sprite, en unidades de diseño. */
export const PIXEL = 8;

/**
 * Cuánto se encoge la escena respecto al diseño original.
 *
 * El diseño ocupaba el ancho completo de 1920, lo que en la página real deja un
 * operario y una escalera demasiado presentes para un hero. Este factor los
 * reduce SIN moverlos: el anclaje (base de la escalera) se mantiene en el mismo
 * punto, así que sólo cambia el tamaño. Es la perilla para seguir ajustando.
 */
export const HERO_SCALE = 0.62;

/** La escalera se ancla siempre a este porcentaje del ancho, como en el diseño. */
export const ANCHOR_X_RATIO = LADDER_CX / DESIGN_WIDTH;

/* ------------------------------------------------------------------ *
 * Paleta y sprites (copiados del diseño, sin retocar)
 * ------------------------------------------------------------------ */

export const INK = '#0B1220';
export const ORANGE = '#F97316';

export const PAL: Readonly<Record<string, string>> = Object.freeze({
  k: INK,
  h: ORANGE,
  H: '#C2410C',
  s: '#F0C39A',
  b: '#2E4C6D',
  t: '#DCE6EC',
  g: '#C6CFD8',
  G: '#8794A1',
  w: '#8B5A2B',
  o: '#141F2B'
});

const HEAD = [
  '....hhhh....',
  '...hhhhhh...',
  '..hhhhhhhh..',
  '.kkkkkkkkkk.',
  '...ssssss...',
  '...ksskss...',
  '...ssssss...',
  '....ssss....'
];
const TORSO = ['..tttttttt..', '..tbbbbbbt..', '..tbbbbbbt..', '...bbbbbb...', '...bbbbbb...'];
const L_STAND = ['...bb..bb...', '...bb..bb...', '..ooo..ooo..'];
const L_WALKA = ['...bb..bb...', '..bb....bb..', '.ooo....ooo.'];
const L_WALKB = ['....bbbb....', '....bbbb....', '...oooooo...'];
const L_CLIMB = ['..bbb..bb...', '..b....bb...', '..oo...ooo..'];

export const POSES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  stand: [...HEAD, ...TORSO, ...L_STAND],
  walkA: [...HEAD, ...TORSO, ...L_WALKA],
  walkB: [...HEAD, ...TORSO, ...L_WALKB],
  climb: [...HEAD, ...TORSO, ...L_CLIMB]
});

export type PoseName = 'stand' | 'walkA' | 'walkB' | 'climb';

export const ARM = ['......gggg', 'sssswwgggg', '......gggg'];

/** El sprite mide 12x16 píxeles de sprite. */
export const SPRITE_W = 12;
export const SPRITE_H = 16;

/* ------------------------------------------------------------------ *
 * Tiempo
 * ------------------------------------------------------------------ */

export interface Scene {
  name: string;
  dur: number;
  desc: string;
}

/** Las secciones del diseño, con sus duraciones originales. */
export const HERO_SCENES: readonly Scene[] = Object.freeze([
  { name: 'Llegada', dur: 3.6, desc: 'El operario entra caminando desde la izquierda' },
  { name: 'Escalera', dur: 1.2, desc: 'Se detiene ante la escalera y comprueba el travesaño' },
  { name: 'Subida', dur: 2.2, desc: 'Sube peldaño a peldaño' },
  { name: 'Martillazos', dur: 2.8, desc: 'Martillea la pared: el titular se sacude y salta cascote' },
  { name: 'Salida', dur: 2.2, desc: 'Baja deslizando y sale por la derecha' }
]);

const derivarCues = (scenes: readonly Scene[]) => {
  const tabla: Record<string, number> = {};
  let acumulado = 0;
  for (const escena of scenes) {
    if (!(escena.name in tabla)) tabla[escena.name] = Math.round(acumulado * 1000) / 1000;
    acumulado += escena.dur;
  }
  return { cues: Object.freeze(tabla), total: Math.round(acumulado * 1000) / 1000 };
};

const { cues: CUES_MUTABLE, total: TOTAL } = derivarCues(HERO_SCENES);

/** Instante en que arranca cada sección, en segundos. */
export const CUES: Readonly<Record<string, number>> = CUES_MUTABLE;

/** Duración de una pasada completa, en segundos. */
export const HERO_DURATION = TOTAL;

/* ------------------------------------------------------------------ *
 * Curvas (las tres del diseño y nada más)
 * ------------------------------------------------------------------ */

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1);
const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInQuad = (t: number) => t * t;
const easeOutQuad = (t: number) => t * (2 - t);

interface TweenOptions {
  from: number;
  to: number;
  start: number;
  end: number;
}

const tween = (o: TweenOptions, ease: (t: number) => number) => (t: number) => {
  if (t <= o.start) return o.from;
  if (t >= o.end) return o.to;
  return o.from + (o.to - o.from) * ease((t - o.start) / (o.end - o.start));
};

const MOTION = {
  glide: (o: TweenOptions) => tween(o, easeInOutCubic),
  settle: (o: TweenOptions) => tween(o, easeOutExpo),
  snap: (o: TweenOptions) => tween(o, easeInQuad)
};

const mezcla = (u: number, a: number, b: number, ease: (t: number) => number = (t) => t) =>
  a + (b - a) * ease(clamp(u, 0, 1));

/* ------------------------------------------------------------------ *
 * Geometría de la escalera
 * ------------------------------------------------------------------ */

export interface Geometria {
  S: number;
  railW: number;
  gap: number;
  left: number;
  top: number;
  hinge: number;
  standX: number;
  rungs: number[];
  levels: number[];
}

/** Escalera proporcionada al cuerpo: paso de peldaño = 5 píxeles de sprite. */
export function geo(px: number = PIXEL): Geometria {
  const S = 5 * px;
  const railW = 2 * px;
  const gap = 8 * px;
  const rungs: number[] = [];
  const levels: number[] = [];
  for (let k = 1; k <= 8; k++) rungs.push(FLOOR - k * S);
  for (let i = 0; i <= 6; i++) levels.push(FLOOR - i * S);
  return {
    S,
    railW,
    gap,
    left: LADDER_CX - (gap + railW) / 2,
    top: FLOOR - 9 * S,
    hinge: FLOOR - 4.5 * S,
    standX: LADDER_CX - 9 * px,
    rungs,
    levels
  };
}

/* ------------------------------------------------------------------ *
 * Encaje en la página
 * ------------------------------------------------------------------ */

export interface Layout {
  /** Factor que va de espacio de diseño a píxeles de pantalla. */
  scale: number;
  /** Desplazamiento del contenedor, en píxeles de pantalla. */
  tx: number;
  ty: number;
  /** x de diseño donde arranca el operario, ya fuera de cuadro. */
  entryX: number;
  /** Metros de diseño que recorre al marcharse, hasta salir de cuadro. */
  exitDistance: number;
}

/** Holgura, en píxeles de pantalla, con la que entra y sale de cuadro. */
const OFFSCREEN_MARGIN = 24;

/**
 * Sitúa la escena en un contenedor de `width` x `height`.
 *
 * Dos anclajes fijos, sea cual sea la escala:
 *   - la base de la escalera cae en ANCHOR_X_RATIO del ancho (86,5 %, la del
 *     diseño);
 *   - el suelo cae EXACTAMENTE en el borde inferior del contenedor, sin margen
 *     ni relleno de por medio.
 *
 * La entrada y la salida se recalculan a partir del ancho real, de modo que el
 * operario aparece y desaparece fuera de cuadro por pequeña que sea la escena.
 * Sin esto, encoger la escena lo haría materializarse de la nada a media página.
 */
export function layout(width: number, height: number, size: number = HERO_SCALE): Layout {
  const scale = (width / DESIGN_WIDTH) * size;
  if (!(scale > 0)) {
    return { scale: 0, tx: 0, ty: 0, entryX: -140, exitDistance: 1160 };
  }

  const tx = ANCHOR_X_RATIO * width - LADDER_CX * scale;
  const ty = height - FLOOR * scale;
  const medioSprite = (SPRITE_W * PIXEL) / 2;

  return {
    scale,
    tx,
    ty,
    entryX: -medioSprite - (tx + OFFSCREEN_MARGIN) / scale,
    exitDistance: (width + OFFSCREEN_MARGIN - tx) / scale + medioSprite - LADDER_CX
  };
}

/** Ruido determinista para el cascote: mismo índice, misma esquirla. */
export const rnd = (i: number): number => {
  const x = Math.sin(i * 127.1 + 3.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ------------------------------------------------------------------ *
 * El fotograma
 * ------------------------------------------------------------------ */

export interface Jolt {
  x: number;
  y: number;
  r: number;
}

export interface Frame {
  /** Posición del operario en espacio de diseño (x centrado, y a los pies). */
  x: number;
  y: number;
  pose: PoseName;
  /** 1 mira a la derecha, -1 a la izquierda. */
  facing: number;
  /** Ángulo del brazo, en grados. */
  arm: number;
  /** Retroceso vertical del cuerpo en el impacto. */
  recoil: number;
  /** Sacudida que se traslada al titular del hero. */
  jolt: Jolt;
  /** Balanceo de la escalera, en grados. */
  sway: number;
  /** Instantes de impacto del martillo, en segundos absolutos. */
  impacts: readonly number[];
  /** Punto de impacto en espacio de diseño. */
  impactX: number;
  impactY: number;
}

const HAMMER_CYCLE = 0.6;

/** Los cuatro martillazos de la sección "Martillazos". */
export function impactTimes(): number[] {
  const inicio = CUES.Martillazos + 0.15;
  const fin = CUES.Martillazos + 2.55;
  const golpes: number[] = [];
  for (let n = 1; n <= 4; n++) {
    const t = inicio + HAMMER_CYCLE * n;
    if (t <= fin + 0.1) golpes.push(Math.round(t * 1000) / 1000);
  }
  return golpes;
}

const IMPACTS = Object.freeze(impactTimes());

export interface FrameOptions {
  /** Escala la sacudida. 0 la apaga por completo. */
  shake?: number;
  /** Lado del píxel del sprite, en espacio de diseño. */
  px?: number;
  /** Dónde arranca el operario. Lo calcula `layout()` a partir del ancho real. */
  entryX?: number;
  /** Cuánto se aleja al marcharse. También sale de `layout()`. */
  exitDistance?: number;
}

/** La escena entera en el instante T, como función pura. */
export function frameAt(T: number, options: FrameOptions = {}): Frame {
  const shake = options.shake ?? 1;
  const px = options.px ?? PIXEL;
  const entryX = options.entryX ?? -140;
  const exitDistance = options.exitDistance ?? 1160;

  const g = geo(px);
  const TOPL = g.levels[6];
  const STAND_X = g.standX;
  const cArr = CUES.Escalera;
  const cSub = CUES.Subida;
  const cHam = CUES.Martillazos;
  const cOut = CUES.Salida;

  const walkIn = MOTION.settle({ from: entryX, to: STAND_X, start: 0, end: cArr })(T);
  const walkOut = MOTION.glide({ from: 0, to: exitDistance, start: cOut + 0.9, end: HERO_DURATION - 0.05 })(T);

  // Subida: escalones discretos, no un deslizamiento continuo.
  const cp = MOTION.glide({ from: 0, to: 1, start: cSub, end: cHam - 0.15 })(T);
  const step = Math.min(6, Math.floor(cp * 7));
  const slide = MOTION.snap({ from: 0, to: 1, start: cOut, end: cOut + 0.75 })(T);

  const hamStart = cHam + 0.15;
  const hamEnd = cHam + 2.55;
  const hammering = T >= hamStart && T <= hamEnd;

  let armB = 60;
  let arm = 0;
  if (hammering) {
    const ph = ((T - hamStart) % HAMMER_CYCLE) / HAMMER_CYCLE;
    arm =
      ph < 0.72
        ? mezcla(ph / 0.72, 40, -104, easeOutQuad)
        : mezcla((ph - 0.72) / 0.28, -104, 40, easeInQuad);
  } else if (T > cArr && T < cSub) {
    const ph = clamp((T - cArr) / (cSub - cArr), 0, 1);
    arm = Math.sin(ph * Math.PI) * -34;
  }

  // Sacudida: cada impacto arranca una oscilación que se apaga en 0,3 s.
  let amp = 0;
  for (const ti of IMPACTS) {
    const t = T - ti;
    if (t >= 0 && t < 0.3) amp = Math.max(amp, (1 - t / 0.3) * Math.cos(t * 62));
  }
  amp *= shake;
  const jolt: Jolt = { x: amp * 11, y: amp * 8, r: amp * 0.4 };

  let x: number;
  let y: number;
  let pose: PoseName;
  let facing = 1;

  if (T < cArr) {
    x = walkIn;
    y = FLOOR + Math.abs(Math.sin(T * Math.PI * 5.5)) * -5;
    pose = Math.floor(T * 7) % 2 ? 'walkA' : 'walkB';
    armB = 62 + Math.sin(T * Math.PI * 5.5) * 10;
  } else if (T < cSub) {
    x = STAND_X;
    y = FLOOR;
    pose = 'stand';
  } else if (T < cHam) {
    x = mezcla(clamp((T - cSub) / 0.3, 0, 1), STAND_X, LADDER_CX, easeOutQuad);
    y = g.levels[step];
    pose = step % 2 ? 'climb' : 'stand';
    armB = 78;
  } else if (T < cOut) {
    x = LADDER_CX;
    y = TOPL;
    pose = 'stand';
    facing = -1;
  } else if (slide < 1) {
    x = LADDER_CX;
    y = mezcla(slide, TOPL, FLOOR);
    pose = 'climb';
    armB = 84;
  } else {
    x = LADDER_CX + walkOut;
    y = FLOOR + Math.abs(Math.sin(T * Math.PI * 5.5)) * -5;
    pose = Math.floor(T * 7) % 2 ? 'walkA' : 'walkB';
    armB = 62 + Math.sin(T * Math.PI * 5.5) * 10;
  }

  if (!hammering && !(T > cArr && T < cSub)) arm = armB;

  return {
    x,
    y,
    pose,
    facing,
    arm,
    recoil: amp * px * 0.8,
    jolt,
    // La escalera sólo se mueve por los golpes: un balanceo perpetuo en un hero
    // sería justo el tipo de movimiento que molesta.
    sway: amp * 0.35,
    impacts: IMPACTS,
    impactX: LADDER_CX - 11 * px,
    impactY: TOPL - 6.5 * px
  };
}

/* ------------------------------------------------------------------ *
 * Ritmo de reproducción
 * ------------------------------------------------------------------ */

/** Espera antes de la primera pasada, para que no arranque encima del scroll. */
export const HERO_START_DELAY_MS = 1400;

/** Pausa entre pasadas. Larga a propósito: el hero no es un cartel parpadeante. */
export const HERO_IDLE_MS = 22000;

/**
 * Pasadas por visita. Se para sola: es un guiño al llegar, no un bucle que
 * compite con el contenido durante toda la sesión.
 */
export const HERO_MAX_RUNS = 3;

/** Las sombras de un sprite, como cadena de `box-shadow`. */
export function spriteShadow(rows: readonly string[], px: number): string {
  const partes: string[] = [];
  rows.forEach((fila, y) => {
    for (let x = 0; x < fila.length; x++) {
      const c = fila[x];
      if (c === '.') continue;
      partes.push(`${x * px}px ${y * px}px 0 0 ${PAL[c]}`);
    }
  });
  return partes.join(',');
}
