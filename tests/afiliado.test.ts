import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { catalogo } from '../src/data/catalogo.ts';
import {
  AFFILIATE_DISCLOSURE,
  AFFILIATE_LINK_REL,
  AFFILIATE_TAG,
  construirUrlAfiliado
} from '../src/lib/afiliado.ts';

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

/**
 * La frase que exige el Acuerdo de Funcionamiento de Amazon España, tal cual.
 * Si alguien la parafrasea o la recorta, este fichero falla.
 */
const FRASE_EXIGIDA =
  'En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables';

/* ================================================================== *
 * La declaración
 * ================================================================== */

test('la declaración es literalmente la que exige Amazon', () => {
  assert.ok(AFFILIATE_DISCLOSURE.includes(FRASE_EXIGIDA), 'la frase no puede reescribirse');
  assert.equal(AFFILIATE_DISCLOSURE, FRASE_EXIGIDA + '.');
});

test('el sitio se identifica como afiliado en el pie, en todas las páginas', () => {
  const index = leer('../src/pages/index.astro');
  const pie = index.slice(index.indexOf('<footer'));

  assert.ok(pie.includes('AFFILIATE_DISCLOSURE'), 'el pie debe llevar la declaración');
  // Y sale de la constante, no de un texto copiado que pueda divergir.
  assert.ok(!pie.includes('En calidad de Afiliado'), 'no se duplica el texto a mano');
});

/* ================================================================== *
 * Cerca de los enlaces
 * ================================================================== */

test('cada bloque de enlaces de afiliado lleva la declaración al lado', () => {
  const calculadora = leer('../src/components/Calculadora.jsx');

  // Los cuatro sitios del calculador desde los que se sale hacia Amazon.
  const bloques = [
    ['ResultadoSinCobertura', 'ClickPosition.CLOSEST'],
    ['TuMejorOpcion', 'ClickPosition.BEST'],
    ['Alternativas', 'ClickPosition.ALTERNATIVE'],
    ['FichaTecnica', 'ClickPosition.DATASHEET']
  ];

  for (const [nombre, marca] of bloques) {
    const inicio = calculadora.indexOf('function ' + nombre + '(');
    assert.ok(inicio > 0, 'no se encuentra ' + nombre);

    // El cuerpo del componente, hasta el siguiente componente de nivel superior.
    const siguiente = calculadora.indexOf('\nfunction ', inicio + 1);
    const cuerpo = calculadora.slice(inicio, siguiente === -1 ? undefined : siguiente);

    assert.ok(cuerpo.includes(marca), nombre + ' debería enlazar a Amazon');
    assert.ok(cuerpo.includes('<AvisoAfiliado'), nombre + ' enlaza a Amazon sin declaración cerca');
  }
});

test('el catálogo de productos también la lleva junto a su rejilla de enlaces', () => {
  const catalogoAstro = leer('../src/components/CatalogoProductos.astro');

  assert.ok(catalogoAstro.includes('construirUrlAfiliado'), 'la sección enlaza a Amazon');
  assert.ok(catalogoAstro.includes('AFFILIATE_DISCLOSURE'), 'y debe declararlo');
});

test('el aviso muestra la constante, nunca una copia editada a mano', () => {
  const calculadora = leer('../src/components/Calculadora.jsx');
  assert.ok(calculadora.includes('{AFFILIATE_DISCLOSURE}'));
  assert.ok(!calculadora.includes('En calidad de Afiliado'), 'el texto no se escribe suelto');
});

/* ================================================================== *
 * Los enlaces
 * ================================================================== */

test('todo enlace de afiliado sale del mismo constructor y lleva el tag', () => {
  for (const producto of catalogo) {
    const url = construirUrlAfiliado(producto.asin);
    assert.ok(url.startsWith('https://www.amazon.es/dp/' + producto.asin));
    assert.ok(url.includes('tag=' + AFFILIATE_TAG), producto.nombre + ' sin atribución');
  }
});

test('el tag no está escrito a mano en ningún otro sitio', () => {
  for (const ruta of [
    '../src/components/Calculadora.jsx',
    '../src/components/CatalogoProductos.astro',
    '../src/components/calculadoraFlow.ts',
    '../src/pages/index.astro'
  ]) {
    const fuente = leer(ruta);
    assert.ok(!fuente.includes(AFFILIATE_TAG), ruta + ' duplica el tag de afiliado');
    assert.ok(!fuente.includes('amazon.es/dp/'), ruta + ' construye la URL por su cuenta');
  }
});

test('los enlaces se marcan como patrocinados', () => {
  assert.ok(AFFILIATE_LINK_REL.includes('sponsored'), 'lo piden las directrices de Google');
  assert.ok(AFFILIATE_LINK_REL.includes('noopener'));
  assert.ok(AFFILIATE_LINK_REL.includes('noreferrer'));

  // Y ningún enlace a Amazon se queda con el rel genérico.
  for (const ruta of ['../src/components/Calculadora.jsx', '../src/components/CatalogoProductos.astro']) {
    const fuente = leer(ruta);
    assert.ok(fuente.includes('AFFILIATE_LINK_REL'), ruta + ' no usa el rel de afiliado');
    assert.ok(!/rel="noopener noreferrer"/.test(fuente), ruta + ' deja un enlace sin marcar como patrocinado');
  }
});

test('la declaración llega al HTML publicado', () => {
  let html: string;
  try {
    html = leer('../dist/index.html');
  } catch {
    return; // Sin build previo no hay nada que comprobar.
  }

  const apariciones = html.split(FRASE_EXIGIDA).length - 1;
  assert.ok(apariciones >= 2, 'debe verse al menos en el pie y junto al catálogo, salieron ' + apariciones);

  // Ningún enlace a Amazon sin marcar como patrocinado.
  const enlaces = html.match(/<a[^>]*amazon\.es[^>]*>/g) ?? [];
  assert.ok(enlaces.length > 0, 'el HTML debería traer enlaces de afiliado');
  for (const enlace of enlaces) {
    assert.ok(enlace.includes('tag=' + AFFILIATE_TAG), 'enlace sin atribución: ' + enlace.slice(0, 90));
    assert.ok(enlace.includes('sponsored'), 'enlace sin rel sponsored: ' + enlace.slice(0, 90));
  }
});
