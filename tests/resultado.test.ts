import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { catalogo } from '../src/data/catalogo.ts';
import { createConfiguration, createProduct } from '../src/domain/product.ts';
import { ConfigurationType, EnvironmentType, TaskType, UNKNOWN } from '../src/domain/types.ts';
import { recommendLadder } from '../src/domain/recommendation.ts';
import {
  MATCH_LABELS,
  MATCH_STRENGTH,
  MAX_ALTERNATIVES,
  createInitialFlowState,
  describeAlternatives,
  runRecommendation,
  setEnvironment,
  setTargetHeight,
  setTask,
  submit,
  summaryRows
} from '../src/components/calculadoraFlow.ts';

const TEENO = 1;
const TECTAKE = 2;
const DRABEST = 3;

const resultadoPara = (altura: number, task = TaskType.ACCESO, environment = EnvironmentType.INTERIOR) =>
  runRecommendation(
    submit(setEnvironment(setTask(setTargetHeight(createInitialFlowState(), altura), task), environment))
  )!;

/* ================================================================== *
 * Producto recomendado
 * ================================================================== */

test('la tarjeta principal tiene todo lo que la sección "Tu mejor opción" necesita', () => {
  const resultado = resultadoPara(2.5);
  const mejor = resultado.best!;

  assert.equal(mejor.product.id, TECTAKE);
  assert.ok(mejor.product.badge.length > 0, 'badge');
  assert.ok(mejor.product.nombre.length > 0, 'nombre');
  assert.ok(mejor.product.precio.length > 0, 'precio');
  assert.ok(mejor.product.imagenes.length > 0, 'imagen');
  assert.ok(MATCH_LABELS[mejor.match].length > 0, 'nivel de coincidencia');
  assert.ok(mejor.reasons.length > 0, 'razones');
  assert.ok(mejor.configuration, 'configuración recomendada');
});

test('el badge es un dato del catálogo, no algo que genere el motor', () => {
  for (const producto of catalogo) {
    const resultado = recommendLadder(
      { targetHeight: 2, task: TaskType.ACCESO, environment: EnvironmentType.INTERIOR },
      [producto]
    );
    const mostrado = resultado.best?.product.badge ?? resultado.closest?.product.badge;
    assert.equal(mostrado, producto.badge, 'el badge se muestra tal cual viene del catálogo');
  }
  // Y ninguna etiqueta calculada usa el eslogan de calidad-precio.
  const conAlternativas = resultadoPara(2.5);
  for (const diferencia of describeAlternatives(conAlternativas.alternatives, conAlternativas.best!)) {
    assert.ok(!/calidad.?precio/i.test(diferencia.label), diferencia.label);
    assert.ok(!/calidad.?precio/i.test(diferencia.detail), diferencia.detail);
  }
});

test('las filas de contexto muestran la altura solicitada y el dato con el que se compara', () => {
  const resultado = resultadoPara(3.5);
  const filas = summaryRows(resultado.best!, resultado.requirement);
  const porEtiqueta = Object.fromEntries(filas.map((fila) => [fila.etiqueta, fila.valor]));

  assert.equal(porEtiqueta['Tu necesidad'], '3,5 m de altura de trabajo');
  assert.equal(porEtiqueta['Escalera necesaria'], '3,62 m');
  // TEENO no publica altura de trabajo: se muestra la longitud, no una inventada.
  assert.equal(resultado.best!.product.id, TEENO);
  assert.equal(porEtiqueta['Longitud declarada'], '5,80 m');
  assert.equal(porEtiqueta['Altura de trabajo declarada'], undefined);
});

test('cuando el fabricante sí publica altura de trabajo, es la que se muestra', () => {
  const resultado = resultadoPara(5, TaskType.ACCESO, EnvironmentType.FACHADA);
  const porEtiqueta = Object.fromEntries(
    summaryRows(resultado.best!, resultado.requirement).map((fila) => [fila.etiqueta, fila.valor])
  );

  assert.equal(resultado.best!.product.id, DRABEST);
  assert.equal(porEtiqueta['Altura de trabajo declarada'], '5,83 m');
  assert.equal(porEtiqueta['Longitud declarada'], undefined);
  // Y no se enseña la longitud geométrica, que no es contra lo que se comparó:
  // ponerla al lado de los 5,83 m haría parecer que el producto se queda corto.
  assert.equal(porEtiqueta['Escalera necesaria'], undefined);
});

test('el nivel de coincidencia se puede pintar sin depender del color', () => {
  assert.deepEqual(MATCH_STRENGTH, { exact: 3, good: 2, marginal: 1, none: 0 });
  assert.equal(MATCH_STRENGTH[resultadoPara(2.5).best!.match], 3);
  assert.equal(MATCH_STRENGTH[resultadoPara(3.5).best!.match], 2);
});

/* ================================================================== *
 * Alternativas
 * ================================================================== */

test('se muestran como mucho dos alternativas', () => {
  assert.equal(MAX_ALTERNATIVES, 2);
  const resultado = resultadoPara(2.5);
  assert.equal(resultado.alternatives.length, 2, 'a 2,5 m las tres opciones sirven');
  assert.ok(resultado.alternatives.slice(0, MAX_ALTERNATIVES).length <= 2);
});

test('cada alternativa explica su diferencia principal con datos reales', () => {
  const resultado = resultadoPara(2.5);
  const alternativas = resultado.alternatives.slice(0, MAX_ALTERNATIVES);
  const diferencias = describeAlternatives(alternativas, resultado.best!);

  assert.equal(diferencias.length, 2);
  assert.deepEqual(
    alternativas.map((alternativa, indice) => [alternativa.product.id, diferencias[indice].code]),
    [
      [TEENO, 'mas-alcance'], // 5,80 m frente a los 2,75 m de TecTake
      [DRABEST, 'mas-ligera'] // 14,5 kg frente a 16,4 kg
    ]
  );
  // Los números citados son los del catálogo.
  assert.ok(diferencias[0].detail.includes('5,80 m') && diferencias[0].detail.includes('2,75 m'));
  assert.ok(diferencias[1].detail.includes('14,5 kg') && diferencias[1].detail.includes('16,4 kg'));
});

test('dos alternativas no repiten la misma etiqueta si hay otra diferencia real', () => {
  const resultado = resultadoPara(2.5);
  const diferencias = describeAlternatives(resultado.alternatives.slice(0, MAX_ALTERNATIVES), resultado.best!);
  const codigos = diferencias.map((diferencia) => diferencia.code);

  assert.equal(new Set(codigos).size, codigos.length);
  // TEENO también es "más alcance" que DRABEST, pero esa etiqueta ya está usada.
  assert.notEqual(diferencias[1].code, 'mas-alcance');
});

test('una diferencia sólo se ofrece si ambos productos declaran el dato', () => {
  const resultado = resultadoPara(3.5);
  const drabest = resultado.alternatives[0];

  assert.equal(drabest.product.id, DRABEST);
  assert.equal(drabest.product.specifications.maxLoadKg, UNKNOWN, 'DRABEST no declara carga');
  const diferencia = describeAlternatives([drabest], resultado.best!)[0];
  assert.notEqual(diferencia.code, 'mas-carga', 'sin carga declarada no puede compararse la carga');
});

test('sin ninguna diferencia comparable se cae en una etiqueta neutra', () => {
  const base = {
    asin: 'X',
    precio: '100,00€',
    badge: 'Badge',
    tag: 'Tag',
    configurations: [
      createConfiguration({
        id: 'c',
        name: 'Tijera',
        type: ConfigurationType.TIJERA,
        supportedTasks: [TaskType.ACCESO]
      })
    ],
    declaredCapabilities: { maxLadderLength: 4 }
  };
  const gemelaA = createProduct({ ...base, id: 10, nombre: 'Gemela A' });
  const gemelaB = createProduct({ ...base, id: 11, nombre: 'Gemela B' });

  const resultado = recommendLadder(
    { targetHeight: 3, task: TaskType.ACCESO, environment: EnvironmentType.INTERIOR },
    [gemelaA, gemelaB]
  );
  const diferencia = describeAlternatives(resultado.alternatives, resultado.best!)[0];

  assert.equal(diferencia.code, 'otra-opcion');
  assert.ok(diferencia.label.length > 0 && diferencia.detail.length > 0);
});

test('"más orientada a uso profesional" sale de declaredUses, no de un eslogan', () => {
  // El dato existe de verdad en el catálogo, sacado de la ficha de Amazon.
  const drabest = catalogo.find((producto) => producto.id === DRABEST)!;
  assert.ok(drabest.specifications.declaredUses.includes('uso profesional'));

  // Dos productos idénticos en todo lo comparable: la única diferencia posible
  // es el uso declarado, así que es la etiqueta que debe salir.
  const comun = {
    asin: 'X',
    precio: '100,00€',
    badge: 'Badge',
    tag: 'Tag',
    configurations: [
      createConfiguration({
        id: 'c',
        name: 'Tijera',
        type: ConfigurationType.TIJERA,
        supportedTasks: [TaskType.ACCESO]
      })
    ],
    declaredCapabilities: { maxLadderLength: 4 }
  };
  const generalista = createProduct({ ...comun, id: 10, nombre: 'Generalista' });
  const profesional = createProduct({
    ...comun,
    id: 11,
    nombre: 'Profesional',
    specifications: { declaredUses: ['uso profesional'] }
  });

  const resultado = recommendLadder(
    { targetHeight: 3, task: TaskType.ACCESO, environment: EnvironmentType.INTERIOR },
    [generalista, profesional]
  );
  const diferencia = describeAlternatives(resultado.alternatives, resultado.best!)[0];

  assert.equal(resultado.best!.product.id, generalista.id, 'empatan y desempata el id');
  assert.equal(diferencia.code, 'uso-profesional');
  assert.equal(diferencia.detail, 'El fabricante la describe para uso profesional.');
});

/* ================================================================== *
 * Estados sin recomendación
 * ================================================================== */

test('no exact match: sin best, con la alternativa más cercana', () => {
  const resultado = resultadoPara(6.5);

  assert.equal(resultado.status, 'no_exact_match');
  assert.equal(resultado.best, null);
  assert.deepEqual(resultado.alternatives, []);
  assert.ok(resultado.closest);
  assert.ok(resultado.closest!.product.nombre.length > 0);
  assert.ok(resultado.closest!.product.asin.length > 0, 'la alternativa más cercana sigue siendo accionable');
  assert.ok(resultado.closest!.text.length > 0, 'explica por qué no llega');
});

test('un match parcial se muestra pero no se vende como coincidencia buena', () => {
  const sinDatos = createProduct({
    id: 99,
    nombre: 'Escalera sin ficha',
    asin: 'X',
    precio: '100,00€',
    badge: 'Badge',
    configurations: [
      createConfiguration({
        id: 'x',
        name: 'Tijera',
        type: ConfigurationType.TIJERA,
        supportedTasks: [TaskType.ACCESO]
      })
    ]
  });

  const resultado = recommendLadder(
    { targetHeight: 3, task: TaskType.ACCESO, environment: EnvironmentType.INTERIOR },
    [sinDatos]
  );

  assert.equal(resultado.status, 'no_exact_match');
  assert.equal(resultado.best!.match, 'marginal');
  assert.equal(MATCH_LABELS.marginal, 'Coincidencia parcial');
  assert.equal(MATCH_STRENGTH.marginal, 1);
});

/* ================================================================== *
 * Warnings y datos ausentes
 * ================================================================== */

test('los warnings del engine llegan íntegros a la tarjeta', () => {
  const resultado = resultadoPara(2, TaskType.TRABAJO_SOBRE_PLATAFORMA);
  const mejor = resultado.best!;

  const codigos = mejor.warnings.map((aviso) => aviso.code);
  assert.ok(codigos.includes('altura-plataforma-no-declarada'));
  assert.ok(codigos.includes('entorno-no-declarado'));
  for (const aviso of mejor.warnings) {
    assert.ok(aviso.text.length > 0);
  }
});

test('sin configuración compatible no se pinta fila de configuración', () => {
  const recomendacionSinConfiguracion = {
    ...resultadoPara(3.5).best!,
    configuration: null
  };
  const filas = summaryRows(recomendacionSinConfiguracion, resultadoPara(3.5).requirement);

  assert.ok(!filas.some((fila) => fila.etiqueta === 'Configuración'));
  assert.ok(filas.some((fila) => fila.etiqueta === 'Tu necesidad'), 'el resto de filas sigue');
});

test('sin altura declarada no se pinta ninguna fila de altura del producto', () => {
  const sinDatos = createProduct({
    id: 99,
    nombre: 'Escalera sin ficha',
    asin: 'X',
    precio: '100,00€',
    configurations: [
      createConfiguration({
        id: 'x',
        name: 'Tijera',
        type: ConfigurationType.TIJERA,
        supportedTasks: [TaskType.ACCESO]
      })
    ]
  });
  const resultado = recommendLadder(
    { targetHeight: 3, task: TaskType.ACCESO, environment: EnvironmentType.INTERIOR },
    [sinDatos]
  );
  const filas = summaryRows(resultado.best!, resultado.requirement);

  assert.ok(!filas.some((fila) => fila.etiqueta.includes('declarada')));
  assert.equal(filas.length, 3, 'necesidad + escalera necesaria + configuración');
});

test('los datos opcionales ausentes no generan filas ni razones vacías', () => {
  const resultado = resultadoPara(5.8);
  const drabest = resultado.best!;

  assert.equal(drabest.product.id, DRABEST);
  assert.equal(drabest.product.specifications.maxLoadKg, UNKNOWN);
  assert.equal(drabest.product.specifications.dimensions, UNKNOWN);
  assert.equal(drabest.product.specifications.platform, UNKNOWN);

  // Nada de "no disponible" decorativo: la fila simplemente no existe.
  for (const fila of summaryRows(drabest, resultado.requirement)) {
    assert.ok(fila.valor.length > 0);
    assert.ok(!/no disponible|n\/d|-{2,}/i.test(fila.valor), fila.valor);
  }
  for (const razon of drabest.reasons) {
    assert.ok(!/undefined|null|NaN/.test(razon.text), razon.text);
  }
});

/* ================================================================== *
 * Contrato con la UI
 * ================================================================== */

test('la tarjeta se pinta sólo con la salida del engine', () => {
  const fuente = readFileSync(new URL('../src/components/Calculadora.jsx', import.meta.url), 'utf8');

  assert.ok(fuente.includes('Tu mejor opción'));
  assert.ok(fuente.includes('Por qué la recomendamos'));
  assert.ok(fuente.includes('Ver producto'));
  // Nada de datos inventados ni de eslóganes calculados en la vista.
  assert.ok(!/calidad.?precio/i.test(fuente));
  assert.ok(!/maxPlatformHeight|certificad|homologad/i.test(fuente));
  // Las alternativas y las filas vienen del flujo, no se arman en el JSX.
  assert.ok(fuente.includes('describeAlternatives'));
  assert.ok(fuente.includes('summaryRows'));
});
