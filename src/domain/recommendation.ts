/**
 * Recommendation Engine.
 *
 * Función pura: mismas entradas -> mismas salidas. Sin React, sin DOM, sin red,
 * sin aleatoriedad, sin fecha/hora, sin modelos estadísticos. Todo el
 * razonamiento sale de datos declarados por el fabricante (ver `catalogo.ts`).
 *
 * CÓMO DECIDE
 * -----------
 * 1. Restricciones duras: descartan un producto sólo cuando un dato CONOCIDO
 *    demuestra que no sirve. Un dato desconocido nunca descarta; degrada la
 *    confianza y genera un aviso.
 * 2. Fit Score: media ponderada de cinco factores en [0,1]. La altura pesa 0.45
 *    y el precio 0.10, así que el precio no puede ganarle a la altura.
 * 3. El ajuste de altura es "lo justo que cubre", no "lo más grande": una
 *    escalera que dobla lo necesario puntúa peor que otra que encaja. Así una
 *    opción corta pero suficiente gana a una larga sobredimensionada.
 *
 * SOBRE EL LENGUAJE
 * -----------------
 * El motor determina compatibilidad técnica y comercial a partir de datos
 * publicados. No emite juicios de seguridad ni de certificación, y ningún texto
 * generado aquí debe hacerlo.
 */

import {
  ConfigurationType,
  EnvironmentType,
  TaskType,
  UNKNOWN,
  isEnvironmentType,
  isTaskType,
  type Maybe
} from './types.ts';
import type { Configuration, Product } from './product.ts';

/* ------------------------------------------------------------------ *
 * Constantes del modelo de cálculo
 * ------------------------------------------------------------------ */

/**
 * Longitud de escalera por metro de altura cuando se apoya inclinada.
 * 1 / sin(75°) ≈ 1.035. Es geometría, no un dato de producto.
 */
export const LEAN_FACTOR = 1.035;

/**
 * Metros que la escalera debe prolongarse por encima del punto de apoyo cuando
 * se trabaja sobre fachada o tejado. Es la constante que ya usaba el calculador.
 */
export const TOP_EXTENSION_M = 1;

export const ENVIRONMENTS_WITH_TOP_EXTENSION: readonly EnvironmentType[] = Object.freeze([
  EnvironmentType.FACHADA,
  EnvironmentType.TEJADO
]);

/** Pesos del Fit Score. Suman 1. La altura manda sobre el precio (0.45 vs 0.10). */
export const SCORE_WEIGHTS = Object.freeze({
  height: 0.45,
  task: 0.25,
  environment: 0.1,
  versatility: 0.1,
  price: 0.1
});

/** Umbrales de `fit` de altura que separan exact / good / marginal. */
export const MATCH_THRESHOLDS = Object.freeze({ exact: 0.8, good: 0.55 });

/** Multiplicadores de confianza por hueco de datos. */
export const CONFIDENCE_FACTORS = Object.freeze({
  declaredWorkHeight: 1,
  derivedFromLadderLength: 0.8,
  unknownHeight: 0.4,
  unknownEnvironment: 0.85,
  unknownPlatformHeight: 0.7
});

/**
 * Formas que se sostienen solas frente a formas que necesitan apoyarse en la
 * superficie de trabajo. Se deduce de la geometría del tipo, igual que
 * TASKS_BY_CONFIGURATION_TYPE; no es una spec del fabricante.
 *
 * ESCALERA_PLEGABLE queda fuera de ambos grupos a propósito: el fabricante no
 * dice si esa forma se apoya o no.
 */
const SELF_SUPPORTING_TYPES: ReadonlySet<string> = new Set([
  ConfigurationType.TIJERA,
  ConfigurationType.TIJERA_CON_EXTENSION,
  ConfigurationType.AUTOPORTANTE,
  ConfigurationType.MARCO_M,
  ConfigurationType.MARCO_L,
  ConfigurationType.PLATAFORMA,
  ConfigurationType.ANDAMIO,
  ConfigurationType.ANDAMIO_DESNIVEL
]);

const LEANING_TYPES: ReadonlySet<string> = new Set([ConfigurationType.ESCALERA_APOYADA]);

/** En interior no hay muro donde apoyar; en fachada/tejado sí lo hay. */
const preferredTypesFor = (environment: EnvironmentType): ReadonlySet<string> =>
  environment === EnvironmentType.INTERIOR ? SELF_SUPPORTING_TYPES : LEANING_TYPES;

/* ------------------------------------------------------------------ *
 * API pública: tipos
 * ------------------------------------------------------------------ */

export interface Scenario {
  /** Altura a la que la persona necesita llegar a trabajar, en metros. */
  targetHeight: number;
  task: TaskType;
  environment: EnvironmentType;
  /**
   * Estatura de la persona. Se acepta y se conserva, pero NO entra en ningún
   * cálculo: no hay dato de alcance publicado por ningún fabricante con el que
   * combinarla, y estimarlo sería inventar. Ver `scenarioNotes` del resultado.
   */
  userHeight?: number;
}

export type MatchLevel = 'exact' | 'good' | 'marginal' | 'none';
export type ResultStatus = 'ok' | 'no_exact_match';

/** De dónde sale el número de altura con el que se compara. */
export type HeightEvidenceKind = 'declared-work-height' | 'derived-from-ladder-length' | 'unknown';

export interface HeightRequirement {
  targetHeight: number;
  /** Altura de trabajo pedida. Se compara con `maxWorkHeight` cuando existe. */
  requiredWorkHeight: number;
  /** Longitud de escalera pedida. Se compara con `maxLadderLength`. */
  requiredLadderLength: number;
  /** 1.035 al trabajar apoyado; 1 sobre plataforma (estructura vertical). */
  leanFactor: number;
  /** Metros añadidos por sobresalir del punto de apoyo (0 si no aplica). */
  topExtensionM: number;
}

export interface HeightEvidence {
  kind: HeightEvidenceKind;
  /** Metros que ofrece el producto según la mejor evidencia disponible. */
  available: Maybe<number>;
  /** Metros pedidos con los que se ha comparado. */
  required: number;
  covers: boolean;
  /** required / available, acotado a [0,1]. 1 = encaja justo. */
  fit: number;
}

export type ScoreFactorKey = keyof typeof SCORE_WEIGHTS;

export interface ScoreFactor {
  key: ScoreFactorKey;
  weight: number;
  /** Valor del factor en [0,1]. */
  value: number;
  /** value * weight. */
  weighted: number;
  /** Por qué ese valor, en texto. */
  detail: string;
}

export interface ScoreBreakdown {
  total: number;
  factors: readonly ScoreFactor[];
}

export type ReasonCode =
  | 'cubre-altura'
  | 'ajuste-altura'
  | 'configuracion-compatible'
  | 'configuraciones-declaradas'
  | 'precio-mas-bajo'
  | 'mas-ligera'
  | 'carga-declarada';

export type WarningCode =
  | 'altura-de-trabajo-no-declarada'
  | 'altura-no-declarada'
  | 'altura-plataforma-no-declarada'
  | 'sobresaliente-no-contemplado'
  | 'entorno-no-declarado';

export type RejectionCode = 'tarea-no-soportada' | 'entorno-no-soportado' | 'altura-insuficiente';

export interface Reason {
  code: ReasonCode;
  text: string;
}

export interface Warning {
  code: WarningCode;
  text: string;
}

export interface Recommendation {
  product: Product;
  /** Configuración elegida para este escenario, o null si ninguna es compatible. */
  configuration: Configuration | null;
  /** Fit Score en [0,1], 3 decimales. */
  score: number;
  match: MatchLevel;
  /** Cuánto fiarse del cálculo dados los huecos de datos, en [0,1]. */
  confidence: number;
  reasons: readonly Reason[];
  warnings: readonly Warning[];
  height: HeightEvidence;
  breakdown: ScoreBreakdown;
}

export interface RejectedProduct {
  product: Product;
  code: RejectionCode;
  text: string;
  height: HeightEvidence;
  /** Metros que le faltan, si se puede calcular. */
  deficitM: Maybe<number>;
}

export interface RecommendationResult {
  status: ResultStatus;
  scenario: Scenario;
  /** Aclaraciones sobre el propio escenario (p. ej. campos aceptados pero no usados). */
  scenarioNotes: readonly string[];
  requirement: HeightRequirement;
  /** Mejor candidato elegible, de cualquier nivel. null si no hay ninguno. */
  best: Recommendation | null;
  /** Resto de candidatos elegibles, ordenados. */
  alternatives: readonly Recommendation[];
  /** Sólo cuando no hay ningún elegible: el descartado que menos lejos queda. */
  closest: RejectedProduct | null;
  rejected: readonly RejectedProduct[];
}

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

const EPS = 1e-9;

const round = (valor: number, decimales: number): number => {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
};

const clamp01 = (valor: number): number => Math.min(1, Math.max(0, valor));

/** 5.8 -> "5,80 m" */
export const formatMetros = (valor: number): string => valor.toFixed(2).replace('.', ',') + ' m';

/** 14.5 -> "14,5 kg" */
const formatKg = (valor: number): string => String(valor).replace('.', ',') + ' kg';

/**
 * Convierte el precio mostrado a número. Soporta "171.99€" y "230,90€".
 * Devuelve UNKNOWN si no se puede interpretar.
 */
export function parsePrecioEur(precio: string): Maybe<number> {
  const limpio = precio.replace(/[^\d.,]/g, '');
  if (!limpio) return UNKNOWN;
  const ultimoPunto = limpio.lastIndexOf('.');
  const ultimaComa = limpio.lastIndexOf(',');
  let normalizado: string;
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    const corte = Math.max(ultimoPunto, ultimaComa);
    normalizado = limpio.slice(0, corte).replace(/[.,]/g, '') + '.' + limpio.slice(corte + 1);
  } else {
    normalizado = limpio.replace(',', '.');
  }
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : UNKNOWN;
}

/* ------------------------------------------------------------------ *
 * Paso 1: qué hace falta
 * ------------------------------------------------------------------ */

/**
 * Traduce el escenario a las magnitudes con las que se compara el catálogo.
 *
 * - Trabajando apoyado, la escalera se inclina: hace falta más longitud que
 *   altura, y en fachada/tejado además debe sobresalir por encima del apoyo.
 * - Trabajando sobre plataforma, la estructura es vertical: ni inclinación ni
 *   sobresaliente.
 */
export function computeRequirement(scenario: Scenario): HeightRequirement {
  const apoyada = scenario.task === TaskType.ACCESO;
  const leanFactor = apoyada ? LEAN_FACTOR : 1;
  const topExtensionM =
    apoyada && ENVIRONMENTS_WITH_TOP_EXTENSION.includes(scenario.environment) ? TOP_EXTENSION_M : 0;

  return Object.freeze({
    targetHeight: scenario.targetHeight,
    requiredWorkHeight: round(scenario.targetHeight, 3),
    requiredLadderLength: round(scenario.targetHeight * leanFactor + topExtensionM, 3),
    leanFactor,
    topExtensionM
  });
}

/**
 * Elige el número del producto con el que comparar, por orden de calidad de
 * evidencia: altura de trabajo declarada > longitud declarada > nada.
 */
export function evaluateHeight(product: Product, requirement: HeightRequirement): HeightEvidence {
  const { maxWorkHeight, maxLadderLength } = product.capabilities;

  let kind: HeightEvidenceKind;
  let available: Maybe<number>;
  let required: number;

  if (maxWorkHeight !== UNKNOWN) {
    kind = 'declared-work-height';
    available = maxWorkHeight;
    required = requirement.requiredWorkHeight;
  } else if (maxLadderLength !== UNKNOWN) {
    kind = 'derived-from-ladder-length';
    available = maxLadderLength;
    required = requirement.requiredLadderLength;
  } else {
    kind = 'unknown';
    available = UNKNOWN;
    required = requirement.requiredWorkHeight;
  }

  const covers = available !== UNKNOWN && available + EPS >= required;
  const fit = available === UNKNOWN ? 0.5 : clamp01(required / available);

  return Object.freeze({ kind, available, required, covers, fit: round(fit, 4) });
}

/* ------------------------------------------------------------------ *
 * Paso 2: restricciones duras
 * ------------------------------------------------------------------ */

const rechazar = (
  product: Product,
  code: RejectionCode,
  text: string,
  height: HeightEvidence
): RejectedProduct => {
  const deficitM =
    height.available === UNKNOWN ? UNKNOWN : round(Math.max(0, height.required - height.available), 2);
  return Object.freeze({ product, code, text, height, deficitM });
};

/**
 * Aplica las restricciones duras. Devuelve el motivo de descarte, o null si el
 * producto sigue en juego.
 *
 * Sólo descarta con datos conocidos: si `supportedEnvironments` es UNKNOWN, el
 * producto NO se elimina, porque desconocer no es incumplir.
 */
function checkHardConstraints(
  product: Product,
  scenario: Scenario,
  height: HeightEvidence
): RejectedProduct | null {
  const { supportedTasks, supportedEnvironments } = product.capabilities;

  if (supportedTasks !== UNKNOWN && !supportedTasks.includes(scenario.task)) {
    return rechazar(
      product,
      'tarea-no-soportada',
      'Ninguna de sus configuraciones declaradas sirve para ' + describeTask(scenario.task) + '.',
      height
    );
  }

  if (supportedEnvironments !== UNKNOWN && !supportedEnvironments.includes(scenario.environment)) {
    return rechazar(
      product,
      'entorno-no-soportado',
      'El fabricante no declara este producto para uso en ' + scenario.environment + '.',
      height
    );
  }

  if (height.available !== UNKNOWN && !height.covers) {
    return rechazar(
      product,
      'altura-insuficiente',
      'Llega a ' + formatMetros(height.available) + ' y hacen falta ' + formatMetros(height.required) + '.',
      height
    );
  }

  return null;
}

const describeTask = (task: TaskType): string =>
  task === TaskType.TRABAJO_SOBRE_PLATAFORMA ? 'trabajar sobre plataforma' : 'subir y trabajar apoyado';

/* ------------------------------------------------------------------ *
 * Paso 3: configuración elegida
 * ------------------------------------------------------------------ */

/**
 * Elige la configuración con la que se afrontaría el trabajo: entre las que
 * declaran soportar la tarea, la primera que además encaja con el entorno
 * (autoportante en interior, apoyada en fachada/tejado). Orden de declaración
 * del fabricante como desempate, para que el resultado sea determinista.
 */
export function selectConfiguration(product: Product, scenario: Scenario): Configuration | null {
  const confirmadas = product.configurations.filter(
    (configuracion) => configuracion.supportedTasks !== UNKNOWN && configuracion.supportedTasks.includes(scenario.task)
  );
  const desconocidas = product.configurations.filter((configuracion) => configuracion.supportedTasks === UNKNOWN);
  const candidatas = confirmadas.length ? confirmadas : desconocidas;
  if (!candidatas.length) return null;

  const preferidas = preferredTypesFor(scenario.environment);
  return candidatas.find((configuracion) => preferidas.has(configuracion.type)) ?? candidatas[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * Paso 4: Fit Score
 * ------------------------------------------------------------------ */

interface ScoringContext {
  /** Nº máximo de tipos de configuración distintos entre los candidatos. */
  maxDistinctTypes: number;
  minPrice: Maybe<number>;
  maxPrice: Maybe<number>;
  cheapestId: Maybe<number>;
  lightestId: Maybe<number>;
  candidateCount: number;
}

const distinctTypes = (product: Product): number =>
  new Set(product.configurations.map((configuracion) => configuracion.type)).size;

function scoreHeight(height: HeightEvidence): ScoreFactor {
  const detail =
    height.kind === 'unknown'
      ? 'Sin altura declarada: factor neutro.'
      : 'Necesita ' +
        formatMetros(height.required) +
        ' y dispone de ' +
        formatMetros(height.available as number) +
        (height.kind === 'declared-work-height' ? ' de altura de trabajo declarada.' : ' de longitud declarada.');
  return { key: 'height', weight: SCORE_WEIGHTS.height, value: height.fit, weighted: 0, detail };
}

function scoreTask(product: Product, configuration: Configuration | null, scenario: Scenario): ScoreFactor {
  let value = 0.5;
  let detail = 'El producto no declara tareas compatibles: factor neutro.';

  const confirmada =
    configuration !== null &&
    configuration.supportedTasks !== UNKNOWN &&
    configuration.supportedTasks.includes(scenario.task);

  if (confirmada && configuration) {
    const preferida = preferredTypesFor(scenario.environment).has(configuration.type);
    value = preferida ? 1 : 0.8;
    detail =
      'La configuración «' +
      configuration.name +
      '» sirve para ' +
      describeTask(scenario.task) +
      (preferida ? ' y encaja con el entorno elegido.' : ', aunque su forma no es la típica de este entorno.');
  }

  return { key: 'task', weight: SCORE_WEIGHTS.task, value, weighted: 0, detail };
}

function scoreEnvironment(product: Product, scenario: Scenario): ScoreFactor {
  const soportados = product.capabilities.supportedEnvironments;
  if (soportados === UNKNOWN) {
    return {
      key: 'environment',
      weight: SCORE_WEIGHTS.environment,
      value: 0.5,
      weighted: 0,
      detail: 'El fabricante no declara entornos de uso: factor neutro para todos los productos.'
    };
  }
  const incluido = soportados.includes(scenario.environment);
  return {
    key: 'environment',
    weight: SCORE_WEIGHTS.environment,
    value: incluido ? 1 : 0,
    weighted: 0,
    detail: incluido
      ? 'El fabricante declara uso en ' + scenario.environment + '.'
      : 'El fabricante no declara uso en ' + scenario.environment + '.'
  };
}

function scoreVersatility(product: Product, contexto: ScoringContext): ScoreFactor {
  const propios = distinctTypes(product);
  const value = contexto.maxDistinctTypes > 0 ? clamp01(propios / contexto.maxDistinctTypes) : 0.5;
  return {
    key: 'versatility',
    weight: SCORE_WEIGHTS.versatility,
    value: round(value, 4),
    weighted: 0,
    detail:
      propios +
      ' formas de montaje distintas declaradas, sobre ' +
      contexto.maxDistinctTypes +
      ' del candidato más versátil.'
  };
}

function scorePrice(product: Product, contexto: ScoringContext): ScoreFactor {
  const precio = parsePrecioEur(product.precio);
  if (precio === UNKNOWN || contexto.minPrice === UNKNOWN || contexto.maxPrice === UNKNOWN) {
    return {
      key: 'price',
      weight: SCORE_WEIGHTS.price,
      value: 0.5,
      weighted: 0,
      detail: 'Precio no interpretable: factor neutro.'
    };
  }
  const rango = contexto.maxPrice - contexto.minPrice;
  const value = rango < EPS ? 1 : clamp01(1 - (precio - contexto.minPrice) / rango);
  return {
    key: 'price',
    weight: SCORE_WEIGHTS.price,
    value: round(value, 4),
    weighted: 0,
    detail:
      rango < EPS
        ? 'Único precio entre los candidatos.'
        : product.precio + ' dentro de un rango de ' + contexto.minPrice + '€ a ' + contexto.maxPrice + '€.'
  };
}

function buildBreakdown(factors: ScoreFactor[]): ScoreBreakdown {
  const conPeso = factors.map((factor) => ({ ...factor, weighted: round(factor.value * factor.weight, 4) }));
  const total = round(
    conPeso.reduce((suma, factor) => suma + factor.weighted, 0),
    3
  );
  return Object.freeze({ total, factors: Object.freeze(conPeso) });
}

/* ------------------------------------------------------------------ *
 * Paso 5: explicación
 * ------------------------------------------------------------------ */

function buildReasons(
  product: Product,
  configuration: Configuration | null,
  height: HeightEvidence,
  contexto: ScoringContext
): Reason[] {
  const reasons: Reason[] = [];

  if (height.covers && height.available !== UNKNOWN) {
    reasons.push({
      code: 'cubre-altura',
      text:
        height.kind === 'declared-work-height'
          ? 'El fabricante declara una altura de trabajo de ' +
            formatMetros(height.available) +
            ', por encima de los ' +
            formatMetros(height.required) +
            ' que necesitas.'
          : 'Con ' +
            formatMetros(height.available) +
            ' de longitud declarada cubre los ' +
            formatMetros(height.required) +
            ' que pide tu trabajo.'
    });
  }

  if (height.fit >= MATCH_THRESHOLDS.exact && height.covers) {
    reasons.push({
      code: 'ajuste-altura',
      text: 'Se ajusta a la altura que pides sin quedar sobredimensionada.'
    });
  }

  if (configuration) {
    reasons.push({
      code: 'configuracion-compatible',
      text: 'Incluye la configuración «' + configuration.name + '».'
    });
  }

  const formas = distinctTypes(product);
  if (formas >= 3) {
    reasons.push({
      code: 'configuraciones-declaradas',
      text: 'El fabricante declara ' + product.configurations.length + ' configuraciones distintas.'
    });
  }

  if (contexto.candidateCount > 1 && contexto.cheapestId === product.id) {
    reasons.push({
      code: 'precio-mas-bajo',
      text: 'Es la opción más económica de las que cubren tu altura (' + product.precio + ').'
    });
  }

  if (contexto.candidateCount > 1 && contexto.lightestId === product.id && product.specifications.weightKg !== UNKNOWN) {
    reasons.push({
      code: 'mas-ligera',
      text: 'Es la más ligera de las opciones (' + formatKg(product.specifications.weightKg) + ').'
    });
  }

  if (product.specifications.maxLoadKg !== UNKNOWN) {
    reasons.push({
      code: 'carga-declarada',
      text: 'Carga máxima declarada por el fabricante: ' + formatKg(product.specifications.maxLoadKg) + '.'
    });
  }

  return reasons;
}

function buildWarnings(product: Product, scenario: Scenario, height: HeightEvidence): Warning[] {
  const warnings: Warning[] = [];

  if (height.kind === 'derived-from-ladder-length') {
    warnings.push({
      code: 'altura-de-trabajo-no-declarada',
      text:
        'El fabricante no publica altura de trabajo: el cálculo parte de la longitud declarada de ' +
        formatMetros(height.available as number) +
        '.'
    });
  }

  if (height.kind === 'unknown') {
    warnings.push({
      code: 'altura-no-declarada',
      text: 'Este producto no declara ninguna altura, así que no se ha podido comprobar si cubre lo que necesitas.'
    });
  }

  if (height.kind === 'declared-work-height' && ENVIRONMENTS_WITH_TOP_EXTENSION.includes(scenario.environment)) {
    warnings.push({
      code: 'sobresaliente-no-contemplado',
      text:
        'La altura de trabajo declarada no indica cuánto sobresale la escalera por encima del punto de apoyo, ' +
        'que en fachada y tejado es lo que determina la longitud a contratar.'
    });
  }

  if (scenario.task === TaskType.TRABAJO_SOBRE_PLATAFORMA && product.capabilities.maxPlatformHeight === UNKNOWN) {
    warnings.push({
      code: 'altura-plataforma-no-declarada',
      text: 'No hay altura de plataforma declarada para este producto, así que no se puede confirmar a qué altura queda la superficie de trabajo.'
    });
  }

  if (product.capabilities.supportedEnvironments === UNKNOWN) {
    warnings.push({
      code: 'entorno-no-declarado',
      text: 'El fabricante no declara compatibilidad por entorno; ese criterio no ha podido puntuarse.'
    });
  }

  return warnings;
}

function computeConfidence(product: Product, scenario: Scenario, height: HeightEvidence): number {
  let confianza = 1;

  if (height.kind === 'declared-work-height') confianza *= CONFIDENCE_FACTORS.declaredWorkHeight;
  else if (height.kind === 'derived-from-ladder-length') confianza *= CONFIDENCE_FACTORS.derivedFromLadderLength;
  else confianza *= CONFIDENCE_FACTORS.unknownHeight;

  if (product.capabilities.supportedEnvironments === UNKNOWN) confianza *= CONFIDENCE_FACTORS.unknownEnvironment;

  if (scenario.task === TaskType.TRABAJO_SOBRE_PLATAFORMA && product.capabilities.maxPlatformHeight === UNKNOWN) {
    confianza *= CONFIDENCE_FACTORS.unknownPlatformHeight;
  }

  return round(confianza, 2);
}

function computeMatch(height: HeightEvidence): MatchLevel {
  if (height.kind === 'unknown') return 'marginal';
  if (!height.covers) return 'none';
  if (height.fit >= MATCH_THRESHOLDS.exact) return 'exact';
  if (height.fit >= MATCH_THRESHOLDS.good) return 'good';
  return 'marginal';
}

/* ------------------------------------------------------------------ *
 * API pública
 * ------------------------------------------------------------------ */

function validateScenario(scenario: Scenario): void {
  if (!scenario || typeof scenario !== 'object') throw new TypeError('scenario es obligatorio');
  if (typeof scenario.targetHeight !== 'number' || !Number.isFinite(scenario.targetHeight) || scenario.targetHeight <= 0) {
    throw new TypeError('scenario.targetHeight debe ser un número de metros positivo');
  }
  if (!isTaskType(scenario.task)) throw new TypeError('scenario.task no es un TaskType válido');
  if (!isEnvironmentType(scenario.environment)) throw new TypeError('scenario.environment no es un EnvironmentType válido');
  if (
    scenario.userHeight !== undefined &&
    (typeof scenario.userHeight !== 'number' || !Number.isFinite(scenario.userHeight) || scenario.userHeight <= 0)
  ) {
    throw new TypeError('scenario.userHeight, si se envía, debe ser un número de metros positivo');
  }
}

/**
 * Devuelve la mejor recomendación y sus alternativas para un escenario.
 *
 * Es una función pura: no muta `products`, no lee estado global y el orden del
 * resultado está totalmente determinado por las entradas.
 *
 * @param scenario Qué necesita la persona.
 * @param products Catálogo a evaluar. El motor no importa datos por su cuenta.
 */
export function recommendLadder(scenario: Scenario, products: readonly Product[]): RecommendationResult {
  validateScenario(scenario);
  if (!Array.isArray(products)) throw new TypeError('products debe ser un array de Product');

  const requirement = computeRequirement(scenario);

  const scenarioNotes: string[] = [];
  if (scenario.userHeight !== undefined) {
    scenarioNotes.push(
      'Se ha recibido userHeight (' +
        formatMetros(scenario.userHeight) +
        ') pero no se ha usado: ningún fabricante publica el alcance sobre el último peldaño con el que combinarla.'
    );
  }

  // --- Restricciones duras -------------------------------------------------
  const evaluados = products.map((product) => {
    const height = evaluateHeight(product, requirement);
    return { product, height, rejection: checkHardConstraints(product, scenario, height) };
  });

  const rejected = evaluados
    .filter((evaluado): evaluado is typeof evaluado & { rejection: RejectedProduct } => evaluado.rejection !== null)
    .map((evaluado) => evaluado.rejection);

  const elegibles = evaluados.filter((evaluado) => evaluado.rejection === null);

  if (!elegibles.length) {
    const closest =
      [...rejected].sort((a, b) => {
        const da = a.deficitM ?? Number.POSITIVE_INFINITY;
        const db = b.deficitM ?? Number.POSITIVE_INFINITY;
        return da - db || a.product.id - b.product.id;
      })[0] ?? null;

    return Object.freeze({
      status: 'no_exact_match' as const,
      scenario,
      scenarioNotes: Object.freeze(scenarioNotes),
      requirement,
      best: null,
      alternatives: Object.freeze([]),
      closest,
      rejected: Object.freeze(rejected)
    });
  }

  // --- Contexto de puntuación (depende del conjunto de candidatos) ----------
  const precios = elegibles
    .map((evaluado) => parsePrecioEur(evaluado.product.precio))
    .filter((precio): precio is number => precio !== UNKNOWN);

  const pesos = elegibles
    .map((evaluado) => ({ id: evaluado.product.id, kg: evaluado.product.specifications.weightKg }))
    .filter((entrada): entrada is { id: number; kg: number } => entrada.kg !== UNKNOWN);

  const minPrice = precios.length ? Math.min(...precios) : UNKNOWN;
  const maxPrice = precios.length ? Math.max(...precios) : UNKNOWN;

  const cheapest =
    minPrice === UNKNOWN
      ? UNKNOWN
      : ([...elegibles]
          .filter((evaluado) => parsePrecioEur(evaluado.product.precio) === minPrice)
          .sort((a, b) => a.product.id - b.product.id)[0]?.product.id ?? UNKNOWN);

  const lightest =
    pesos.length === 0
      ? UNKNOWN
      : [...pesos].sort((a, b) => a.kg - b.kg || a.id - b.id)[0].id;

  const contexto: ScoringContext = {
    maxDistinctTypes: Math.max(...elegibles.map((evaluado) => distinctTypes(evaluado.product))),
    minPrice,
    maxPrice,
    cheapestId: cheapest,
    lightestId: lightest,
    candidateCount: elegibles.length
  };

  // --- Fit Score y explicación --------------------------------------------
  const recomendaciones: Recommendation[] = elegibles.map(({ product, height }) => {
    const configuration = selectConfiguration(product, scenario);
    const breakdown = buildBreakdown([
      scoreHeight(height),
      scoreTask(product, configuration, scenario),
      scoreEnvironment(product, scenario),
      scoreVersatility(product, contexto),
      scorePrice(product, contexto)
    ]);

    return Object.freeze({
      product,
      configuration,
      score: breakdown.total,
      match: computeMatch(height),
      confidence: computeConfidence(product, scenario, height),
      reasons: Object.freeze(buildReasons(product, configuration, height, contexto)),
      warnings: Object.freeze(buildWarnings(product, scenario, height)),
      height,
      breakdown
    });
  });

  // Orden determinista: score, luego ajuste de altura, luego precio, luego id.
  const ordenadas = [...recomendaciones].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.height.fit !== a.height.fit) return b.height.fit - a.height.fit;
    const precioA = parsePrecioEur(a.product.precio) ?? Number.POSITIVE_INFINITY;
    const precioB = parsePrecioEur(b.product.precio) ?? Number.POSITIVE_INFINITY;
    if (precioA !== precioB) return precioA - precioB;
    return a.product.id - b.product.id;
  });

  const best = ordenadas[0] ?? null;
  const status: ResultStatus = best && (best.match === 'exact' || best.match === 'good') ? 'ok' : 'no_exact_match';

  return Object.freeze({
    status,
    scenario,
    scenarioNotes: Object.freeze(scenarioNotes),
    requirement,
    best,
    alternatives: Object.freeze(ordenadas.slice(1)),
    closest: null,
    rejected: Object.freeze(rejected)
  });
}
