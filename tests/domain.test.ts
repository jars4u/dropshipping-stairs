import test from 'node:test';
import assert from 'node:assert/strict';

import { createConfiguration, createProduct, deriveCapabilities } from '../src/domain/product.ts';
import { ConfigurationType, EnvironmentType, TaskType, UNKNOWN } from '../src/domain/types.ts';

const configuracionMinima = (extra = {}) =>
  createConfiguration({ id: 'x', name: 'X', type: ConfigurationType.TIJERA, ...extra });

test('un dato no declarado queda como UNKNOWN, no como 0 ni undefined', () => {
  const configuracion = configuracionMinima();
  assert.equal(configuracion.maxWorkHeight, UNKNOWN);
  assert.equal(configuracion.maxLadderLength, UNKNOWN);
  assert.equal(configuracion.maxPlatformHeight, UNKNOWN);
  assert.equal(configuracion.supportedTasks, UNKNOWN);
  assert.equal(configuracion.supportedEnvironments, UNKNOWN);
});

test('los enums rechazan strings arbitrarios', () => {
  // @ts-expect-error: pasar un tipo invalido es justo lo que se comprueba.
  assert.throws(() => createConfiguration({ id: 'x', name: 'X', type: 'andamio-volador' }), /ConfigurationType/);
  assert.throws(() => configuracionMinima({ supportedTasks: ['pintar'] }), /supportedTasks/);
  assert.throws(() => configuracionMinima({ supportedEnvironments: ['garaje'] }), /supportedEnvironments/);
});

test('las medidas deben ser metros positivos', () => {
  assert.throws(() => configuracionMinima({ maxWorkHeight: '5.8' }), /maxWorkHeight/);
  assert.throws(() => configuracionMinima({ maxLadderLength: 0 }), /maxLadderLength/);
});

test('las capacidades se derivan de las configuraciones, no se escriben a mano', () => {
  const capacidades = deriveCapabilities([
    configuracionMinima({ id: 'a', maxLadderLength: 3, supportedTasks: [TaskType.ACCESO] }),
    createConfiguration({
      id: 'b',
      name: 'B',
      type: ConfigurationType.ANDAMIO,
      maxLadderLength: 4,
      maxPlatformHeight: 1.5,
      supportedTasks: [TaskType.TRABAJO_SOBRE_PLATAFORMA],
      supportedEnvironments: [EnvironmentType.INTERIOR]
    })
  ]);

  assert.equal(capacidades.maxLadderLength, 4);
  assert.equal(capacidades.maxPlatformHeight, 1.5);
  assert.equal(capacidades.maxWorkHeight, UNKNOWN, 'ninguna configuración la declara');
  assert.deepEqual(capacidades.supportedTasks, [TaskType.ACCESO, TaskType.TRABAJO_SOBRE_PLATAFORMA]);
  assert.deepEqual(capacidades.supportedEnvironments, [EnvironmentType.INTERIOR]);
});

test('un producto necesita al menos una configuración', () => {
  assert.throws(() => createProduct({ id: 9, nombre: 'N', configurations: [] }), /al menos una configuración/);
});
