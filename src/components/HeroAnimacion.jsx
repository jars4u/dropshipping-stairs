import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ARM,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  FLOOR,
  HERO_DURATION,
  HERO_IDLE_MS,
  HERO_MAX_RUNS,
  HERO_START_DELAY_MS,
  LADDER_CX,
  layout,
  ORANGE,
  PAL,
  PIXEL,
  POSES,
  SPRITE_H,
  SPRITE_W,
  clamp,
  frameAt,
  geo,
  rnd,
  spriteShadow
} from './heroCoreografia.ts';

const G = geo(PIXEL);

/** Las cadenas de box-shadow son caras de construir y no cambian nunca. */
const SOMBRAS = {
  stand: spriteShadow(POSES.stand, PIXEL),
  walkA: spriteShadow(POSES.walkA, PIXEL),
  walkB: spriteShadow(POSES.walkB, PIXEL),
  climb: spriteShadow(POSES.climb, PIXEL),
  arm: spriteShadow(ARM, PIXEL)
};

/** La escalera multifuncional: siempre presente, quieta salvo por los golpes. */
function Escalera({ sway }) {
  const u = PIXEL;
  const alto = FLOOR - G.top;

  const montante = (x) => (
    <g key={x}>
      <rect x={x} y={G.top} width={G.railW} height={alto} fill={PAL.g} />
      <rect x={x + G.railW - u} y={G.top} width={u} height={alto} fill={PAL.G} />
      <rect x={x - u} y={FLOOR - 2 * u} width={G.railW + 2 * u} height={2 * u} fill={PAL.o} />
      <rect x={x - u * 0.5} y={G.hinge - 2 * u} width={G.railW + u} height={4 * u} fill={PAL.G} />
      <rect x={x + u * 0.5} y={G.hinge - u * 0.5} width={u} height={u} fill={ORANGE} />
    </g>
  );

  return (
    <g style={{ transform: `rotate(${sway}deg)`, transformOrigin: `${LADDER_CX}px ${FLOOR}px` }}>
      {G.rungs.map((y) => (
        <g key={y}>
          <rect x={G.left} y={y} width={G.gap + G.railW} height={u * 1.5} fill={PAL.g} />
          <rect x={G.left} y={y + u} width={G.gap + G.railW} height={u * 0.5} fill={PAL.G} />
        </g>
      ))}
      {[G.left, G.left + G.gap].map(montante)}
      <rect x={G.left - u} y={G.top} width={G.gap + G.railW + 2 * u} height={u * 1.5} fill={PAL.G} />
    </g>
  );
}

/** El sprite, pintado con box-shadow igual que en el diseño. */
function Pixeles({ sombra, left, top }) {
  return <div style={{ position: 'absolute', left, top, width: PIXEL, height: PIXEL, boxShadow: sombra }} />;
}

function Operario({ frame }) {
  const w = SPRITE_W * PIXEL;
  const h = SPRITE_H * PIXEL;

  return (
    <div
      style={{
        position: 'absolute',
        left: frame.x - w / 2,
        top: frame.y - h + frame.recoil,
        width: w,
        height: h,
        transform: `scaleX(${frame.facing})`,
        transformOrigin: '50% 50%'
      }}
    >
      <Pixeles sombra={SOMBRAS[frame.pose]} left={0} top={0} />
      <div
        style={{
          position: 'absolute',
          left: 9 * PIXEL,
          top: 8 * PIXEL,
          width: 10 * PIXEL,
          height: 3 * PIXEL,
          transform: `rotate(${frame.arm}deg)`,
          transformOrigin: '0% 50%'
        }}
      >
        <Pixeles sombra={SOMBRAS.arm} left={0} top={0} />
      </div>
    </div>
  );
}

/** Cascote y onda de choque de cada martillazo. */
function Cascote({ T, frame }) {
  const trozos = [];

  frame.impacts.forEach((ti, ii) => {
    const t = T - ti;
    if (t < 0 || t > 0.55) return;

    for (let i = 0; i < 7; i++) {
      const semilla = ii * 17 + i;
      const vx = (-24 - rnd(semilla) * 44) * PIXEL;
      const vy = (-30 - rnd(semilla + 91) * 37) * PIXEL;
      const lado = PIXEL * (rnd(semilla + 5) > 0.6 ? 1.5 : 1);
      trozos.push(
        <div
          key={semilla}
          style={{
            position: 'absolute',
            left: frame.impactX + vx * t,
            top: frame.impactY + vy * t + 150 * PIXEL * t * t,
            width: lado,
            height: lado,
            background: rnd(semilla + 33) > 0.5 ? PAL.k : '#B9C4CE',
            opacity: clamp(1 - t / 0.55, 0, 1)
          }}
        />
      );
    }

    if (t < 0.18) {
      const r = PIXEL * 1.5 + t * PIXEL * 42;
      trozos.push(
        <div
          key={'onda' + ii}
          style={{
            position: 'absolute',
            left: frame.impactX - r,
            top: frame.impactY - r,
            width: r * 2,
            height: r * 2,
            border: `${PIXEL}px solid ${ORANGE}`,
            opacity: 0.5 * (1 - t / 0.18)
          }}
        />
      );
    }
  });

  return trozos;
}

/**
 * Animación del hero: el operario sube la escalera y martillea la pared, y el
 * titular se sacude con cada golpe.
 *
 * Sólo se mueve cuando toca. Tres pasadas por visita con 22 s de pausa entre
 * ellas, se congela mientras el hero está fuera de pantalla, y con
 * `prefers-reduced-motion` no se ejecuta nunca: queda la escalera quieta.
 */
export default function HeroAnimacion() {
  const capa = useRef(null);
  const raf = useRef(null);
  const inicioPasada = useRef(null);
  const pasadas = useRef(0);
  const proximaPasada = useRef(0);
  const heroRef = useRef(null);

  const [T, setT] = useState(null);
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });

  // Se miden ancho Y alto: el alto decide dónde cae el suelo, y cambia sin que
  // cambie el ancho (al cargar la tipografía, al reflotar el texto). Leerlo del
  // ref durante el render dejaba el suelo desfasado en esos casos.
  useEffect(() => {
    const el = capa.current;
    if (!el) return undefined;

    heroRef.current = el.closest('[data-hero]');

    const medir = () =>
      setCaja((previa) =>
        previa.ancho === el.clientWidth && previa.alto === el.clientHeight
          ? previa
          : { ancho: el.clientWidth, alto: el.clientHeight }
      );
    medir();

    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = capa.current;
    if (!el) return undefined;

    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (sinMovimiento.matches) return undefined;

    const bucle = (ahora) => {
      raf.current = requestAnimationFrame(bucle);

      if (inicioPasada.current === null) {
        if (ahora < proximaPasada.current || pasadas.current >= HERO_MAX_RUNS) return;
        inicioPasada.current = ahora;
      }

      const t = (ahora - inicioPasada.current) / 1000;
      if (t >= HERO_DURATION) {
        // Fin de pasada: el operario ya está fuera de cuadro.
        inicioPasada.current = null;
        pasadas.current += 1;
        proximaPasada.current = ahora + HERO_IDLE_MS;
        setT(null);
        return;
      }
      setT(t);
    };

    const parar = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
    };

    // Fuera de pantalla no hay bucle: ni un requestAnimationFrame corriendo de
    // fondo mientras la persona lee el resto de la página. En móvil la capa está
    // en display:none, así que nunca llega a arrancar.
    const io = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          if (!raf.current) raf.current = requestAnimationFrame(bucle);
          return;
        }

        parar();
        // Al volver a entrar no se reanuda a medias: se reengancha desde el
        // principio de la siguiente pasada.
        if (inicioPasada.current !== null) {
          inicioPasada.current = null;
          proximaPasada.current = performance.now() + HERO_IDLE_MS;
          setT(null);
        }
      },
      { threshold: 0.15 }
    );

    proximaPasada.current = performance.now() + HERO_START_DELAY_MS;
    io.observe(el);

    return () => {
      io.disconnect();
      parar();
    };
  }, []);

  const encaje = useMemo(() => layout(caja.ancho, caja.alto), [caja.ancho, caja.alto]);

  const frame = useMemo(
    () => (T === null ? null : frameAt(T, { entryX: encaje.entryX, exitDistance: encaje.exitDistance })),
    [T, encaje]
  );

  // La sacudida viaja al titular por variables CSS: el hero no se reestructura,
  // sólo recibe un transform que en reposo vale cero.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    // La sacudida se mide contra el ancho del hero, no contra la escena: al
    // encoger al operario el titular debe seguir temblando igual.
    const relativo = caja.ancho / DESIGN_WIDTH;
    const j = frame ? frame.jolt : { x: 0, y: 0, r: 0 };
    hero.style.setProperty('--ll-jolt-x', (j.x * relativo).toFixed(2) + 'px');
    hero.style.setProperty('--ll-jolt-y', (j.y * relativo).toFixed(2) + 'px');
    hero.style.setProperty('--ll-jolt-r', j.r.toFixed(3) + 'deg');
  }, [frame, caja.ancho]);

  return (
    <div
      ref={capa}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 hidden overflow-hidden select-none lg:block"
    >
      {encaje.scale > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
            transformOrigin: '0 0',
            transform: `translate(${encaje.tx}px, ${encaje.ty}px) scale(${encaje.scale})`
          }}
        >
          <svg
            width={DESIGN_WIDTH}
            height={DESIGN_HEIGHT}
            viewBox={`0 0 ${DESIGN_WIDTH} ${DESIGN_HEIGHT}`}
            style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
          >
            <Escalera sway={frame ? frame.sway : 0} />
          </svg>

          {frame && (
            <>
              <Operario frame={frame} />
              <Cascote T={T} frame={frame} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
