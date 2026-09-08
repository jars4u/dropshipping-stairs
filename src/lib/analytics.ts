/**
 * Analytics del calculador.
 *
 * Se apoya en el mecanismo que ya usa el proyecto: `@vercel/analytics`, montado
 * en `src/pages/index.astro` con `<Analytics />`. Esto NO es un segundo sistema:
 * es una fachada tipada sobre `track()` para que los nombres de evento y sus
 * propiedades estén en un solo sitio.
 *
 * SIN PII
 * -------
 * Ningún evento lleva identidad del usuario: ni email, ni nombre, ni IP, ni id
 * de sesión, ni texto libre. Sólo las respuestas del calculador (números y
 * valores de enum) y el identificador público del producto (ASIN de Amazon).
 * `sanitizeProperties` es la barrera: descarta cualquier valor que no sea un
 * primitivo y recorta las cadenas largas, de modo que no puede colarse un
 * objeto con datos personales por descuido.
 */

import { track } from '@vercel/analytics';

/** Taxonomía de eventos del calculador. */
export const CalculatorEvent = {
  STARTED: 'calculator_started',
  HEIGHT_SELECTED: 'calculator_height_selected',
  TASK_SELECTED: 'calculator_task_selected',
  ENVIRONMENT_SELECTED: 'calculator_environment_selected',
  RECOMMENDATION_VIEWED: 'calculator_recommendation_viewed',
  PRODUCT_CLICKED: 'calculator_product_clicked'
} as const;

export type CalculatorEvent = (typeof CalculatorEvent)[keyof typeof CalculatorEvent];

export const CALCULATOR_EVENTS: readonly CalculatorEvent[] = Object.freeze(Object.values(CalculatorEvent));

/** Desde dónde se ha pulsado un producto. */
export const ClickPosition = {
  BEST: 'best',
  ALTERNATIVE: 'alternative',
  CLOSEST: 'closest',
  DATASHEET: 'datasheet'
} as const;

export type ClickPosition = (typeof ClickPosition)[keyof typeof ClickPosition];

/** Lo único que Vercel Analytics acepta como valor de propiedad. */
export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue>;

/** Longitud máxima de una cadena enviada. Nuestros valores son enums y ASINs. */
const MAX_STRING_LENGTH = 64;

/**
 * Deja pasar sólo primitivos y recorta cadenas.
 *
 * Es la barrera anti-PII: un objeto, un array o un valor que no sea primitivo
 * se descarta en lugar de serializarse, así que no hay forma de arrastrar sin
 * querer un `Product` entero o un formulario dentro de un evento.
 */
export function sanitizeProperties(properties: Record<string, unknown> = {}): AnalyticsProperties {
  const limpias: AnalyticsProperties = {};

  for (const [clave, valor] of Object.entries(properties)) {
    if (valor === undefined) continue;
    if (valor === null || typeof valor === 'boolean') {
      limpias[clave] = valor;
    } else if (typeof valor === 'number') {
      if (Number.isFinite(valor)) limpias[clave] = valor;
    } else if (typeof valor === 'string') {
      limpias[clave] = valor.slice(0, MAX_STRING_LENGTH);
    }
    // Cualquier otra cosa (objetos, arrays, funciones) se ignora a propósito.
  }

  return limpias;
}

/**
 * Envía un evento. Nunca lanza: la analítica no puede tumbar el calculador.
 * En servidor no hace nada, porque `<Analytics />` sólo existe en el cliente.
 */
export function trackCalculator(event: CalculatorEvent, properties: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  try {
    track(event, sanitizeProperties(properties));
  } catch {
    // Un fallo de analítica es irrelevante para la persona que está midiendo
    // su pared: se traga en silencio.
  }
}
