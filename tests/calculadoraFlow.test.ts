import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { catalogo } from '../src/data/catalogo.ts';
import { createConfiguration, createProduct } from '../src/domain/product.ts';
import { ConfigurationType, EnvironmentType, TaskType, UNKNOWN } from '../src/domain/types.ts';
import {
  CATALOG_SIZE,
  HEIGHT_RANGE,
  MATCH_LABELS,
  SEARCH_FEEDBACK_MS,
  SEARCH_STEPS,
  construirUrlAfiliado,
  createInitialFlowState,
  environmentCompatibilityIsDeclared,
  environmentOptions,
  formatAltura,
  runRecommendation,
  setEnvironment,
  setTargetHeight,
  setTask,
  submit,
  taskOptions
} from '../src/components/calculadoraFlow.ts';

/* ================================================================== *
 * Paso 1 — altura
 * ================================================================== */

test('el flujo arranca con una altura por defecto dentro del rango', () => {
  const estado = createInitialFlowState();
  assert.equal(estado.targetHeight, HEIGHT_RANGE.initial);
  assert.ok(estado.targetHeight >= HEIGHT_RANGE.min && estado.targetHeight <= HEIGHT_RANGE.max);
  assert.equal(estado.submitted, false, 'no se calcula nada hasta pulsar el CTA');
});

test('seleccionar altura la actualiza y respeta el rango del slider', () => {
  const inicial = createInitialFlowState();

  assert.equal(setTargetHeight(inicial, 4.2).targetHeight, 4.2);
  assert.equal(setTargetHeight(inicial, 0.5).targetHeight, HEIGHT_RANGE.min, 'se acota por abajo');
  assert.equal(setTargetHeight(inicial, 99).targetHeight, HEIGHT_RANGE.max, 'se acota por arriba');
  assert.equal(setTargetHeight(inicial, 3.14159).targetHeight, 3.1, 'se redondea al paso de 0,1');
  assert.equal(setTargetHeight(inicial, Number.NaN).targetHeight, HEIGHT_RANGE.initial);
});

test('cambiar la altura no toca las otras respuestas', () => {
  const estado = setTask(setEnvironment(createInitialFlowState(), EnvironmentType.TEJADO), TaskType.TRABAJO_SOBRE_PLATAFORMA);
  const movido = setTargetHeight(estado, 5);

  assert.equal(movido.environment, EnvironmentType.TEJADO);
  assert.equal(movido.task, TaskType.TRABAJO_SOBRE_PLATAFORMA);
});

/* ================================================================== *
 * Paso 2 — tarea
 * ================================================================== */

test('las opciones de tarea salen de lo que el catálogo declara soportar', () => {
  const opciones = taskOptions();
  const soportadas = new Set(catalogo.flatMap((producto) => producto.capabilities.supportedTasks ?? []));

  assert.deepEqual(
    opciones.map((opcion) => opcion.value),
    [TaskType.ACCESO, TaskType.TRABAJO_SOBRE_PLATAFORMA]
  );
  for (const opcion of opciones) {
    assert.ok(soportadas.has(opcion.value), opcion.value + ' no lo soporta ningún producto');
    assert.ok(opcion.titulo.length > 0 && opcion.descripcion.length > 0);
  }
});

test('una tarea que ningún producto soporta no se ofrece', () => {
  const soloAcceso = createProduct({
    id: 1,
    nombre: 'Sólo acceso',
    configurations: [
      createConfiguration({
        id: 'c',
        name: 'Tijera',
        type: ConfigurationType.TIJERA,
        supportedTasks: [TaskType.ACCESO]
      })
    ]
  });

  assert.deepEqual(
    taskOptions([soloAcceso]).map((opcion) => opcion.value),
    [TaskType.ACCESO]
  );
});

test('seleccionar tarea la actualiza sin tocar altura ni entorno', () => {
  const estado = setTargetHeight(createInitialFlowState(), 4.4);
  const cambiado = setTask(estado, TaskType.TRABAJO_SOBRE_PLATAFORMA);

  assert.equal(cambiado.task, TaskType.TRABAJO_SOBRE_PLATAFORMA);
  assert.equal(cambiado.targetHeight, 4.4);
  assert.equal(cambiado.environment, estado.environment);
});

/* ================================================================== *
 * Paso 3 — entorno
 * ================================================================== */

test('se ofrecen los tres entornos del dominio', () => {
  assert.deepEqual(
    environmentOptions().map((opcion) => opcion.value),
    [EnvironmentType.INTERIOR, EnvironmentType.FACHADA, EnvironmentType.TEJADO]
  );
});

test('el catálogo no declara compatibilidad por entorno, y el flujo lo sabe', () => {
  assert.equal(environmentCompatibilityIsDeclared(), false);
  for (const producto of catalogo) {
    assert.equal(producto.capabilities.supportedEnvironments, UNKNOWN, producto.nombre);
  }

  // Y en cuanto un fabricante lo declare, el flujo lo detecta.
  const conEntorno = createProduct({
    id: 1,
    nombre: 'Con entorno',
    configurations: [
      createConfiguration({
        id: 'c',
        name: 'Tijera',
        type: ConfigurationType.TIJERA,
        supportedEnvironments: [EnvironmentType.INTERIOR]
      })
    ]
  });
  assert.equal(environmentCompatibilityIsDeclared([conEntorno]), true);
});

test('seleccionar entorno lo actualiza y cambia lo que se pide a la escalera', () => {
  const base = submit(setTargetHeight(createInitialFlowState(), 4));

  const interior = runRecommendation(setEnvironment(base, EnvironmentType.INTERIOR))!;
  const fachada = runRecommendation(setEnvironment(base, EnvironmentType.FACHADA))!;

  assert.equal(interior.requirement.topExtensionM, 0);
  assert.equal(fachada.requirement.topExtensionM, 1);
  assert.ok(fachada.requirement.requiredLadderLength > interior.requirement.requiredLadderLength);
});

/* ================================================================== *
 * CTA y ejecución del engine
 * ================================================================== */

test('el motor no se ejecuta hasta pulsar "Ver mi recomendación"', () => {
  const estado = createInitialFlowState();
  assert.equal(runRecommendation(estado), null);

  const enviado = submit(estado);
  assert.equal(enviado.submitted, true);
  assert.notEqual(runRecommendation(enviado), null);
});

test('el CTA devuelve una recomendación completa y pintable', () => {
  const estado = submit(setTargetHeight(createInitialFlowState(), 2.5));
  const resultado = runRecommendation(estado)!;

  assert.equal(resultado.status, 'ok');
  const mejor = resultado.best!;
  assert.equal(mejor.product.id, 2); // TecTake
  assert.ok(mejor.product.imagenes.length > 0);
  assert.ok(mejor.reasons.length > 0);
  assert.ok(MATCH_LABELS[mejor.match].length > 0);
  assert.ok(mejor.configuration?.name);
  assert.ok(resultado.requirement.requiredLadderLength > 0);
});

test('cambiar cualquier respuesta después del CTA actualiza el resultado sin volver a pulsarlo', () => {
  let estado = submit(setTargetHeight(createInitialFlowState(), 2.5));
  const inicial = runRecommendation(estado)!;
  assert.equal(inicial.best?.product.id, 2);

  // Cambio de altura.
  estado = setTargetHeight(estado, 5);
  assert.equal(estado.submitted, true, 'el resultado sigue visible');
  const trasAltura = runRecommendation(estado)!;
  assert.equal(trasAltura.best?.product.id, 1); // TEENO: en interior bastan 5,18 m

  // Cambio de entorno: el sobresaliente sube el listón a 6,18 m y cambia el ganador.
  estado = setEnvironment(estado, EnvironmentType.TEJADO);
  const trasEntorno = runRecommendation(estado)!;
  assert.equal(trasEntorno.requirement.topExtensionM, 1);
  assert.ok(trasEntorno.requirement.requiredLadderLength > trasAltura.requirement.requiredLadderLength);
  assert.equal(trasEntorno.best?.product.id, 3); // DRABEST, por altura de trabajo declarada

  // Cambio de tarea.
  estado = setTask(estado, TaskType.TRABAJO_SOBRE_PLATAFORMA);
  const trasTarea = runRecommendation(estado)!;
  assert.ok(trasTarea.rejected.some((r) => r.product.id === 3 && r.code === 'tarea-no-soportada'));
});

test('volver a una respuesta anterior devuelve exactamente el mismo resultado', () => {
  const base = submit(setTargetHeight(createInitialFlowState(), 3.5));
  const antes = runRecommendation(base)!;

  const ida = setTask(setEnvironment(base, EnvironmentType.TEJADO), TaskType.TRABAJO_SOBRE_PLATAFORMA);
  const vuelta = setTask(setEnvironment(ida, base.environment), base.task);

  assert.deepEqual(vuelta, base);
  assert.equal(JSON.stringify(runRecommendation(vuelta)), JSON.stringify(antes));
});

test('una altura fuera de catálogo se muestra como falta de cobertura, no como error', () => {
  const estado = submit(setTargetHeight(createInitialFlowState(), HEIGHT_RANGE.max));
  const resultado = runRecommendation(estado)!;

  assert.equal(resultado.status, 'no_exact_match');
  assert.equal(resultado.best, null);
  assert.ok(resultado.closest, 'debe ofrecerse la alternativa más cercana');
  assert.ok(resultado.closest!.product.nombre.length > 0);
  assert.ok((resultado.closest!.deficitM as number) > 0);
});

test('las transiciones de estado son inmutables', () => {
  const estado = createInitialFlowState();
  const copia = { ...estado };

  setTargetHeight(estado, 5);
  setTask(estado, TaskType.TRABAJO_SOBRE_PLATAFORMA);
  setEnvironment(estado, EnvironmentType.TEJADO);
  submit(estado);

  assert.deepEqual(estado, copia, 'ningún reductor muta el estado recibido');
});

/* ================================================================== *
 * Presentación
 * ================================================================== */

test('formatAltura usa coma decimal y construirUrlAfiliado mantiene el tag', () => {
  assert.equal(formatAltura(3.5), '3,5');
  assert.equal(formatAltura(2), '2,0');
  assert.equal(construirUrlAfiliado('B0GFVL9N91'), 'https://www.amazon.es/dp/B0GFVL9N91?tag=jars4u2-21');
});

test('las etiquetas de encaje no usan lenguaje de seguridad', () => {
  const prohibidas = /segur|certificad|garantiz|homologad/i;
  for (const etiqueta of Object.values(MATCH_LABELS)) {
    assert.ok(!prohibidas.test(etiqueta), etiqueta);
  }
});

/* ================================================================== *
 * Contrato con el componente
 * ================================================================== */

test('la UI ya no depende de la capa "limite"', () => {
  const fuente = readFileSync(new URL('../src/components/Calculadora.jsx', import.meta.url), 'utf8');

  assert.ok(!/productos\.js|productosEscaleras|\blimite\b/.test(fuente), 'quedan restos de la lógica antigua');
  assert.ok(fuente.includes('calculadoraFlow.ts'), 'la UI debe consumir el flujo');
  // El cálculo vive en el flujo/engine, no en el componente.
  assert.ok(!/1\.035|recommendLadder\(/.test(fuente));
});

test('el flujo no depende de React ni del DOM', () => {
  const fuente = readFileSync(new URL('../src/components/calculadoraFlow.ts', import.meta.url), 'utf8');

  assert.ok(!/from '(react|react-dom)'/.test(fuente));
  assert.ok(!/document\.|window\.|useState|useMemo/.test(fuente));
});

/* ================================================================== *
 * Feedback de búsqueda
 * ================================================================== */

test('el feedback de búsqueda es breve y no simula un cálculo largo', () => {
  assert.ok(SEARCH_FEEDBACK_MS > 0);
  assert.ok(SEARCH_FEEDBACK_MS <= 1200, 'una espera artificial larga sería engañosa');
});

test('los pasos de la espera describen lo que el motor hace de verdad', () => {
  assert.equal(SEARCH_STEPS.length, 3);
  for (const paso of SEARCH_STEPS) {
    assert.ok(paso.length > 0);
    assert.ok(!/segur|certificad|garantiz|homologad/i.test(paso), paso);
  }
  // Y el recuento que se anuncia sale del catálogo real.
  assert.equal(CATALOG_SIZE, catalogo.length);
});

test('el componente sólo anima; el resultado no depende del temporizador', () => {
  const fuente = readFileSync(new URL('../src/components/Calculadora.jsx', import.meta.url), 'utf8');

  // La búsqueda se salta entera con prefers-reduced-motion.
  assert.ok(fuente.includes('prefers-reduced-motion'));
  assert.ok(fuente.includes('clearTimeout'), 'el temporizador debe cancelarse');
  // El resultado se calcula del flujo, no se guarda en un estado aparte.
  assert.ok(fuente.includes('runRecommendation(flujo)'));
});
