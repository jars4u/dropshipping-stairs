import { Component, useEffect, useMemo, useRef, useState } from 'react';
import GaleriaProducto from './GaleriaProducto.jsx';
import { CalculatorEvent, ClickPosition, trackCalculator } from '../lib/analytics.ts';
import {
  CATALOG_SIZE,
  HEIGHT_RANGE,
  MATCH_LABELS,
  MATCH_STRENGTH,
  MAX_ALTERNATIVES,
  SEARCH_FEEDBACK_MS,
  SEARCH_STEPS,
  construirUrlAfiliado,
  createInitialFlowState,
  describeAlternatives,
  environmentCompatibilityIsDeclared,
  environmentOptions,
  formatAltura,
  runRecommendation,
  setEnvironment,
  setTargetHeight,
  setTask,
  submit,
  summaryRows,
  taskOptions
} from './calculadoraFlow.ts';

const OPCIONES_TAREA = taskOptions();
const OPCIONES_ENTORNO = environmentOptions();
const ENTORNO_DECLARADO_POR_FABRICANTE = environmentCompatibilityIsDeclared();

/** El slider dispara un cambio por píxel: se espera a que la mano se pare. */
const ANALYTICS_HEIGHT_DEBOUNCE_MS = 700;

/**
 * Red de seguridad de render. Si algo revienta pintando el resultado, la página
 * sigue en pie y la persona conserva el catálogo de más abajo.
 */
class LimiteDeError extends Component {
  constructor(props) {
    super(props);
    this.state = { fallo: false };
  }

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error('Calculadora:', error);
  }

  render() {
    return this.state.fallo ? this.props.fallback : this.props.children;
  }
}

/** Paso numerado del asistente. */
function Paso({ numero, titulo, subtexto, children }) {
  const idTitulo = `paso-${numero}-titulo`;
  const idSubtexto = subtexto ? `paso-${numero}-subtexto` : undefined;

  return (
    <section aria-labelledby={idTitulo} className="mt-9 border-t border-slate-200 pt-7 first:mt-0 first:border-0 first:pt-0">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-extrabold text-orange-600"
          aria-hidden="true"
        >
          {numero}
        </span>
        <div>
          <h3 id={idTitulo} className="text-base font-extrabold tracking-[-0.02em] text-slate-900">
            {titulo}
          </h3>
          {subtexto && (
            <p id={idSubtexto} className="mt-1 text-xs leading-relaxed text-slate-500">
              {subtexto}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Tarjeta de opción sobre un radio nativo: teclado (flechas), lectores de
 * pantalla y focus vienen de serie. El estado seleccionado no depende sólo del
 * color: cambia el borde, el peso tipográfico y aparece una marca de check.
 */
function TarjetaOpcion({ name, opcion, seleccionada, onSelect }) {
  return (
    <label className="block cursor-pointer">
      <input
        type="radio"
        name={name}
        value={opcion.value}
        checked={seleccionada}
        onChange={() => onSelect(opcion.value)}
        className="peer sr-only"
      />
      <span
        className={`flex h-full flex-col rounded-2xl border p-4 transition peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400 peer-focus-visible:ring-offset-2 ${
          seleccionada
            ? 'border-orange-500 bg-white shadow-md shadow-orange-500/10'
            : 'border-transparent bg-white/60 hover:border-slate-200 hover:bg-white'
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold ${
              seleccionada ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'
            }`}
            aria-hidden="true"
          >
            {opcion.icono}
          </span>
          {seleccionada && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[11px] font-extrabold text-white"
              aria-hidden="true"
            >
              ✓
            </span>
          )}
        </span>
        <span className={`mt-3 block text-sm ${seleccionada ? 'font-extrabold text-slate-950' : 'font-bold text-slate-700'}`}>
          {opcion.titulo}
        </span>
        <span className="mt-1 block text-[11px] leading-snug text-slate-500">{opcion.descripcion}</span>
      </span>
    </label>
  );
}

/**
 * Único punto por el que se sale hacia Amazon: centraliza el evento de click y
 * el caso de producto sin ASIN, que nunca debe pintarse como enlace muerto.
 */
function EnlaceProducto({ product, position, className, children }) {
  if (!product.asin) {
    return (
      <span
        className={`${className} cursor-not-allowed opacity-60`}
        role="link"
        aria-disabled="true"
        title="Este modelo no tiene ficha de compra disponible"
      >
        No disponible ahora mismo
      </span>
    );
  }

  return (
    <a
      href={construirUrlAfiliado(product.asin)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        trackCalculator(CalculatorEvent.PRODUCT_CLICKED, {
          product_id: product.id,
          product_asin: product.asin,
          position
        })
      }
      className={className}
    >
      {children}
    </a>
  );
}

/** Panel de la derecha antes de pedir la recomendación. */
function ResultadoPendiente() {
  return (
    <div className="rounded-4xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center lg:p-12">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl text-orange-500 shadow-sm" aria-hidden="true">
        ↗
      </span>
      <p className="mt-5 text-sm font-extrabold text-slate-800">Aquí verás tu recomendación</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
        Responde las tres preguntas y pulsa «Ver mi recomendación». Podrás cambiar cualquier respuesta después.
      </p>
    </div>
  );
}

/** Algo ha fallado calculando o pintando: la página no se cae con ello. */
function ResultadoError() {
  return (
    <div className="rounded-4xl border border-slate-200 bg-white p-8 text-center">
      <p className="text-sm font-extrabold text-slate-800">No hemos podido calcular tu recomendación</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
        Cambia alguna respuesta y vuelve a intentarlo. También puedes ver todos los modelos en «Nuestros productos», más
        abajo.
      </p>
    </div>
  );
}

/**
 * Estado de búsqueda. El motor responde al instante: esto es feedback de
 * interfaz para que el salto a la recomendación se lea como una búsqueda.
 * El esqueleto imita la forma de la tarjeta final para que no haya salto.
 */
function ResultadoBuscando({ duracionMs, totalProductos }) {
  return (
    <>
      {/* Para lectores de pantalla basta una frase; el esqueleto es decorativo. */}
      <p className="sr-only" role="status">
        Buscando entre {totalProductos} modelos del catálogo.
      </p>

      <div className="overflow-hidden rounded-4xl bg-slate-100 shadow-2xl shadow-slate-300/50" aria-hidden="true">
        <div className="ll-barrido relative flex aspect-4/3 w-full items-center justify-center overflow-hidden bg-slate-200/70">
          <span className="ll-latido text-4xl text-slate-400">↗</span>
        </div>

        <div className="border-t border-slate-200 bg-white px-5 py-6 sm:px-6">
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-orange-600 uppercase">Buscando tu escalera</p>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="ll-progreso h-full rounded-full bg-orange-500"
              style={{ '--ll-duracion': `${duracionMs}ms` }}
            />
          </div>

          <ul className="mt-5 space-y-2.5">
            {SEARCH_STEPS.map((paso, indice) => (
              <li
                key={paso}
                className="ll-paso flex items-start gap-2 text-xs leading-relaxed text-slate-600"
                style={{ animationDelay: `${Math.round((indice * duracionMs) / SEARCH_STEPS.length)}ms` }}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[9px] font-extrabold text-orange-600">
                  ✓
                </span>
                {paso}
              </li>
            ))}
          </ul>

          <div className="mt-5 space-y-2">
            <div className="ll-latido h-3 w-3/4 rounded-full bg-slate-100" />
            <div className="ll-latido h-3 w-1/2 rounded-full bg-slate-100" style={{ animationDelay: '200ms' }} />
          </div>
        </div>
      </div>
    </>
  );
}

/** No hay ningún modelo que cubra la altura pedida. */
function ResultadoSinCobertura({ resultado }) {
  const { closest, requirement } = resultado;

  return (
    <div className="rounded-4xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
      <p className="text-[10px] font-extrabold tracking-[0.16em] text-amber-700 uppercase">Fuera de catálogo</p>
      <h3 className="mt-3 text-lg font-extrabold tracking-[-0.03em] text-amber-950">Ningún modelo llega a esa altura</h3>
      <p className="mt-3 text-sm leading-relaxed text-amber-900">
        Para trabajar a {formatAltura(requirement.targetHeight)} m hacen falta{' '}
        {formatAltura(requirement.requiredLadderLength)} m de escalera y el catálogo actual no llega.
      </p>
      {closest && (
        <div className="mt-5 rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-bold text-amber-900">Lo más cerca que tenemos</p>
          <p className="mt-2 text-sm font-extrabold text-slate-950">{closest.product.nombre}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">{closest.text}</p>
          <EnlaceProducto
            product={closest.product}
            position={ClickPosition.CLOSEST}
            className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-xs font-extrabold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Ver producto <span aria-hidden="true">→</span>
          </EnlaceProducto>
        </div>
      )}
    </div>
  );
}

/** Nivel de coincidencia: puntos + texto, para no depender del color. */
function IndicadorCoincidencia({ match }) {
  const fuerza = MATCH_STRENGTH[match];

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
      <span className="flex gap-1" aria-hidden="true">
        {[1, 2, 3].map((punto) => (
          <span
            key={punto}
            className={`h-1.5 w-1.5 rounded-full ${punto <= fuerza ? 'bg-orange-500' : 'bg-slate-300'}`}
          />
        ))}
      </span>
      <span className="text-[11px] font-extrabold tracking-wide text-slate-700 uppercase">{MATCH_LABELS[match]}</span>
    </span>
  );
}

/**
 * "Tu mejor opción": la recomendación principal.
 *
 * Todo lo que se pinta aquí sale de la salida del engine o de campos declarados
 * en Product/Configuration. El precio y el CTA van justo bajo el nombre para
 * que en móvil la acción no quede enterrada bajo las explicaciones.
 */
function TuMejorOpcion({ recomendacion, requirement }) {
  const { product, match, reasons, warnings } = recomendacion;
  const filas = summaryRows(recomendacion, requirement);

  return (
    <article
      aria-labelledby="mejor-opcion-titulo"
      className="relative flex flex-col overflow-hidden rounded-4xl bg-slate-100 shadow-2xl shadow-slate-300/50"
    >
      {/* Badge del catálogo, tal cual. El motor nunca genera etiquetas comerciales. */}
      <div className="pointer-events-none absolute top-2 left-2 z-10 -rotate-6 rounded-md border border-white bg-orange-500 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-md sm:top-3 sm:left-3">
        {product.badge}
      </div>

      <GaleriaProducto key={product.id} imagenes={[...product.imagenes]} alt={product.nombre} />

      <div className="border-t border-slate-200 bg-white px-5 py-6 sm:px-6">
        <p className="text-[10px] font-extrabold tracking-[0.18em] text-orange-600 uppercase">Tu mejor opción</p>

        <h3
          id="mejor-opcion-titulo"
          className="mt-2 text-lg leading-tight font-extrabold tracking-[-0.03em] text-slate-950 sm:text-xl"
        >
          {product.nombre}
        </h3>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-3xl font-extrabold tracking-tighter text-slate-950">{product.precio}</span>
          <IndicadorCoincidencia match={match} />
        </div>

        <EnlaceProducto
          product={product}
          position={ClickPosition.BEST}
          className="mt-5 block w-full rounded-xl bg-orange-500 px-6 py-4 text-center text-base font-extrabold text-white shadow-xl shadow-orange-500/20 transition hover:bg-orange-600 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Ver producto <span aria-hidden="true">→</span>
        </EnlaceProducto>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Precio y disponibilidad sujetos a actualización en Amazon.
        </p>

        <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
          {filas.map((fila) => (
            <div key={fila.etiqueta} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-xs font-medium text-slate-500">{fila.etiqueta}</dt>
              <dd className="text-right text-sm font-bold text-slate-900">{fila.valor}</dd>
            </div>
          ))}
        </dl>

        {reasons.length > 0 && (
          <>
            <h4 className="mt-6 text-xs font-extrabold tracking-[0.12em] text-slate-900 uppercase">
              Por qué la recomendamos
            </h4>
            <ul className="mt-3 space-y-2">
              {reasons.map((razon) => (
                <li key={razon.code} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[9px] font-extrabold text-orange-600"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {razon.text}
                </li>
              ))}
            </ul>
          </>
        )}

        {warnings.length > 0 && (
          <details className="mt-5 rounded-xl bg-slate-50 p-3">
            <summary className="cursor-pointer text-[11px] font-bold text-slate-600 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:outline-none">
              Lo que el fabricante no publica ({warnings.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {warnings.map((aviso) => (
                <li key={aviso.code} className="text-[11px] leading-relaxed text-slate-500">
                  {aviso.text}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}

/** Miniatura de alternativa que se retira sola si la imagen no carga. */
function MiniaturaProducto({ src }) {
  const [visible, setVisible] = useState(Boolean(src));

  if (!visible) return null;

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setVisible(false)}
      className="h-24 w-24 shrink-0 rounded-2xl bg-slate-50 object-contain"
    />
  );
}

/**
 * Hasta dos alternativas, cada una con su diferencia principal frente a la
 * recomendada. Las etiquetas las calcula `describeAlternatives` comparando
 * campos declarados; nunca son eslóganes.
 */
function Alternativas({ alternativas, mejor }) {
  const diferencias = describeAlternatives(alternativas, mejor);

  return (
    <section aria-labelledby="alternativas-titulo" className="mt-6">
      <h3 id="alternativas-titulo" className="text-xs font-extrabold tracking-[0.18em] text-slate-500 uppercase">
        Otras opciones que también cubren tu altura
      </h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {alternativas.map((alternativa, indice) => {
          const { product } = alternativa;
          const diferencia = diferencias[indice];

          return (
            <article
              key={product.id}
              className="flex gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
            >
              <MiniaturaProducto src={product.imagen} />

              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-orange-700 uppercase">
                  {diferencia.label}
                </span>
                <p className="mt-2 text-sm leading-snug font-extrabold text-slate-950">{product.nombre}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{diferencia.detail}</p>

                <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-lg font-extrabold tracking-[-0.04em] text-slate-950">{product.precio}</span>
                  <EnlaceProducto
                    product={product}
                    position={ClickPosition.ALTERNATIVE}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-extrabold text-slate-800 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    Ver producto <span aria-hidden="true">→</span>
                  </EnlaceProducto>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Ficha técnica del producto recomendado: sólo filas declaradas por el fabricante. */
function FichaTecnica({ product }) {
  return (
    <section
      aria-labelledby="ficha-titulo"
      className="mt-6 rounded-4xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:p-10"
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
          <p className="text-xs font-extrabold tracking-[0.18em] text-orange-600 uppercase">La elección LadderLand</p>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-slate-600">{product.tag}</p>
          <div className="mt-8 flex items-end gap-3">
            <span className="text-5xl font-extrabold tracking-[-0.06em] text-slate-950">{product.precio}</span>
            <span className="pb-1 text-xs text-slate-500">
              precio orientativo
              <br />
              en Amazon
            </span>
          </div>
          <EnlaceProducto
            product={product}
            position={ClickPosition.DATASHEET}
            className="mt-8 block w-full rounded-xl bg-[#ff9900] px-6 py-5 text-center text-base font-extrabold text-white shadow-xl shadow-orange-500/20 transition hover:bg-[#e88700] focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Ver producto en Amazon <span aria-hidden="true">→</span>
          </EnlaceProducto>
        </div>

        <div>
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <h3 id="ficha-titulo" className="text-sm font-extrabold tracking-[0.12em] text-slate-950 uppercase">
              Ficha técnica
            </h3>
            {product.specifications.brand && (
              <span className="text-xs font-bold text-slate-400">{product.specifications.brand}</span>
            )}
          </div>
          <dl className="divide-y divide-slate-100">
            {product.specifications.datasheet.map((caracteristica) => (
              <div
                key={caracteristica.etiqueta}
                className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 py-4 text-sm"
              >
                <dt className="font-medium text-slate-500">{caracteristica.etiqueta}</dt>
                <dd className="font-bold text-slate-900">{caracteristica.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export default function Calculadora() {
  const [flujo, setFlujo] = useState(createInitialFlowState);
  const [buscando, setBuscando] = useState(false);
  const panelResultado = useRef(null);
  const temporizador = useRef(null);
  const temporizadorAltura = useRef(null);
  const haIniciado = useRef(false);
  const ultimaVistaEnviada = useRef(null);

  // El motor valida su entrada y puede lanzar: aquí no se deja escapar nada.
  const { resultado, fallo } = useMemo(() => {
    try {
      return { resultado: runRecommendation(flujo), fallo: false };
    } catch {
      return { resultado: null, fallo: true };
    }
  }, [flujo]);

  const recomendacion = resultado?.best ?? null;
  const alternativas = resultado?.alternatives.slice(0, MAX_ALTERNATIVES) ?? [];
  const mostrandoResultado = Boolean(resultado) && !buscando;

  const marcarInicio = () => {
    if (haIniciado.current) return;
    haIniciado.current = true;
    trackCalculator(CalculatorEvent.STARTED);
  };

  // Los temporizadores no sobreviven al desmontaje.
  useEffect(
    () => () => {
      clearTimeout(temporizador.current);
      clearTimeout(temporizadorAltura.current);
    },
    []
  );

  // La altura se envía cuando la mano se para, no en cada píxel del slider.
  useEffect(() => {
    if (!haIniciado.current) return undefined;

    clearTimeout(temporizadorAltura.current);
    temporizadorAltura.current = setTimeout(() => {
      trackCalculator(CalculatorEvent.HEIGHT_SELECTED, { height_m: flujo.targetHeight });
    }, ANALYTICS_HEIGHT_DEBOUNCE_MS);

    return () => clearTimeout(temporizadorAltura.current);
  }, [flujo.targetHeight]);

  // Una vista por recomendación distinta: arrastrar el slider dentro del mismo
  // modelo no vuelve a contar.
  const firmaVista = mostrandoResultado && resultado ? `${resultado.status}:${recomendacion?.product.asin ?? '-'}` : null;

  useEffect(() => {
    if (!firmaVista || ultimaVistaEnviada.current === firmaVista) return;
    ultimaVistaEnviada.current = firmaVista;

    trackCalculator(CalculatorEvent.RECOMMENDATION_VIEWED, {
      status: resultado.status,
      match: recomendacion?.match ?? null,
      score: recomendacion?.score ?? null,
      product_asin: recomendacion?.product.asin ?? null,
      alternatives: alternativas.length,
      height_m: resultado.requirement.targetHeight,
      task: flujo.task,
      environment: flujo.environment
    });
    // Depende sólo de la firma: es lo que define "otra vista distinta".
  }, [firmaVista]);

  const alCambiarTarea = (valor) => {
    marcarInicio();
    setFlujo((estado) => setTask(estado, valor));
    trackCalculator(CalculatorEvent.TASK_SELECTED, { task: valor });
  };

  const alCambiarEntorno = (valor) => {
    marcarInicio();
    setFlujo((estado) => setEnvironment(estado, valor));
    trackCalculator(CalculatorEvent.ENVIRONMENT_SELECTED, { environment: valor });
  };

  const alSubir = (evento) => {
    evento.preventDefault();
    if (buscando) return;

    marcarInicio();
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setFlujo((estado) => submit(estado));

    // Feedback de búsqueda. Con reduced-motion el resultado sale directo.
    clearTimeout(temporizador.current);
    setBuscando(!sinMovimiento);
    if (!sinMovimiento) {
      temporizador.current = setTimeout(() => setBuscando(false), SEARCH_FEEDBACK_MS);
    }

    // En móvil el resultado queda bajo el pliegue: se acerca sin navegar.
    panelResultado.current?.scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'nearest' });
  };

  return (
    <section className="mx-auto max-w-7xl px-5 lg:px-10">
      <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
        {/* ---------------------------------------------------- Asistente */}
        <form
          onSubmit={alSubir}
          aria-labelledby="calculadora-titulo"
          className="rounded-4xl bg-slate-50 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-7"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold tracking-[0.18em] text-orange-600 uppercase">Tu recomendación</p>
              <h2
                id="calculadora-titulo"
                className="mt-3 text-2xl font-extrabold tracking-[-0.04em] text-slate-950 sm:text-3xl"
              >
                Encuéntrala en tres pasos
              </h2>
            </div>
            <span className="rounded-full bg-white px-3 py-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase shadow-sm">
              75°
            </span>
          </div>

          <ul className="mt-6 grid gap-3 border-y border-slate-200 py-5 text-sm font-semibold text-slate-700 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {['Medida exacta para tu proyecto', 'Modelos con norma EN131', 'Compra sin acertijos'].map((ventaja) => (
              <li key={ventaja} className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-600"
                  aria-hidden="true"
                >
                  ✓
                </span>
                {ventaja}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            {/* -------------------------------------------------- Paso 1 */}
            <Paso
              numero={1}
              titulo="¿A qué altura necesitas trabajar?"
              subtexto="Indica la altura aproximada del punto donde vas a trabajar."
            >
              <div className="flex items-end justify-between gap-4">
                <label htmlFor="altura" className="text-sm font-bold text-slate-800">
                  Altura de trabajo
                </label>
                <output htmlFor="altura" className="text-3xl font-extrabold tracking-tighter tabular-nums text-orange-500">
                  {formatAltura(flujo.targetHeight)} <small className="text-base font-bold">m</small>
                </output>
              </div>
              <input
                id="altura"
                type="range"
                min={HEIGHT_RANGE.min}
                max={HEIGHT_RANGE.max}
                step={HEIGHT_RANGE.step}
                value={flujo.targetHeight}
                aria-describedby="paso-1-subtexto"
                aria-valuetext={`${formatAltura(flujo.targetHeight)} metros`}
                onChange={(evento) => {
                  marcarInicio();
                  setFlujo((estado) => setTargetHeight(estado, Number(evento.target.value)));
                }}
                className="mt-6 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-orange-500 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:outline-none"
              />
              <div className="mt-2 flex justify-between text-[11px] font-bold text-slate-400">
                <span>Mínimo {formatAltura(HEIGHT_RANGE.min)} m</span>
                <span>Máximo {formatAltura(HEIGHT_RANGE.max)} m</span>
              </div>
            </Paso>

            {/* -------------------------------------------------- Paso 2 */}
            <Paso numero={2} titulo="¿Qué tipo de trabajo vas a hacer?">
              <div role="radiogroup" aria-labelledby="paso-2-titulo" className="grid gap-2 sm:grid-cols-2">
                {OPCIONES_TAREA.map((opcion) => (
                  <TarjetaOpcion
                    key={opcion.value}
                    name="tarea"
                    opcion={opcion}
                    seleccionada={flujo.task === opcion.value}
                    onSelect={alCambiarTarea}
                  />
                ))}
              </div>
            </Paso>

            {/* -------------------------------------------------- Paso 3 */}
            <Paso numero={3} titulo="¿Dónde vas a utilizarla?">
              <div
                role="radiogroup"
                aria-labelledby="paso-3-titulo"
                className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3"
              >
                {OPCIONES_ENTORNO.map((opcion) => (
                  <TarjetaOpcion
                    key={opcion.value}
                    name="entorno"
                    opcion={opcion}
                    seleccionada={flujo.environment === opcion.value}
                    onSelect={alCambiarEntorno}
                  />
                ))}
              </div>
              {!ENTORNO_DECLARADO_POR_FABRICANTE && (
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  No disponemos de especificaciones del fabricante para este criterio. El entorno se usa para calcular
                  cuánto debe sobresalir por encima del punto de apoyo, no para descartar modelos.
                </p>
              )}
            </Paso>
          </div>

          <button
            type="submit"
            disabled={buscando}
            aria-busy={buscando}
            className={`mt-9 block w-full rounded-xl bg-orange-500 px-6 py-4 text-center text-base font-extrabold text-white shadow-xl shadow-orange-500/20 transition focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:outline-none ${
              buscando ? 'cursor-not-allowed opacity-70' : 'hover:bg-orange-600'
            }`}
          >
            {buscando ? (
              'Buscando…'
            ) : (
              <>
                Ver mi recomendación <span aria-hidden="true">→</span>
              </>
            )}
          </button>
          {flujo.submitted && (
            <p className="mt-3 text-center text-[11px] text-slate-400">
              Cambia cualquier respuesta y la recomendación se actualiza sola.
            </p>
          )}
        </form>

        {/* ---------------------------------------------------- Resultado */}
        <div ref={panelResultado} aria-live="polite" aria-atomic="false">
          <LimiteDeError fallback={<ResultadoError />}>
            {fallo && <ResultadoError />}
            {!fallo && !resultado && <ResultadoPendiente />}
            {!fallo && resultado && buscando && (
              <ResultadoBuscando duracionMs={SEARCH_FEEDBACK_MS} totalProductos={CATALOG_SIZE} />
            )}
            {!fallo && mostrandoResultado && !recomendacion && <ResultadoSinCobertura resultado={resultado} />}
            {!fallo && mostrandoResultado && recomendacion && (
              // La key reanima la tarjeta sólo cuando cambia el producto, no al
              // arrastrar el slider dentro del mismo modelo.
              <div key={recomendacion.product.id} className="ll-entrada">
                <TuMejorOpcion recomendacion={recomendacion} requirement={resultado.requirement} />
              </div>
            )}
          </LimiteDeError>
        </div>
      </div>

      <LimiteDeError fallback={null}>
        {!fallo && mostrandoResultado && recomendacion && alternativas.length > 0 && (
          <Alternativas alternativas={alternativas} mejor={recomendacion} />
        )}
        {!fallo && mostrandoResultado && recomendacion && <FichaTecnica product={recomendacion.product} />}
      </LimiteDeError>
    </section>
  );
}
