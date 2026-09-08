/**
 * Lógica del flujo del calculador, separada de React.
 *
 * El componente sólo pinta: aquí viven el estado de las tres preguntas, las
 * opciones que se pueden ofrecer y la llamada al Recommendation Engine. Así el
 * flujo se puede probar sin DOM y sin montar componentes.
 *
 * Nada de este módulo inventa compatibilidades: las opciones de tarea salen de
 * lo que el catálogo declara soportar, y las de entorno salen del enum del
 * dominio (ver `environmentCompatibilityIsDeclared` para el matiz importante).
 */

import { catalogo } from '../data/catalogo.ts';
import { EnvironmentType, TaskType, UNKNOWN } from '../domain/types.ts';
import {
  formatMetros,
  parsePrecioEur,
  recommendLadder,
  type HeightRequirement,
  type MatchLevel,
  type Recommendation,
  type RecommendationResult,
  type Scenario
} from '../domain/recommendation.ts';
import type { Product } from '../domain/product.ts';

/** Rango del slider de altura, en metros. */
export const HEIGHT_RANGE = Object.freeze({ min: 2, max: 6.5, step: 0.1, initial: 3.5 });

export interface Option<T extends string> {
  value: T;
  titulo: string;
  descripcion: string;
  icono: string;
}

/**
 * Presentación de cada TaskType. Se filtra después contra lo que el catálogo
 * declara: si ningún producto soportara una tarea, su opción no se ofrece.
 */
const TASK_PRESENTATION: readonly Option<TaskType>[] = Object.freeze([
  {
    value: TaskType.ACCESO,
    titulo: 'Subir y trabajar apoyado',
    descripcion: 'Alcanzar un punto concreto: una lámpara, un canalón, una rama.',
    icono: '↗'
  },
  {
    value: TaskType.TRABAJO_SOBRE_PLATAFORMA,
    titulo: 'Trabajar sobre plataforma',
    descripcion: 'De pie sobre una superficie estable y con las manos libres.',
    icono: '▭'
  }
]);

/** Presentación de cada EnvironmentType. Textos e iconos ya existentes en la UI. */
const ENVIRONMENT_PRESENTATION: readonly Option<EnvironmentType>[] = Object.freeze([
  { value: EnvironmentType.INTERIOR, titulo: 'Interior', descripcion: 'Techos, lámparas, trasteros', icono: '⌂' },
  { value: EnvironmentType.FACHADA, titulo: 'Fachada', descripcion: 'Pintar, ventanas, paredes', icono: '□' },
  { value: EnvironmentType.TEJADO, titulo: 'Tejado', descripcion: 'Canalones, cubiertas, podas', icono: '⌁' }
]);

/** Sólo las tareas que al menos un producto del catálogo declara soportar. */
export function taskOptions(products: readonly Product[] = catalogo): readonly Option<TaskType>[] {
  const soportadas = new Set(products.flatMap((producto) => producto.capabilities.supportedTasks ?? []));
  return TASK_PRESENTATION.filter((opcion) => soportadas.has(opcion.value));
}

/**
 * Entornos que se pueden ofrecer.
 *
 * Ojo al matiz: el entorno es una característica del TRABAJO de la persona, no
 * una capacidad del producto, y es lo que decide si la escalera debe sobresalir
 * por encima del punto de apoyo. Por eso se ofrecen los tres del dominio.
 *
 * Lo que NO se hace es afirmar que un producto concreto sea apto para un
 * entorno: eso sí sería inventar, y ningún fabricante lo declara. La UI lo dice
 * explícitamente apoyándose en `environmentCompatibilityIsDeclared`.
 */
export function environmentOptions(): readonly Option<EnvironmentType>[] {
  return ENVIRONMENT_PRESENTATION;
}

/** ¿Algún producto declara para qué entornos sirve? Hoy: ninguno. */
export function environmentCompatibilityIsDeclared(products: readonly Product[] = catalogo): boolean {
  return products.some((producto) => producto.capabilities.supportedEnvironments !== UNKNOWN);
}

export interface FlowState {
  targetHeight: number;
  task: TaskType;
  environment: EnvironmentType;
  /** true en cuanto se ha pulsado "Ver mi recomendación" al menos una vez. */
  submitted: boolean;
}

export function createInitialFlowState(): FlowState {
  return {
    targetHeight: HEIGHT_RANGE.initial,
    task: TaskType.ACCESO,
    environment: EnvironmentType.INTERIOR,
    submitted: false
  };
}

const clampHeight = (valor: number): number => {
  if (!Number.isFinite(valor)) return HEIGHT_RANGE.initial;
  const acotado = Math.min(HEIGHT_RANGE.max, Math.max(HEIGHT_RANGE.min, valor));
  return Math.round(acotado * 10) / 10;
};

/**
 * Los tres cambios de respuesta. Conservan `submitted`: una vez visto el
 * resultado, cambiar una respuesta lo actualiza en vez de esconderlo.
 */
export const setTargetHeight = (state: FlowState, targetHeight: number): FlowState => ({
  ...state,
  targetHeight: clampHeight(targetHeight)
});

export const setTask = (state: FlowState, task: TaskType): FlowState => ({ ...state, task });

export const setEnvironment = (state: FlowState, environment: EnvironmentType): FlowState => ({
  ...state,
  environment
});

/** Lo que hace el CTA "Ver mi recomendación". */
export const submit = (state: FlowState): FlowState => ({ ...state, submitted: true });

export const toScenario = (state: FlowState): Scenario => ({
  targetHeight: state.targetHeight,
  task: state.task,
  environment: state.environment
});

/**
 * Ejecuta el motor. Devuelve null mientras no se haya pulsado el CTA: el
 * cálculo no se lanza antes de que la persona lo pida.
 */
export function runRecommendation(
  state: FlowState,
  products: readonly Product[] = catalogo
): RecommendationResult | null {
  if (!state.submitted) return null;
  return recommendLadder(toScenario(state), products);
}

/**
 * Duración del estado "buscando" que se muestra tras pulsar el CTA.
 *
 * El motor es instantáneo: esto es feedback de interfaz, no tiempo de cálculo.
 * Corto a propósito — lo justo para que el cambio de pantalla se lea como una
 * búsqueda y no como un salto brusco.
 */
export const SEARCH_FEEDBACK_MS = 900;

/** Cuántos modelos se comparan. Sale del catálogo, no de una constante suelta. */
export const CATALOG_SIZE = catalogo.length;

/** Lo que el motor hace de verdad, en orden, para el checklist de la espera. */
export const SEARCH_STEPS: readonly string[] = Object.freeze([
  'Midiendo la longitud de escalera que necesitas',
  'Descartando los modelos que no llegan',
  'Comparando configuraciones y precio'
]);

/** Etiquetas de nivel de coincidencia. Describen ajuste técnico, no idoneidad. */
export const MATCH_LABELS: Readonly<Record<MatchLevel, string>> = Object.freeze({
  exact: 'Coincidencia exacta',
  good: 'Muy buena coincidencia',
  marginal: 'Coincidencia parcial',
  none: 'Sin coincidencia'
});

/**
 * Fuerza de la coincidencia sobre 3, para pintarla sin depender del color
 * (tres puntos, de los que se rellenan N).
 */
export const MATCH_STRENGTH: Readonly<Record<MatchLevel, number>> = Object.freeze({
  exact: 3,
  good: 2,
  marginal: 1,
  none: 0
});

/** 14.5 -> "14,5 kg" */
const formatKg = (kg: number): string => String(kg).replace('.', ',') + ' kg';

const tiposDistintos = (recomendacion: Recommendation): number =>
  new Set(recomendacion.product.configurations.map((configuracion) => configuracion.type)).size;

export interface DetailRow {
  etiqueta: string;
  valor: string;
}

/**
 * Filas de contexto de la tarjeta: lo que se pidió y con qué dato del
 * fabricante se ha comparado.
 *
 * Una fila sólo aparece si su dato existe. Sin configuración elegida no hay
 * fila de configuración; sin altura declarada no hay fila de altura. Nunca se
 * rellena un hueco con un valor inventado.
 */
export function summaryRows(recomendacion: Recommendation, requirement: HeightRequirement): DetailRow[] {
  const { kind, available } = recomendacion.height;

  const filas: DetailRow[] = [
    { etiqueta: 'Tu necesidad', valor: formatAltura(requirement.targetHeight) + ' m de altura de trabajo' }
  ];

  // La longitud requerida sólo se enseña cuando es el número contra el que se ha
  // comparado. Si el fabricante publica altura de trabajo, el motor usa esa, y
  // sacar aquí la longitud geométrica haría parecer que el producto no llega.
  if (kind !== 'declared-work-height') {
    filas.push({ etiqueta: 'Escalera necesaria', valor: formatMetros(requirement.requiredLadderLength) });
  }

  if (recomendacion.configuration) {
    filas.push({ etiqueta: 'Configuración', valor: '«' + recomendacion.configuration.name + '»' });
  }

  if (available !== UNKNOWN && kind === 'declared-work-height') {
    filas.push({ etiqueta: 'Altura de trabajo declarada', valor: formatMetros(available) });
  } else if (available !== UNKNOWN && kind === 'derived-from-ladder-length') {
    filas.push({ etiqueta: 'Longitud declarada', valor: formatMetros(available) });
  }

  return filas;
}

export type AlternativeDifferenceCode =
  | 'mas-alcance'
  | 'mas-economica'
  | 'mas-carga'
  | 'mas-ligera'
  | 'mas-configuraciones'
  | 'uso-profesional'
  | 'otra-opcion';

export interface AlternativeDifference {
  code: AlternativeDifferenceCode;
  label: string;
  detail: string;
}

/**
 * Diferencias candidatas entre una alternativa y la recomendada, en orden de
 * relevancia comercial. Cada una compara un campo declarado por AMBOS
 * productos: si a uno le falta el dato, esa diferencia no se ofrece.
 *
 * Prohibido a propósito: nada de "mejor calidad-precio" ni etiquetas de
 * marketing sintéticas. El `badge` del producto se muestra tal cual porque es
 * un dato del catálogo, no algo que calcule este módulo.
 */
function diferenciasPosibles(alternativa: Recommendation, mejor: Recommendation): AlternativeDifference[] {
  const a = alternativa.product;
  const b = mejor.product;
  const diferencias: AlternativeDifference[] = [];

  const alcanceA = a.capabilities.maxLadderLength;
  const alcanceB = b.capabilities.maxLadderLength;
  if (alcanceA !== UNKNOWN && alcanceB !== UNKNOWN && alcanceA > alcanceB) {
    diferencias.push({
      code: 'mas-alcance',
      label: 'Más alcance',
      detail: 'Llega a ' + formatMetros(alcanceA) + ' frente a ' + formatMetros(alcanceB) + '.'
    });
  }

  const precioA = parsePrecioEur(a.precio);
  const precioB = parsePrecioEur(b.precio);
  if (precioA !== UNKNOWN && precioB !== UNKNOWN && precioA < precioB) {
    diferencias.push({
      code: 'mas-economica',
      label: 'Alternativa más económica',
      detail: a.precio + ' frente a ' + b.precio + '.'
    });
  }

  const cargaA = a.specifications.maxLoadKg;
  const cargaB = b.specifications.maxLoadKg;
  if (cargaA !== UNKNOWN && cargaB !== UNKNOWN && cargaA > cargaB) {
    diferencias.push({
      code: 'mas-carga',
      label: 'Soporta más carga',
      detail: 'Carga máxima declarada de ' + formatKg(cargaA) + ' frente a ' + formatKg(cargaB) + '.'
    });
  }

  const pesoA = a.specifications.weightKg;
  const pesoB = b.specifications.weightKg;
  if (pesoA !== UNKNOWN && pesoB !== UNKNOWN && pesoA < pesoB) {
    diferencias.push({
      code: 'mas-ligera',
      label: 'Más ligera',
      detail: 'Pesa ' + formatKg(pesoA) + ' frente a ' + formatKg(pesoB) + '.'
    });
  }

  if (tiposDistintos(alternativa) > tiposDistintos(mejor)) {
    diferencias.push({
      code: 'mas-configuraciones',
      label: 'Más configuraciones',
      detail: a.configurations.length + ' formas de montaje declaradas frente a ' + b.configurations.length + '.'
    });
  }

  // Coincidencia literal contra `declaredUses`, que sale de la ficha de Amazon.
  const USO_PROFESIONAL = 'uso profesional';
  if (
    a.specifications.declaredUses.includes(USO_PROFESIONAL) &&
    !b.specifications.declaredUses.includes(USO_PROFESIONAL)
  ) {
    diferencias.push({
      code: 'uso-profesional',
      label: 'Más orientada a uso profesional',
      detail: 'El fabricante la describe para uso profesional.'
    });
  }

  return diferencias;
}

/**
 * Asigna a cada alternativa su diferencia principal, evitando repetir etiqueta
 * entre alternativas: si dos coinciden en la primera, la segunda baja a su
 * siguiente diferencia real. Determinista, porque el orden de entrada lo es.
 */
export function describeAlternatives(
  alternativas: readonly Recommendation[],
  mejor: Recommendation
): AlternativeDifference[] {
  const usadas = new Set<AlternativeDifferenceCode>();

  return alternativas.map((alternativa) => {
    const posibles = diferenciasPosibles(alternativa, mejor);
    const elegida = posibles.find((diferencia) => !usadas.has(diferencia.code)) ?? posibles[0];

    if (elegida) {
      usadas.add(elegida.code);
      return elegida;
    }

    return {
      code: 'otra-opcion' as const,
      label: 'Otra opción válida',
      detail: 'También cubre la altura que has pedido.'
    };
  });
}

/** Cuántas alternativas se muestran como máximo. */
export const MAX_ALTERNATIVES = 2;

/** 3.5 -> "3,5" */
export const formatAltura = (metros: number): string => metros.toFixed(1).replace('.', ',');

export const construirUrlAfiliado = (asin: string, afiliado = 'jars4u2-21'): string =>
  `https://www.amazon.es/dp/${asin}?tag=${afiliado}`;
