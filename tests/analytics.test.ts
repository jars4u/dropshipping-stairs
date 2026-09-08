import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CALCULATOR_EVENTS,
  CalculatorEvent,
  ClickPosition,
  sanitizeProperties,
  trackCalculator
} from '../src/lib/analytics.ts';

const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');

test('la taxonomía de eventos es exactamente la acordada', () => {
  assert.deepEqual(
    [...CALCULATOR_EVENTS],
    [
      'calculator_started',
      'calculator_height_selected',
      'calculator_task_selected',
      'calculator_environment_selected',
      'calculator_recommendation_viewed',
      'calculator_product_clicked'
    ]
  );
});

test('no se crea un segundo sistema de analytics', () => {
  const fuente = leer('../src/lib/analytics.ts');
  assert.ok(fuente.includes("from '@vercel/analytics'"), 'debe apoyarse en el mecanismo existente');

  // Ningún otro proveedor ni endpoint propio.
  const otros = /gtag|dataLayer|posthog|plausible|segment|mixpanel|amplitude|fetch\(|XMLHttpRequest|sendBeacon/i;
  assert.ok(!otros.test(fuente), 'no debe haber un segundo canal de envío');

  // Y el componente sólo envía a través de esta fachada.
  const componente = leer('../src/components/Calculadora.jsx');
  assert.ok(!/@vercel\/analytics/.test(componente), 'la UI no llama a track() directamente');
  assert.ok(componente.includes("from '../lib/analytics.ts'"));
});

test('sanitizeProperties es la barrera anti-PII: sólo deja pasar primitivos', () => {
  const limpio = sanitizeProperties({
    height_m: 3.5,
    task: 'acceso',
    activo: true,
    vacio: null,
    ausente: undefined,
    usuario: { email: 'persona@ejemplo.com', nombre: 'Persona' },
    historial: ['/una-url', '/otra'],
    callback: () => 'x',
    roto: Number.NaN
  });

  assert.deepEqual(limpio, { height_m: 3.5, task: 'acceso', activo: true, vacio: null });
  // Lo importante: nada del objeto anidado sobrevive en ninguna forma.
  assert.ok(!JSON.stringify(limpio).includes('ejemplo.com'));
  assert.ok(!JSON.stringify(limpio).includes('una-url'));
});

test('sanitizeProperties recorta cadenas largas', () => {
  const limpio = sanitizeProperties({ largo: 'x'.repeat(500) });
  assert.equal(typeof limpio.largo, 'string');
  assert.ok((limpio.largo as string).length <= 64);
});

test('trackCalculator no lanza nunca, ni siquiera en servidor', () => {
  assert.equal(typeof globalThis.window, 'undefined', 'este test corre sin DOM');
  assert.doesNotThrow(() => trackCalculator(CalculatorEvent.STARTED));
  assert.doesNotThrow(() => trackCalculator(CalculatorEvent.HEIGHT_SELECTED, { height_m: 3.5 }));
  // Aunque le pasen basura.
  assert.doesNotThrow(() => trackCalculator(CalculatorEvent.PRODUCT_CLICKED, { raro: { a: { b: 1 } } }));
});

test('el calculador emite los seis eventos del flujo', () => {
  const componente = leer('../src/components/Calculadora.jsx');

  for (const evento of ['STARTED', 'HEIGHT_SELECTED', 'TASK_SELECTED', 'ENVIRONMENT_SELECTED', 'RECOMMENDATION_VIEWED', 'PRODUCT_CLICKED']) {
    assert.ok(componente.includes('CalculatorEvent.' + evento), 'falta emitir ' + evento);
  }
});

test('el click de producto distingue desde dónde se pulsa', () => {
  assert.deepEqual(Object.values(ClickPosition), ['best', 'alternative', 'closest', 'datasheet']);

  const componente = leer('../src/components/Calculadora.jsx');
  for (const posicion of ['BEST', 'ALTERNATIVE', 'CLOSEST', 'DATASHEET']) {
    assert.ok(componente.includes('ClickPosition.' + posicion), 'falta la posición ' + posicion);
  }
});

test('ninguna propiedad enviada puede identificar a una persona', () => {
  const componente = leer('../src/components/Calculadora.jsx');

  // Las claves que se envían desde la UI, extraídas del propio fuente.
  const sospechosas = /\b(email|correo|nombre_usuario|user_name|telefono|phone|ip|user_id|session_id|cookie)\b/i;
  assert.ok(!sospechosas.test(componente), 'aparece una clave que podría llevar PII');
});
