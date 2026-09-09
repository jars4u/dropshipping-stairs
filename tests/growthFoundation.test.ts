import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GET as getRobots } from '../src/pages/robots.txt.ts';
import { GET as getSitemap } from '../src/pages/sitemap.xml.ts';
import { SITE_URL } from '../src/lib/site.ts';

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

const respuesta = async (handler: typeof getRobots) => handler({} as never);

test('robots permite rastreo y referencia el sitemap canónico', async () => {
  const body = await (await respuesta(getRobots)).text();

  assert.match(body, /User-agent: \*/);
  assert.match(body, /Allow: \/\n/);
  assert.equal(body, `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

test('el sitemap contiene solamente las rutas públicas implementadas', async () => {
  const body = await (await respuesta(getSitemap)).text();

  assert.match(body, /<urlset[^>]*>/);
  assert.equal((body.match(/<url>/g) ?? []).length, 6);
  assert.ok(body.includes(`<loc>${SITE_URL}/</loc>`));
  assert.ok(body.includes(`<loc>${SITE_URL}/escalera-multifuncional-5-metros</loc>`));
  assert.ok(body.includes(`<loc>${SITE_URL}/escalera-telescopica-5-metros</loc>`));
  assert.ok(body.includes(`<loc>${SITE_URL}/escalera-4-en-1</loc>`));
  assert.ok(body.includes(`<loc>${SITE_URL}/escalera-para-techo</loc>`));
  assert.ok(body.includes(`<loc>${SITE_URL}/escalera-para-pintar</loc>`));
});

test('la homepage tiene metadata SEO de producción y noindex no está activo', () => {
  const index = leer('../src/pages/index.astro');

  assert.ok(index.includes('<html lang="es">'));
  assert.ok(index.includes('<meta name="robots" content="index,follow" />'));
  assert.ok(index.includes('rel="canonical" href={`${SITE_URL}/`}'));
  assert.ok(index.includes('property="og:url"'));
  assert.ok(index.includes('name="twitter:card" content="summary"'));
});

test('los componentes no presentan precios estáticos como precio actual', () => {
  const calculadora = leer('../src/components/Calculadora.jsx');
  const catalogo = leer('../src/components/CatalogoProductos.astro');

  assert.ok(calculadora.includes('Precio actual en Amazon'));
  assert.ok(catalogo.includes('Consulta el precio actual en Amazon'));
  assert.ok(!calculadora.includes('{product.precio}'));
  assert.ok(!catalogo.includes('{producto.precio}'));
});

test('la landing de cinco metros tiene ruta, intención y CTA funcionales', () => {
  const landing = leer('../src/pages/escalera-multifuncional-5-metros.astro');

  assert.ok(landing.includes('Escaleras multifuncionales de 5 metros: cuál necesitas realmente'));
  assert.ok(landing.includes('href="#calculadora"'));
  assert.ok(landing.includes('<Calculadora client:load />'));
  assert.ok(landing.includes("import { catalogo } from '../data/catalogo.ts';"));
  assert.ok(landing.includes('{catalogo.map'));
  assert.ok(landing.includes('href={construirUrlAfiliado(producto.asin)}'));
  assert.ok(landing.includes('rel={AFFILIATE_LINK_REL}'));
  assert.ok(landing.includes('No especificado'));
});

test('la landing telescópica reutiliza TEENO, afiliación y la calculadora', () => {
  const landing = leer('../src/pages/escalera-telescopica-5-metros.astro');

  assert.ok(landing.includes('Escalera telescópica de 5 metros: cómo elegirla'));
  assert.ok(landing.includes("const canonical = `${SITE_URL}/escalera-telescopica-5-metros`"));
  assert.ok(landing.includes('<Calculadora client:load />'));
  assert.ok(landing.includes('teeno.nombre'));
  assert.ok(landing.includes('teeno.specifications.weightKg'));
  assert.ok(landing.includes('teeno.capabilities.maxLadderLength'));
  assert.ok(landing.includes('href={construirUrlAfiliado(teeno.asin)}'));
  assert.ok(landing.includes('href="/escalera-multifuncional-5-metros"'));
  assert.ok(landing.includes('rel={AFFILIATE_LINK_REL}'));
  assert.ok(landing.includes('No se muestra un precio estático'));
});

test('la landing 4 en 1 reutiliza TecTake, afiliación y la calculadora', () => {
  const landing = leer('../src/pages/escalera-4-en-1.astro');

  assert.ok(landing.includes('Escalera 4 en 1: qué significa y cuál te conviene'));
  assert.ok(landing.includes("const canonical = `${SITE_URL}/escalera-4-en-1`"));
  assert.ok(landing.includes('<Calculadora client:load />'));
  assert.ok(landing.includes('tectake.nombre'));
  assert.ok(landing.includes('tectake.specifications.weightKg'));
  assert.ok(landing.includes('tectake.specifications.maxLoadKg'));
  assert.ok(landing.includes('href={construirUrlAfiliado(tectake.asin)}'));
  assert.ok(landing.includes('href="/escalera-multifuncional-5-metros"'));
  assert.ok(landing.includes('href="/escalera-telescopica-5-metros"'));
  assert.ok(landing.includes('rel={AFFILIATE_LINK_REL}'));
  assert.ok(landing.includes('No se muestra un precio estático'));
});

test('la landing para techo reutiliza catálogo, calculadora y afiliación', () => {
  const landing = leer('../src/pages/escalera-para-techo.astro');

  assert.ok(landing.includes('¿Qué escalera necesitas para trabajar en un techo?'));
  assert.ok(landing.includes("const canonical = `${SITE_URL}/escalera-para-techo`"));
  assert.ok(landing.includes('href="/calculadora"'));
  assert.ok(landing.includes('{producto.nombre}'));
  assert.ok(landing.includes('href={construirUrlAfiliado(producto.asin)}'));
  assert.ok(landing.includes('rel={AFFILIATE_LINK_REL}'));
  assert.ok(landing.includes('href="/escalera-multifuncional-5-metros"'));
  assert.ok(landing.includes('href="/escalera-telescopica-5-metros"'));
  assert.ok(landing.includes('href="/escalera-4-en-1"'));
  assert.ok(landing.includes('No se muestran precios estáticos'));
});

test('la ruta de calculadora existe como destino del CTA y no se indexa', () => {
  const calculadora = leer('../src/pages/calculadora.astro');

  assert.ok(calculadora.includes('<Calculadora client:load />'));
  assert.ok(calculadora.includes('<meta name="robots" content="noindex,follow" />'));
});

test('la landing para pintar reutiliza catálogo, calculadora y afiliación', () => {
  const landing = leer('../src/pages/escalera-para-pintar.astro');

  assert.ok(landing.includes('¿Qué escalera necesitas para pintar?'));
  assert.ok(landing.includes("const canonical = `${SITE_URL}/escalera-para-pintar`"));
  assert.ok(landing.includes('href="/calculadora"'));
  assert.ok(landing.includes('{producto.nombre}'));
  assert.ok(landing.includes('href={construirUrlAfiliado(producto.asin)}'));
  assert.ok(landing.includes('rel={AFFILIATE_LINK_REL}'));
  assert.ok(landing.includes('href="/escalera-para-techo"'));
  assert.ok(landing.includes('href="/escalera-multifuncional-5-metros"'));
  assert.ok(landing.includes('href="/escalera-telescopica-5-metros"'));
  assert.ok(landing.includes('href="/escalera-4-en-1"'));
  assert.ok(landing.includes('No se muestran precios estáticos'));
});
