/**
 * Programa de Afiliados de Amazon España.
 *
 * Fuente única del identificador de afiliado, de la construcción de enlaces y
 * del texto de divulgación que exige el Acuerdo de Funcionamiento. Antes el tag
 * estaba escrito a mano en dos ficheros distintos: si uno se quedaba atrás, esos
 * enlaces dejaban de atribuir la comisión sin que nada fallara visiblemente.
 */

/** Identificador de afiliado de Amazon.es. */
export const AFFILIATE_TAG = 'jars4u2-21';

/**
 * Declaración exigida por Amazon España, literal.
 *
 * No se parafrasea ni se recorta: el Acuerdo de Funcionamiento pide esta frase.
 * Debe aparecer de forma clara y cerca de los enlaces de afiliado, además de
 * identificar al sitio como afiliado en todas las páginas.
 */
export const AFFILIATE_DISCLOSURE =
  'En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.';

/**
 * `rel` de todo enlace de afiliado.
 *
 * `sponsored` marca el enlace como remunerado, que es lo que piden las
 * directrices de Google para enlaces de afiliación; `noopener noreferrer`
 * cubre la apertura en pestaña nueva.
 */
export const AFFILIATE_LINK_REL = 'sponsored noopener noreferrer';

/** Enlace a la ficha de Amazon.es con la atribución de afiliado. */
export const construirUrlAfiliado = (asin: string, tag: string = AFFILIATE_TAG): string =>
  `https://www.amazon.es/dp/${asin}?tag=${tag}`;
