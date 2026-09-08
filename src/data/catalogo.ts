/**
 * Catálogo en el modelo de dominio.
 *
 * FUENTE ÚNICA: la ficha de venta de Amazon de cada ASIN (tabla de atributos +
 * bloque "Acerca de este producto"). Si un dato no está ahí, va como UNKNOWN.
 *
 * Reglas al editar este fichero:
 *
 * 1. Sólo se escribe aquí lo que el fabricante declara. Nada de estimaciones.
 * 2. Un dato no declarado se deja como UNKNOWN (null), nunca se rellena "a ojo".
 * 3. `name` de cada configuración = el nombre que usa el fabricante, literal.
 * 4. `declaredCapabilities` recoge la "Altura máxima" de la ficha, que es un
 *    atributo del producto entero. Las alturas por configuración quedan en
 *    UNKNOWN porque ninguna ficha ata un número a una configuración concreta.
 * 5. `supportedTasks` se toma de TASKS_BY_CONFIGURATION_TYPE: se deduce de la
 *    forma de la configuración, no de una ficha técnica.
 * 6. `supportedEnvironments` está en UNKNOWN en las tres escaleras: ninguna
 *    ficha declara interior/fachada/tejado.
 * 7. `capabilities` NO se escribe: la calcula `createProduct`.
 */

import { createConfiguration, createProduct } from '../domain/product.ts';
import { ConfigurationType, TASKS_BY_CONFIGURATION_TYPE, UNKNOWN, type ConfigurationType as ConfigurationTypeT } from '../domain/types.ts';

/** Tareas que permite, por definición, una configuración de este tipo. */
const tareasDe = (tipo: ConfigurationTypeT) => [...TASKS_BY_CONFIGURATION_TYPE[tipo]];

/**
 * Atajo para las configuraciones de este catálogo: ninguna ficha declara
 * alturas ni entornos por configuración, así que todo eso queda en UNKNOWN.
 */
const configuracionDeclarada = (id: string, name: string, type: ConfigurationTypeT) =>
  createConfiguration({
    id,
    name,
    type,
    maxWorkHeight: UNKNOWN,
    maxLadderLength: UNKNOWN,
    maxPlatformHeight: UNKNOWN,
    supportedTasks: tareasDe(type),
    supportedEnvironments: UNKNOWN
  });

export const catalogo = Object.freeze([
  createProduct({
    id: 1,
    nombre: 'TEENO Escalera Telescópica Multifunción 5.82m',
    asin: 'B0GFVL9N91',
    precio: '171.99€',
    tag: 'Escalera plegable multifunción 7 en 1 de aluminio aeronáutico, con bloqueo de seguridad a 35°/105°/180°, dos bandejas de andamio metálicas, patas antideslizantes y dos ruedas extraíbles.',
    badge: 'La Más Vendida',
    imagenes: [
      '/teeno.avif',
      '/TEENO2.avif',
      '/teeno-support.avif',
      '/teeno-tooltray.avif',
      '/teeno-positions.avif',
      '/teeno-person.avif',
      '/teeno all heights.avif'
    ],
    specifications: {
      brand: 'TEENO',
      material: 'Aluminio aeronáutico',
      color: 'Modelo D',
      weightKg: 26,
      maxLoadKg: 150,
      dimensions: { widthCm: 28, heightCm: 580, depthCm: UNKNOWN },
      // "esta escalera de 4x4 escalones". El total de peldaños no se declara.
      sections: 4,
      stepsPerSection: 4,
      stepCount: UNKNOWN,
      // Declara dos bandejas de andamio y modo plataforma, pero ninguna medida.
      platform: UNKNOWN,
      specialFeatures: ['Plegable'],
      declaredUses: ['limpieza del hogar', 'reparaciones', 'tapicería', 'jardinería', 'lavado de autos'],
      gtin: '726374670723',
      datasheet: [
        { etiqueta: 'Material', valor: 'Aluminio aeronáutico' },
        { etiqueta: 'Peso', valor: '26 kg' },
        { etiqueta: 'Carga máxima', valor: '150 kg' },
        { etiqueta: 'Altura máxima', valor: '5,8 m' },
        { etiqueta: 'Configuración', valor: '7 en 1 · 4x4 escalones' }
      ]
    },
    // Ficha: "Altura máxima 5,8 m" y dimensiones 28 an. x 580 al. cm.
    // No declara altura de trabajo ni altura de la plataforma.
    declaredCapabilities: {
      maxLadderLength: 5.8,
      maxWorkHeight: UNKNOWN,
      maxPlatformHeight: UNKNOWN
    },
    // "se pliega fácilmente en 7 formas diferentes: marco A, marco M, escalera,
    // marco L, plataforma, escalera plegable y escalera recta".
    configurations: [
      configuracionDeclarada('teeno-marco-a', 'Marco A', ConfigurationType.TIJERA),
      configuracionDeclarada('teeno-marco-m', 'Marco M', ConfigurationType.MARCO_M),
      // El fabricante lista "escalera" y "escalera recta" por separado sin
      // explicar la diferencia: se conservan ambas con el mismo tipo físico.
      configuracionDeclarada('teeno-escalera', 'Escalera', ConfigurationType.ESCALERA_APOYADA),
      configuracionDeclarada('teeno-marco-l', 'Marco L', ConfigurationType.MARCO_L),
      configuracionDeclarada('teeno-plataforma', 'Plataforma', ConfigurationType.PLATAFORMA),
      configuracionDeclarada('teeno-escalera-plegable', 'Escalera plegable', ConfigurationType.ESCALERA_PLEGABLE),
      configuracionDeclarada('teeno-escalera-recta', 'Escalera recta', ConfigurationType.ESCALERA_APOYADA)
    ]
  }),

  createProduct({
    id: 2,
    nombre: 'TecTake Escalera Plegable de Aluminio Multiusos 4 en 1',
    asin: 'B01BM99LTI',
    precio: '119.89€',
    tag: 'Diseño 4 en 1 de aluminio: escalera simple, de tijera, andamio simple y andamio para desniveles. Plataforma de trabajo de 147 x 40 cm, capacidad de 150 kg y dos ruedas para moverla sin esfuerzo.',
    badge: 'Mejor Relación Calidad-Precio',
    imagenes: [
      '/tectake-1.avif',
      '/tectake-2.avif',
      '/tectake-3.avif',
      '/tectake-4.avif',
      '/tectake-5.avif',
      '/tectake-6.avif'
    ],
    specifications: {
      brand: 'tectake',
      material: 'Aluminio',
      color: 'Plata',
      weightKg: 16.4,
      maxLoadKg: 150,
      // La ficha da 40 an. x 147 al. cm, que son las medidas de la plataforma.
      dimensions: { widthCm: 40, heightCm: 147, depthCm: UNKNOWN },
      sections: UNKNOWN,
      stepsPerSection: UNKNOWN,
      stepCount: UNKNOWN,
      // Se declaran las medidas de la plataforma, no a qué altura queda.
      platform: { widthCm: 147, depthCm: 40, heightM: UNKNOWN },
      specialFeatures: ['Plegable'],
      declaredUses: ['construcción', 'renovación del hogar', 'bricolaje'],
      gtin: UNKNOWN,
      datasheet: [
        { etiqueta: 'Material', valor: 'Aluminio' },
        { etiqueta: 'Peso', valor: '16,4 kg' },
        { etiqueta: 'Carga máxima', valor: '150 kg' },
        { etiqueta: 'Altura máxima', valor: '2,75 m' },
        { etiqueta: 'Plataforma', valor: '147 x 40 cm' }
      ]
    },
    // Ficha: "Altura máxima 275 Centímetros". No declara altura de trabajo.
    declaredCapabilities: {
      maxLadderLength: 2.75,
      maxWorkHeight: UNKNOWN,
      maxPlatformHeight: UNKNOWN
    },
    // "diseño 4 en 1: escalera simple, de tijera, andamio simple y andamio para desniveles".
    configurations: [
      configuracionDeclarada('tectake-escalera-simple', 'Escalera simple', ConfigurationType.ESCALERA_APOYADA),
      configuracionDeclarada('tectake-tijera', 'De tijera', ConfigurationType.TIJERA),
      configuracionDeclarada('tectake-andamio-simple', 'Andamio simple', ConfigurationType.ANDAMIO),
      configuracionDeclarada('tectake-andamio-desniveles', 'Andamio para desniveles', ConfigurationType.ANDAMIO_DESNIVEL)
    ]
  }),

  createProduct({
    id: 3,
    nombre: 'DRABEST Escalera Serie Pro de Aluminio Multiusos de 3 Tramos',
    asin: 'B01BSP9YQ6',
    precio: '230,90€',
    tag: 'Serie Pro para profesionales: 4,90 m de largo y hasta 5,83 m de altura de trabajo, con estabilizador atornillado, peldaños acanalados de 28x28 mm y patas antideslizantes con amortiguadores.',
    badge: 'Calidad Profesional',
    imagenes: [
      '/drabest-1.avif',
      '/drabest-2.avif',
      '/drabest-3.avif',
      '/drabest-4.avif',
      '/drabest-5.avif',
      '/drabest-6.avif',
      '/drabest-7.avif'
    ],
    specifications: {
      brand: 'DRABEST',
      material: 'Aluminio',
      color: 'Plateado',
      weightKg: 14.5,
      // La ficha no declara capacidad de carga para este modelo.
      maxLoadKg: UNKNOWN,
      dimensions: UNKNOWN,
      // Nombre "3 Tramos" + "Número de pasos 27" => 3x9.
      sections: 3,
      stepsPerSection: 9,
      stepCount: 27,
      platform: UNKNOWN,
      specialFeatures: ['Extensible', 'Ligero'],
      declaredUses: ['trabajo a grandes alturas', 'uso profesional'],
      gtin: '05904680391005',
      datasheet: [
        { etiqueta: 'Material', valor: 'Aluminio' },
        { etiqueta: 'Peso', valor: '14,5 kg' },
        { etiqueta: 'Longitud', valor: '4,90 m' },
        { etiqueta: 'Altura de trabajo', valor: 'Hasta 5,83 m' },
        { etiqueta: 'Número de peldaños', valor: '27 (3x9)' }
      ]
    },
    // Único producto que separa ambas magnitudes: "La escalera mide 4,90 m de
    // largo y ofrece una altura de trabajo de hasta 5,83 m".
    declaredCapabilities: {
      maxLadderLength: 4.9,
      maxWorkHeight: 5.83,
      maxPlatformHeight: UNKNOWN
    },
    // "Es muy adecuada como escalera autónoma, como escalera de tijera y en la
    // configuración A con una extensión". El fabricante lista "autónoma" aparte
    // de "tijera", así que se conservan como configuraciones distintas.
    configurations: [
      configuracionDeclarada('drabest-autonoma', 'Escalera autónoma', ConfigurationType.AUTOPORTANTE),
      configuracionDeclarada('drabest-tijera', 'Escalera de tijera', ConfigurationType.TIJERA),
      configuracionDeclarada('drabest-configuracion-a', 'Configuración A con extensión', ConfigurationType.TIJERA_CON_EXTENSION)
    ]
  })
]);


export const buscarProductoPorId = (id: number) => catalogo.find((producto) => producto.id === id);
