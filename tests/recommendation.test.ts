import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { catalogo } from '../src/data/catalogo.ts';
import { createConfiguration, createProduct } from '../src/domain/product.ts';
import { ConfigurationType, EnvironmentType, TaskType, UNKNOWN } from '../src/domain/types.ts';
import {
  MATCH_THRESHOLDS,
  SCORE_WEIGHTS,
  computeRequirement,
  parsePrecioEur,
  recommendLadder,
  selectConfiguration,
  type Recommendation,
  type RecommendationResult,
  type Scenario
} from '../src/domain/recommendation.ts';

const TEENO = 1;
const TECTAKE = 2;
const DRABEST = 3;

const escenario = (
  targetHeight: number,
  task: TaskType = TaskType.ACCESO,
  environment: EnvironmentType = EnvironmentType.INTERIOR,
  extra: Partial<Scenario> = {}
): Scenario => ({ targetHeight, task, environment, ...extra });

const recomendar = (scenario: Scenario, products = catalogo): RecommendationResult =>
  recommendLadder(scenario, products);

const idsDe = (recomendaciones: readonly Recommendation[]) => recomendaciones.map((r) => r.product.id);
const codigosDe = (items: readonly { code: string }[]) => items.map((item) => item.code);

/* ================================================================== *
 * Casos mínimos exigidos
 * ================================================================== */

test('2,5 m en interior: gana TecTake, que es la que menos sobra', () => {
  const resultado = recomendar(escenario(2.5));

  assert.equal(resultado.status, 'ok');
  assert.equal(resultado.best?.product.id, TECTAKE);
  assert.equal(resultado.best?.match, 'exact');
  assert.equal(resultado.requirement.requiredLadderLength, 2.588); // 2,5 × 1.035
  // Las tres cubren la altura; ninguna se descarta.
  assert.deepEqual(resultado.rejected, []);
  assert.deepEqual(idsDe(resultado.alternatives), [TEENO, DRABEST]);
});

test('3,5 m en interior: TecTake se queda corta y gana TEENO', () => {
  const resultado = recomendar(escenario(3.5));

  assert.equal(resultado.status, 'ok');
  assert.equal(resultado.best?.product.id, TEENO);
  assert.equal(resultado.best?.match, 'good');
  assert.deepEqual(codigosDe(resultado.rejected), ['altura-insuficiente']);
  assert.equal(resultado.rejected[0].product.id, TECTAKE);
  assert.equal(resultado.rejected[0].deficitM, 0.87);
});

test('4 m en fachada: se suma el sobresaliente y gana TEENO en configuración apoyada', () => {
  const resultado = recomendar(escenario(4, TaskType.ACCESO, EnvironmentType.FACHADA));

  assert.equal(resultado.requirement.topExtensionM, 1);
  assert.equal(resultado.requirement.requiredLadderLength, 5.14); // 4 × 1.035 + 1
  assert.equal(resultado.best?.product.id, TEENO);
  assert.equal(resultado.best?.match, 'exact');
  // En fachada se prefiere una forma que se apoya, no una autoportante.
  assert.equal(resultado.best?.configuration?.type, ConfigurationType.ESCALERA_APOYADA);
});

test('5 m en fachada: sólo DRABEST llega, por altura de trabajo declarada', () => {
  const resultado = recomendar(escenario(5, TaskType.ACCESO, EnvironmentType.FACHADA));

  assert.equal(resultado.status, 'ok');
  assert.equal(resultado.best?.product.id, DRABEST);
  assert.equal(resultado.best?.height.kind, 'declared-work-height');
  assert.equal(resultado.best?.height.available, 5.83);
  assert.deepEqual(resultado.alternatives, []);
  assert.deepEqual(idsDe(resultado.rejected.map((r) => ({ product: r.product })) as never), [TEENO, TECTAKE]);
  // La altura de trabajo declarada no dice cuánto sobresale por encima del apoyo.
  assert.ok(codigosDe(resultado.best!.warnings).includes('sobresaliente-no-contemplado'));
});

test('5,8 m: sólo DRABEST llega, y encaja casi exacto', () => {
  const resultado = recomendar(escenario(5.8));

  assert.equal(resultado.status, 'ok');
  assert.equal(resultado.best?.product.id, DRABEST);
  assert.equal(resultado.best?.match, 'exact');
  assert.ok(resultado.best!.height.fit > 0.99, 'debería ser un ajuste casi perfecto');
  assert.equal(resultado.rejected.length, 2);
});

test('por encima del máximo conocido: no_exact_match y la alternativa más cercana', () => {
  const resultado = recomendar(escenario(7, TaskType.ACCESO, EnvironmentType.TEJADO));

  assert.equal(resultado.status, 'no_exact_match');
  assert.equal(resultado.best, null);
  assert.deepEqual(resultado.alternatives, []);
  assert.equal(resultado.rejected.length, 3);
  // La más cercana es la que menos metros deja sin cubrir, no la más larga.
  assert.equal(resultado.closest?.product.id, DRABEST);
  assert.equal(resultado.closest?.deficitM, 1.17);
  for (const descartado of resultado.rejected) {
    assert.equal(descartado.code, 'altura-insuficiente');
  }
});

test('tarea incompatible: DRABEST se descarta al pedir trabajo sobre plataforma', () => {
  const resultado = recomendar(escenario(2, TaskType.TRABAJO_SOBRE_PLATAFORMA));

  const descartada = resultado.rejected.find((r) => r.product.id === DRABEST);
  assert.equal(descartada?.code, 'tarea-no-soportada');
  // No declara ninguna configuración con plataforma.
  assert.deepEqual(catalogo[2].capabilities.supportedTasks, [TaskType.ACCESO]);
  // Las que sí la soportan siguen en juego.
  assert.deepEqual(idsDe([resultado.best!, ...resultado.alternatives]), [TECTAKE, TEENO]);
  assert.equal(resultado.best?.configuration?.type, ConfigurationType.ANDAMIO);
});

test('información insuficiente: sin altura declarada el match es marginal, no un descarte', () => {
  const sinDatos = createProduct({
    id: 99,
    nombre: 'Escalera sin ficha',
    asin: 'X',
    precio: '100,00€',
    configurations: [
      createConfiguration({ id: 'x-tijera', name: 'Tijera', type: ConfigurationType.TIJERA, supportedTasks: [TaskType.ACCESO] })
    ]
  });

  const resultado = recomendar(escenario(3), [sinDatos]);

  assert.equal(resultado.status, 'no_exact_match', 'un marginal no es un match claro');
  assert.equal(resultado.best?.product.id, 99);
  assert.equal(resultado.best?.match, 'marginal');
  assert.equal(resultado.best?.height.kind, 'unknown');
  assert.equal(resultado.best?.height.available, UNKNOWN);
  // Desconocer no es incumplir: no se descarta, se avisa.
  assert.deepEqual(resultado.rejected, []);
  assert.ok(codigosDe(resultado.best!.warnings).includes('altura-no-declarada'));
  assert.ok(resultado.best!.confidence < 0.5);
});

test('trabajo sobre plataforma: se avisa de que no hay altura de plataforma declarada', () => {
  const resultado = recomendar(escenario(2, TaskType.TRABAJO_SOBRE_PLATAFORMA));

  for (const candidata of [resultado.best!, ...resultado.alternatives]) {
    assert.ok(
      codigosDe(candidata.warnings).includes('altura-plataforma-no-declarada'),
      candidata.product.nombre + ' debería avisar del hueco de datos'
    );
    assert.equal(candidata.product.capabilities.maxPlatformHeight, UNKNOWN);
  }
  // Ese hueco baja la confianza respecto al mismo producto en tarea de acceso.
  const acceso = recomendar(escenario(2, TaskType.ACCESO));
  const enAcceso = [acceso.best!, ...acceso.alternatives].find((r) => r.product.id === TECTAKE)!;
  assert.ok(resultado.best!.confidence < enAcceso.confidence);
});

/* ================================================================== *
 * Reglas del motor
 * ================================================================== */

test('la altura pesa más que el precio', () => {
  assert.ok(SCORE_WEIGHTS.height > SCORE_WEIGHTS.price);
  const suma = Object.values(SCORE_WEIGHTS).reduce((total, peso) => total + peso, 0);
  assert.ok(Math.abs(suma - 1) < 1e-9, 'los pesos deben sumar 1');

  // Caso real: a 3,5 m gana TEENO (171.99€) pese a que DRABEST no es más cara
  // por altura sino por ficha; y la más barata que cubre no siempre gana.
  const resultado = recomendar(escenario(3.5));
  const ganadora = resultado.best!;
  const alturaPesada = ganadora.breakdown.factors.find((f) => f.key === 'height')!;
  const precioPesado = ganadora.breakdown.factors.find((f) => f.key === 'price')!;
  assert.ok(alturaPesada.weighted > precioPesado.weighted);
});

test('no se recomienda la más larga si otra cubre y encaja mejor', () => {
  const resultado = recomendar(escenario(2.5));

  const ganadora = resultado.best!;
  const masLarga = [ganadora, ...resultado.alternatives].reduce((a, b) =>
    (a.height.available ?? 0) >= (b.height.available ?? 0) ? a : b
  );
  assert.equal(ganadora.product.id, TECTAKE); // 2,75 m para una necesidad de 2,59 m
  assert.notEqual(ganadora.product.id, masLarga.product.id);
  assert.equal(masLarga.product.id, DRABEST); // 5,83 m de alcance, más del doble
  assert.ok(ganadora.height.fit > masLarga.height.fit);
  // Y las dos que sobran quedan por debajo pese a ser mucho más largas.
  for (const alternativa of resultado.alternatives) {
    assert.ok(alternativa.score < ganadora.score, alternativa.product.nombre);
    assert.ok((alternativa.height.available as number) > (ganadora.height.available as number));
  }
});

test('los cuatro niveles de match son alcanzables y coherentes con el fit', () => {
  const niveles = new Set<string>();
  for (const altura of [2.5, 3.5, 5.8]) {
    const resultado = recomendar(escenario(altura));
    for (const candidata of [resultado.best, ...resultado.alternatives]) {
      if (!candidata) continue;
      niveles.add(candidata.match);
      if (candidata.match === 'exact') assert.ok(candidata.height.fit >= MATCH_THRESHOLDS.exact);
      if (candidata.match === 'good') {
        assert.ok(candidata.height.fit >= MATCH_THRESHOLDS.good);
        assert.ok(candidata.height.fit < MATCH_THRESHOLDS.exact);
      }
    }
  }
  assert.deepEqual([...niveles].sort(), ['exact', 'good', 'marginal']);
  // 'none' es el nivel de los descartados por altura.
  const fuera = recomendar(escenario(7));
  assert.equal(fuera.best, null);
  assert.ok(fuera.rejected.length > 0);
});

test('el resultado es determinista', () => {
  const casos: Scenario[] = [
    escenario(2.5),
    escenario(4, TaskType.ACCESO, EnvironmentType.FACHADA),
    escenario(2, TaskType.TRABAJO_SOBRE_PLATAFORMA, EnvironmentType.TEJADO)
  ];
  for (const caso of casos) {
    const a = JSON.stringify(recomendar(caso));
    const b = JSON.stringify(recomendar(caso));
    assert.equal(a, b);
  }
});

test('es una función pura: no muta el catálogo que recibe', () => {
  const antes = JSON.stringify(catalogo);
  const copia = [...catalogo];
  recomendar(escenario(3.5), copia);
  assert.equal(JSON.stringify(catalogo), antes);
  assert.deepEqual(idsDe(copia.map((p) => ({ product: p })) as never), [TEENO, TECTAKE, DRABEST]);
});

test('userHeight se acepta, se anota y no cambia el resultado', () => {
  const sin = recomendar(escenario(3.5));
  const con = recomendar(escenario(3.5, TaskType.ACCESO, EnvironmentType.INTERIOR, { userHeight: 1.9 }));

  assert.equal(con.scenarioNotes.length, 1);
  assert.match(con.scenarioNotes[0], /no se ha usado/);
  assert.equal(sin.scenarioNotes.length, 0);
  // Mismo veredicto con y sin estatura.
  assert.equal(con.best?.product.id, sin.best?.product.id);
  assert.equal(con.best?.score, sin.best?.score);
  assert.equal(con.requirement.requiredLadderLength, sin.requirement.requiredLadderLength);
});

/* ================================================================== *
 * Explicabilidad
 * ================================================================== */

test('cada recomendación explica por qué, con datos reales del producto', () => {
  const resultado = recomendar(escenario(2.5));
  const ganadora = resultado.best!;

  assert.ok(ganadora.reasons.length > 0);
  assert.ok(codigosDe(ganadora.reasons).includes('cubre-altura'));
  // La razón de configuración nombra una configuración que el producto declara.
  const razonConfig = ganadora.reasons.find((r) => r.code === 'configuracion-compatible')!;
  const nombres = ganadora.product.configurations.map((c) => c.name);
  assert.ok(nombres.some((nombre) => razonConfig.text.includes(nombre)));
  // La razón de precio nombra el precio real.
  const razonPrecio = ganadora.reasons.find((r) => r.code === 'precio-mas-bajo')!;
  assert.ok(razonPrecio.text.includes(ganadora.product.precio));
});

test('no se generan razones sin dato que las respalde', () => {
  const resultado = recomendar(escenario(5.8));
  const drabest = resultado.best!;

  // DRABEST no declara carga máxima, así que no puede haber razón de carga.
  assert.equal(drabest.product.specifications.maxLoadKg, UNKNOWN);
  assert.ok(!codigosDe(drabest.reasons).includes('carga-declarada'));
  // Y al ser candidata única, tampoco hay comparativas de precio o peso.
  assert.ok(!codigosDe(drabest.reasons).includes('precio-mas-bajo'));
  assert.ok(!codigosDe(drabest.reasons).includes('mas-ligera'));

  // TEENO sí declara 150 kg, así que sí aparece.
  const conCarga = recomendar(escenario(3.5)).best!;
  assert.equal(conCarga.product.id, TEENO);
  assert.equal(conCarga.product.specifications.maxLoadKg, 150);
  const razonCarga = conCarga.reasons.find((r) => r.code === 'carga-declarada')!;
  assert.ok(razonCarga.text.includes('150 kg'));
});

test('el desglose del score explica los cinco factores y suma el total', () => {
  const ganadora = recomendar(escenario(2.5)).best!;
  assert.deepEqual(
    ganadora.breakdown.factors.map((f) => f.key),
    ['height', 'task', 'environment', 'versatility', 'price']
  );
  for (const factor of ganadora.breakdown.factors) {
    assert.ok(factor.value >= 0 && factor.value <= 1, factor.key + ' fuera de [0,1]');
    assert.ok(factor.detail.length > 0, factor.key + ' sin explicación');
  }
  const suma = ganadora.breakdown.factors.reduce((total, f) => total + f.weighted, 0);
  assert.ok(Math.abs(suma - ganadora.breakdown.total) < 0.005);
  assert.equal(ganadora.score, ganadora.breakdown.total);
});

test('el motor no emplea lenguaje de seguridad ni de certificación', () => {
  const prohibidas = /segur|certificad|garantiz|homologad|avalad|norma\s+en/i;
  const textos: string[] = [];

  for (const altura of [2.5, 3.5, 5, 5.8, 7]) {
    for (const entorno of Object.values(EnvironmentType)) {
      for (const tarea of Object.values(TaskType)) {
        const resultado = recomendar(escenario(altura, tarea, entorno));
        for (const candidata of [resultado.best, ...resultado.alternatives]) {
          if (!candidata) continue;
          textos.push(...candidata.reasons.map((r) => r.text));
          textos.push(...candidata.warnings.map((w) => w.text));
          textos.push(...candidata.breakdown.factors.map((f) => f.detail));
        }
        textos.push(...resultado.rejected.map((r) => r.text));
        textos.push(...resultado.scenarioNotes);
      }
    }
  }

  assert.ok(textos.length > 50, 'la muestra debería ser amplia');
  for (const texto of textos) {
    assert.ok(!prohibidas.test(texto), 'texto con lenguaje prohibido: ' + texto);
  }
});

/* ================================================================== *
 * Piezas internas
 * ================================================================== */

test('computeRequirement distingue apoyado de plataforma', () => {
  const apoyado = computeRequirement(escenario(4, TaskType.ACCESO, EnvironmentType.TEJADO));
  assert.equal(apoyado.leanFactor, 1.035);
  assert.equal(apoyado.topExtensionM, 1);
  assert.equal(apoyado.requiredLadderLength, 5.14);

  const plataforma = computeRequirement(escenario(4, TaskType.TRABAJO_SOBRE_PLATAFORMA, EnvironmentType.TEJADO));
  assert.equal(plataforma.leanFactor, 1, 'una estructura vertical no se inclina');
  assert.equal(plataforma.topExtensionM, 0);
  assert.equal(plataforma.requiredLadderLength, 4);
});

test('selectConfiguration prefiere autoportante en interior y apoyada en fachada', () => {
  const teeno = catalogo[0];
  const interior = selectConfiguration(teeno, escenario(3));
  const fachada = selectConfiguration(teeno, escenario(3, TaskType.ACCESO, EnvironmentType.FACHADA));

  assert.equal(interior?.type, ConfigurationType.TIJERA);
  assert.equal(interior?.name, 'Marco A');
  assert.equal(fachada?.type, ConfigurationType.ESCALERA_APOYADA);
  // DRABEST no tiene ninguna forma apoyada: cae en la primera compatible.
  const drabest = selectConfiguration(catalogo[2], escenario(3, TaskType.ACCESO, EnvironmentType.FACHADA));
  assert.equal(drabest?.name, 'Escalera autónoma');
});

test('parsePrecioEur entiende los dos formatos del catálogo', () => {
  assert.equal(parsePrecioEur('171.99€'), 171.99);
  assert.equal(parsePrecioEur('119.89€'), 119.89);
  assert.equal(parsePrecioEur('230,90€'), 230.9);
  assert.equal(parsePrecioEur('1.234,50 €'), 1234.5);
  assert.equal(parsePrecioEur('sin precio'), UNKNOWN);
});

test('el escenario se valida antes de calcular', () => {
  assert.throws(() => recomendar(escenario(0)), /targetHeight/);
  assert.throws(() => recomendar({ targetHeight: 3, task: 'pintar', environment: 'interior' } as never), /task/);
  assert.throws(() => recomendar({ targetHeight: 3, task: TaskType.ACCESO, environment: 'garaje' } as never), /environment/);
  assert.throws(() => recomendar(escenario(3, TaskType.ACCESO, EnvironmentType.INTERIOR, { userHeight: -1 })), /userHeight/);
  assert.throws(() => recommendLadder(escenario(3), 'no soy un array' as never), /products/);
});

test('el motor no depende de React, del DOM ni del catálogo', () => {
  const fuente = readFileSync(new URL('../src/domain/recommendation.ts', import.meta.url), 'utf8');
  const imports = [...fuente.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['./product.ts', './types.ts']);
  assert.ok(!/document\.|window\.|useState|useMemo/.test(fuente));
});
