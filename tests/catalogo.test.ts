import test from 'node:test';
import assert from 'node:assert/strict';

import { catalogo } from '../src/data/catalogo.ts';
import { ConfigurationType, EnvironmentType, TaskType, UNKNOWN } from '../src/domain/types.ts';

const porId = (id) => catalogo.find((producto) => producto.id === id);

/**
 * Identidad comercial: lo único que NO puede cambiar nunca sin decisión de
 * negocio. Copiado del catálogo original.
 */
const IDENTIDAD = [
  {
    id: 1,
    nombre: 'TEENO Escalera Telescópica Multifunción 5.82m',
    asin: 'B0GFVL9N91',
    precio: '171.99€',
    badge: 'La Más Vendida',
    imagenes: [
      '/teeno.avif',
      '/TEENO2.avif',
      '/teeno-support.avif',
      '/teeno-tooltray.avif',
      '/teeno-positions.avif',
      '/teeno-person.avif',
      '/teeno all heights.avif'
    ]
  },
  {
    id: 2,
    nombre: 'TecTake Escalera Plegable de Aluminio Multiusos 4 en 1',
    asin: 'B01BM99LTI',
    precio: '119.89€',
    badge: 'Mejor Relación Calidad-Precio',
    imagenes: [
      '/tectake-1.avif',
      '/tectake-2.avif',
      '/tectake-3.avif',
      '/tectake-4.avif',
      '/tectake-5.avif',
      '/tectake-6.avif'
    ]
  },
  {
    id: 3,
    nombre: 'DRABEST Escalera Serie Pro de Aluminio Multiusos de 3 Tramos',
    asin: 'B01BSP9YQ6',
    precio: '230,90€',
    badge: 'Calidad Profesional',
    imagenes: [
      '/drabest-1.avif',
      '/drabest-2.avif',
      '/drabest-3.avif',
      '/drabest-4.avif',
      '/drabest-5.avif',
      '/drabest-6.avif',
      '/drabest-7.avif'
    ]
  }
];

test('el catálogo tiene los 3 productos iniciales, en orden', () => {
  assert.equal(catalogo.length, 3);
  assert.deepEqual(
    catalogo.map((producto) => [producto.id, producto.asin]),
    [
      [1, 'B0GFVL9N91'],
      [2, 'B01BM99LTI'],
      [3, 'B01BSP9YQ6']
    ]
  );
});

test('nombre, ASIN, precio, badge e imágenes se conservan intactos', () => {
  for (const esperado of IDENTIDAD) {
    const producto = porId(esperado.id);
    assert.equal(producto.nombre, esperado.nombre);
    assert.equal(producto.asin, esperado.asin);
    assert.equal(producto.precio, esperado.precio);
    assert.equal(producto.badge, esperado.badge);
    assert.deepEqual([...producto.imagenes], esperado.imagenes);
    assert.equal(producto.imagen, esperado.imagenes[0]);
  }
});

test('las especificaciones son las de la ficha de Amazon', () => {
  assert.deepEqual(
    catalogo.map(({ specifications: specs }) => [specs.brand, specs.weightKg, specs.maxLoadKg, specs.color]),
    [
      ['TEENO', 26, 150, 'Modelo D'],
      ['tectake', 16.4, 150, 'Plata'],
      ['DRABEST', 14.5, UNKNOWN, 'Plateado']
    ]
  );
  assert.deepEqual(porId(1).specifications.dimensions, { widthCm: 28, heightCm: 580, depthCm: UNKNOWN });
  assert.deepEqual(porId(2).specifications.platform, { widthCm: 147, depthCm: 40, heightM: UNKNOWN });
  assert.equal(porId(1).specifications.gtin, '726374670723');
  assert.equal(porId(3).specifications.gtin, '05904680391005');
});

test('los peldaños son los declarados: TEENO 4x4, TecTake ninguno, DRABEST 27 (3x9)', () => {
  assert.deepEqual(
    catalogo.map(({ specifications: s }) => [s.sections, s.stepsPerSection, s.stepCount]),
    [
      [4, 4, UNKNOWN], // "escalera de 4x4 escalones"; el total no se declara
      [UNKNOWN, UNKNOWN, UNKNOWN], // la ficha de TecTake no habla de peldaños
      [3, 9, 27] // "Número de pasos 27" + "3 Tramos"
    ]
  );
});

test('las 7 configuraciones declaradas de TEENO están representadas', () => {
  const teeno = porId(1);
  assert.deepEqual(
    teeno.configurations.map((configuracion) => configuracion.name),
    ['Marco A', 'Marco M', 'Escalera', 'Marco L', 'Plataforma', 'Escalera plegable', 'Escalera recta']
  );
  assert.deepEqual(
    teeno.configurations.map((configuracion) => configuracion.type),
    [
      ConfigurationType.TIJERA,
      ConfigurationType.MARCO_M,
      ConfigurationType.ESCALERA_APOYADA,
      ConfigurationType.MARCO_L,
      ConfigurationType.PLATAFORMA,
      ConfigurationType.ESCALERA_PLEGABLE,
      ConfigurationType.ESCALERA_APOYADA
    ]
  );
});

test('las 4 configuraciones declaradas de TecTake están representadas', () => {
  assert.deepEqual(
    porId(2).configurations.map((configuracion) => [configuracion.name, configuracion.type]),
    [
      ['Escalera simple', ConfigurationType.ESCALERA_APOYADA],
      ['De tijera', ConfigurationType.TIJERA],
      ['Andamio simple', ConfigurationType.ANDAMIO],
      ['Andamio para desniveles', ConfigurationType.ANDAMIO_DESNIVEL]
    ]
  );
});

test('las 3 configuraciones declaradas de DRABEST están representadas', () => {
  assert.deepEqual(
    porId(3).configurations.map((configuracion) => [configuracion.name, configuracion.type]),
    [
      ['Escalera autónoma', ConfigurationType.AUTOPORTANTE],
      ['Escalera de tijera', ConfigurationType.TIJERA],
      ['Configuración A con extensión', ConfigurationType.TIJERA_CON_EXTENSION]
    ]
  );
});

test('cada tipo de configuración del enum lo usa al menos un producto', () => {
  const usados = new Set(catalogo.flatMap((p) => p.configurations.map((c) => c.type)));
  for (const tipo of Object.values(ConfigurationType)) {
    assert.ok(usados.has(tipo), 'ConfigurationType.' + tipo + ' no lo usa ningún producto');
  }
});

test('las alturas son exactamente las que declara cada ficha', () => {
  assert.deepEqual(
    catalogo.map(({ capabilities: c }) => [c.maxLadderLength, c.maxWorkHeight, c.maxPlatformHeight]),
    [
      [5.8, UNKNOWN, UNKNOWN], // TEENO: "Altura máxima 5,8 m" / 580 cm de alto
      [2.75, UNKNOWN, UNKNOWN], // TecTake: "Altura máxima 275 Centímetros"
      [4.9, 5.83, UNKNOWN] // DRABEST: 4,90 m de largo, 5,83 m de altura de trabajo
    ]
  );
});

test('longitud de escalera y altura de trabajo no se confunden', () => {
  const drabest = porId(3);
  assert.notEqual(drabest.capabilities.maxLadderLength, drabest.capabilities.maxWorkHeight);
  assert.ok(drabest.capabilities.maxWorkHeight > drabest.capabilities.maxLadderLength);
  // Y el único que declara altura de trabajo es DRABEST.
  assert.equal(catalogo.filter((p) => p.capabilities.maxWorkHeight !== UNKNOWN).length, 1);
});

test('las alturas vienen del producto, no de una configuración', () => {
  for (const producto of catalogo) {
    for (const configuracion of producto.configurations) {
      for (const campo of ['maxWorkHeight', 'maxLadderLength', 'maxPlatformHeight']) {
        assert.equal(configuracion[campo], UNKNOWN, configuracion.id + '.' + campo);
      }
    }
  }
  assert.equal(porId(1).declaredCapabilities.maxLadderLength, 5.8);
});

test('las tareas soportadas se corresponden con el tipo de configuración', () => {
  assert.deepEqual(porId(1).capabilities.supportedTasks, [TaskType.ACCESO, TaskType.TRABAJO_SOBRE_PLATAFORMA]);
  assert.deepEqual(porId(2).capabilities.supportedTasks, [TaskType.ACCESO, TaskType.TRABAJO_SOBRE_PLATAFORMA]);
  // DRABEST no declara ninguna configuración con plataforma.
  assert.deepEqual(porId(3).capabilities.supportedTasks, [TaskType.ACCESO]);
});

test('no se inventan capacidades: sólo son números las medidas declaradas', () => {
  const declaradas = [];
  for (const producto of catalogo) {
    const fuentes = [['producto', producto.declaredCapabilities], ...producto.configurations.map((c) => [c.id, c])];
    for (const [origen, fuente] of fuentes) {
      for (const campo of ['maxWorkHeight', 'maxLadderLength', 'maxPlatformHeight']) {
        if (fuente[campo] !== UNKNOWN) declaradas.push([producto.id, origen, campo, fuente[campo]]);
      }
    }
  }
  assert.deepEqual(declaradas, [
    [1, 'producto', 'maxLadderLength', 5.8],
    [2, 'producto', 'maxLadderLength', 2.75],
    [3, 'producto', 'maxWorkHeight', 5.83],
    [3, 'producto', 'maxLadderLength', 4.9]
  ]);
});

test('no se inventan capacidades: ninguna ficha declara altura de plataforma', () => {
  for (const producto of catalogo) {
    assert.equal(producto.capabilities.maxPlatformHeight, UNKNOWN, producto.nombre);
  }
  // TecTake declara las medidas de la plataforma, pero no a qué altura queda.
  assert.equal(porId(2).specifications.platform.heightM, UNKNOWN);
});

test('no se inventan capacidades: ningún producto declara entornos compatibles', () => {
  for (const producto of catalogo) {
    assert.equal(producto.capabilities.supportedEnvironments, UNKNOWN, producto.nombre);
    for (const configuracion of producto.configurations) {
      assert.equal(configuracion.supportedEnvironments, UNKNOWN, configuracion.id);
    }
  }
  // El enum existe para la fase siguiente, pero hoy nadie lo consume del catálogo.
  assert.deepEqual(Object.values(EnvironmentType), ['interior', 'fachada', 'tejado']);
});

test('la ficha técnica visible no contradice a las specs estructuradas', () => {
  const valorDe = (producto, etiqueta) =>
    producto.specifications.datasheet.find((fila) => fila.etiqueta === etiqueta)?.valor;

  assert.equal(valorDe(porId(1), 'Peso'), '26 kg');
  assert.equal(valorDe(porId(1), 'Altura máxima'), '5,8 m');
  assert.equal(valorDe(porId(2), 'Altura máxima'), '2,75 m');
  assert.equal(valorDe(porId(3), 'Longitud'), '4,90 m');
  assert.equal(valorDe(porId(3), 'Altura de trabajo'), 'Hasta 5,83 m');
  // Ninguna fila de ficha técnica puede quedar vacía.
  for (const producto of catalogo) {
    assert.ok(producto.specifications.datasheet.length > 0, producto.nombre);
    for (const fila of producto.specifications.datasheet) {
      assert.ok(fila.etiqueta && fila.valor, producto.nombre + ': fila incompleta');
    }
  }
});

test('el catálogo es inmutable', () => {
  assert.throws(() => {
    catalogo.push({});
  });
  assert.throws(() => {
    porId(1).capabilities.maxWorkHeight = 9;
  });
});
