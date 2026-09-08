/**
 * Modelo de dominio del catálogo.
 *
 * Tres conceptos que NO deben mezclarse:
 *
 * - `Product`        : lo que se compra (un ASIN, un precio, unas fotos).
 * - `Configuration`  : una forma concreta de montar ese producto. Un producto
 *                      tiene 1..n configuraciones y cada una puede tener sus
 *                      propias alturas y compatibilidades.
 * - `Capabilities`   : el resumen de lo que el producto puede hacer en su mejor
 *                      configuración. Se DERIVA, nunca se escribe a mano.
 *
 * Tres alturas que tampoco deben mezclarse (todas en metros):
 *
 * - `maxWorkHeight`     : altura a la que la persona puede llegar a trabajar.
 * - `maxLadderLength`   : longitud del propio perfil de la escalera desplegada.
 * - `maxPlatformHeight` : altura del suelo a la superficie de la plataforma.
 *
 * Y dos compatibilidades independientes:
 *
 * - `supportedTasks`        : qué se puede hacer (TaskType).
 * - `supportedEnvironments` : dónde se puede usar (EnvironmentType).
 *
 * Cualquiera de esos cinco campos puede valer `UNKNOWN` (null) cuando el dato no
 * está declarado. Un `null` significa "no lo sabemos", nunca "no lo soporta".
 *
 * DE DÓNDE SALEN LAS ALTURAS
 * --------------------------
 * Las fichas de Amazon declaran "Altura máxima" como atributo *del producto*,
 * sin decir en qué configuración se alcanza. Por eso hay dos entradas:
 *
 * - `declaredCapabilities` : lo que el fabricante afirma del producto entero.
 * - la altura de cada `Configuration` : sólo cuando el fabricante la ata a esa
 *   configuración concreta. Hoy ninguno de los tres lo hace, así que están en
 *   UNKNOWN y el número vive únicamente a nivel de producto.
 *
 * `capabilities` = máximo de ambas fuentes, campo a campo.
 */

import {
  UNKNOWN,
  isTaskType,
  isEnvironmentType,
  isConfigurationType,
  type ConfigurationType,
  type EnvironmentType,
  type Maybe,
  type TaskType
} from './types.ts';

export interface Configuration {
  readonly id: string;
  /** Nombre tal y como lo declara el fabricante. */
  readonly name: string;
  readonly type: ConfigurationType;
  /** Metros, o null si no está declarado para ESTA configuración. */
  readonly maxWorkHeight: Maybe<number>;
  readonly maxLadderLength: Maybe<number>;
  readonly maxPlatformHeight: Maybe<number>;
  readonly supportedTasks: Maybe<readonly TaskType[]>;
  readonly supportedEnvironments: Maybe<readonly EnvironmentType[]>;
}

export interface Dimensions {
  readonly widthCm: Maybe<number>;
  readonly heightCm: Maybe<number>;
  readonly depthCm: Maybe<number>;
}

export interface Platform {
  readonly widthCm: Maybe<number>;
  readonly depthCm: Maybe<number>;
  /** Altura del suelo a la plataforma. Ninguna ficha la declara. */
  readonly heightM: Maybe<number>;
}

export interface DatasheetRow {
  readonly etiqueta: string;
  readonly valor: string;
}

export interface Specifications {
  readonly brand: Maybe<string>;
  readonly material: Maybe<string>;
  readonly color: Maybe<string>;
  readonly weightKg: Maybe<number>;
  readonly maxLoadKg: Maybe<number>;
  readonly dimensions: Maybe<Dimensions>;
  /** Nº de tramos declarados. */
  readonly sections: Maybe<number>;
  /** Peldaños por tramo declarados. */
  readonly stepsPerSection: Maybe<number>;
  /** Total de peldaños, sólo si el fabricante lo declara. */
  readonly stepCount: Maybe<number>;
  readonly platform: Maybe<Platform>;
  /** "Función especial" de la ficha (plegable, extensible, ligero...). */
  readonly specialFeatures: readonly string[];
  /** Usos que enumera el fabricante, en su propio idioma. */
  readonly declaredUses: readonly string[];
  /** UPC/EAN declarado. */
  readonly gtin: Maybe<string>;
  /** Ficha técnica que se muestra en la UI. */
  readonly datasheet: readonly DatasheetRow[];
}

export interface Capabilities {
  readonly maxWorkHeight: Maybe<number>;
  readonly maxLadderLength: Maybe<number>;
  readonly maxPlatformHeight: Maybe<number>;
  readonly supportedTasks: Maybe<readonly TaskType[]>;
  readonly supportedEnvironments: Maybe<readonly EnvironmentType[]>;
}

export interface Product {
  readonly id: number;
  readonly nombre: string;
  readonly asin: string;
  /** Cadena tal cual se muestra. */
  readonly precio: string;
  /** Imagen principal. */
  readonly imagen: Maybe<string>;
  readonly imagenes: readonly string[];
  readonly badge: string;
  readonly tag: string;
  readonly specifications: Specifications;
  readonly configurations: readonly Configuration[];
  /** Lo que el fabricante afirma del producto entero, sin atarlo a una configuración. */
  readonly declaredCapabilities: Capabilities;
  readonly capabilities: Capabilities;
}

export const MEASURE_FIELDS = ['maxWorkHeight', 'maxLadderLength', 'maxPlatformHeight'] as const;
export const COMPATIBILITY_FIELDS = ['supportedTasks', 'supportedEnvironments'] as const;

type MeasureField = (typeof MEASURE_FIELDS)[number];
type CompatibilityField = (typeof COMPATIBILITY_FIELDS)[number];

const asUnknownOr = <T>(valor: T | undefined | null): Maybe<T> =>
  valor === undefined || valor === null ? UNKNOWN : valor;

const listaOUnknown = <T>(
  valores: readonly T[] | undefined | null,
  esValido: (valor: unknown) => boolean,
  etiqueta: string
): Maybe<readonly T[]> => {
  if (valores === undefined || valores === null || valores.length === 0) return UNKNOWN;
  if (!Array.isArray(valores)) throw new TypeError(etiqueta + ' debe ser un array o null');
  for (const valor of valores) {
    if (!esValido(valor)) throw new TypeError(etiqueta + ': valor no permitido "' + String(valor) + '"');
  }
  return Object.freeze([...valores]);
};

const medidaOUnknown = (valor: number | undefined | null, etiqueta: string): Maybe<number> => {
  if (valor === undefined || valor === null) return UNKNOWN;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new TypeError(etiqueta + ' debe ser un número de metros positivo o null');
  }
  return valor;
};

const maximoConocido = (a: Maybe<number>, b: Maybe<number>): Maybe<number> => {
  if (a === UNKNOWN) return b;
  if (b === UNKNOWN) return a;
  return Math.max(a, b);
};

const unionConocida = <T>(a: Maybe<readonly T[]>, b: Maybe<readonly T[]>): Maybe<readonly T[]> => {
  if (a === UNKNOWN && b === UNKNOWN) return UNKNOWN;
  return Object.freeze([...new Set([...(a ?? []), ...(b ?? [])])]);
};

export interface ConfigurationInput {
  id: string;
  name: string;
  type: ConfigurationType;
  maxWorkHeight?: Maybe<number>;
  maxLadderLength?: Maybe<number>;
  maxPlatformHeight?: Maybe<number>;
  supportedTasks?: Maybe<readonly TaskType[]>;
  supportedEnvironments?: Maybe<readonly EnvironmentType[]>;
}

/** Crea una configuración normalizada. Todo dato ausente queda como UNKNOWN. */
export function createConfiguration({
  id,
  name,
  type,
  maxWorkHeight,
  maxLadderLength,
  maxPlatformHeight,
  supportedTasks,
  supportedEnvironments
}: ConfigurationInput): Configuration {
  if (!id || !name) throw new TypeError('Una configuración necesita id y name');
  if (!isConfigurationType(type)) throw new TypeError('ConfigurationType desconocido: "' + String(type) + '"');

  return Object.freeze({
    id,
    name,
    type,
    maxWorkHeight: medidaOUnknown(maxWorkHeight, id + '.maxWorkHeight'),
    maxLadderLength: medidaOUnknown(maxLadderLength, id + '.maxLadderLength'),
    maxPlatformHeight: medidaOUnknown(maxPlatformHeight, id + '.maxPlatformHeight'),
    supportedTasks: listaOUnknown(supportedTasks, isTaskType, id + '.supportedTasks'),
    supportedEnvironments: listaOUnknown(supportedEnvironments, isEnvironmentType, id + '.supportedEnvironments')
  });
}

export type DeclaredCapabilitiesInput = Partial<{
  maxWorkHeight: Maybe<number>;
  maxLadderLength: Maybe<number>;
  maxPlatformHeight: Maybe<number>;
  supportedTasks: Maybe<readonly TaskType[]>;
  supportedEnvironments: Maybe<readonly EnvironmentType[]>;
}>;

/**
 * Normaliza lo que el fabricante afirma del producto entero, sin atarlo a una
 * configuración concreta (la "Altura máxima" de la ficha de Amazon).
 */
export function normalizeDeclaredCapabilities(
  declaradas: DeclaredCapabilitiesInput = {},
  etiqueta = 'declaredCapabilities'
): Capabilities {
  return Object.freeze({
    maxWorkHeight: medidaOUnknown(declaradas.maxWorkHeight, etiqueta + '.maxWorkHeight'),
    maxLadderLength: medidaOUnknown(declaradas.maxLadderLength, etiqueta + '.maxLadderLength'),
    maxPlatformHeight: medidaOUnknown(declaradas.maxPlatformHeight, etiqueta + '.maxPlatformHeight'),
    supportedTasks: listaOUnknown(declaradas.supportedTasks, isTaskType, etiqueta + '.supportedTasks'),
    supportedEnvironments: listaOUnknown(
      declaradas.supportedEnvironments,
      isEnvironmentType,
      etiqueta + '.supportedEnvironments'
    )
  });
}

const maximoDeclarado = (configurations: readonly Configuration[], campo: MeasureField): Maybe<number> => {
  const declarados = configurations
    .map((configuracion) => configuracion[campo])
    .filter((valor): valor is number => valor !== UNKNOWN);
  return declarados.length ? Math.max(...declarados) : UNKNOWN;
};

const unionDeclarada = (configurations: readonly Configuration[], campo: CompatibilityField): Maybe<readonly string[]> => {
  const declaradas = configurations.filter((configuracion) => configuracion[campo] !== UNKNOWN);
  if (!declaradas.length) return UNKNOWN;
  return Object.freeze([...new Set(declaradas.flatMap((configuracion) => [...(configuracion[campo] ?? [])]))]);
};

/**
 * Agrega las capacidades que se deducen de las configuraciones.
 * Si ninguna configuración declara un dato, el agregado es UNKNOWN.
 */
export function deriveCapabilities(configurations: readonly Configuration[]): Capabilities {
  return Object.freeze({
    maxWorkHeight: maximoDeclarado(configurations, 'maxWorkHeight'),
    maxLadderLength: maximoDeclarado(configurations, 'maxLadderLength'),
    maxPlatformHeight: maximoDeclarado(configurations, 'maxPlatformHeight'),
    supportedTasks: unionDeclarada(configurations, 'supportedTasks') as Maybe<readonly TaskType[]>,
    supportedEnvironments: unionDeclarada(configurations, 'supportedEnvironments') as Maybe<readonly EnvironmentType[]>
  });
}

/** Funde lo declarado a nivel de producto con lo derivado de las configuraciones. */
export function mergeCapabilities(declaradas: Capabilities, derivadas: Capabilities): Capabilities {
  return Object.freeze({
    maxWorkHeight: maximoConocido(declaradas.maxWorkHeight, derivadas.maxWorkHeight),
    maxLadderLength: maximoConocido(declaradas.maxLadderLength, derivadas.maxLadderLength),
    maxPlatformHeight: maximoConocido(declaradas.maxPlatformHeight, derivadas.maxPlatformHeight),
    supportedTasks: unionConocida(declaradas.supportedTasks, derivadas.supportedTasks),
    supportedEnvironments: unionConocida(declaradas.supportedEnvironments, derivadas.supportedEnvironments)
  });
}

export interface SpecificationsInput {
  brand?: Maybe<string>;
  material?: Maybe<string>;
  color?: Maybe<string>;
  weightKg?: Maybe<number>;
  maxLoadKg?: Maybe<number>;
  dimensions?: Maybe<Partial<Dimensions>>;
  sections?: Maybe<number>;
  stepsPerSection?: Maybe<number>;
  stepCount?: Maybe<number>;
  platform?: Maybe<Partial<Platform>>;
  specialFeatures?: readonly string[];
  declaredUses?: readonly string[];
  gtin?: Maybe<string>;
  datasheet?: readonly DatasheetRow[];
}

export interface ProductInput {
  id: number;
  nombre: string;
  asin?: string;
  precio?: string;
  imagenes?: readonly string[];
  badge?: string;
  tag?: string;
  specifications?: SpecificationsInput;
  configurations: readonly Configuration[];
  declaredCapabilities?: DeclaredCapabilitiesInput;
}

/** Crea un producto normalizado con sus capacidades ya derivadas. */
export function createProduct({
  id,
  nombre,
  asin = '',
  precio = '',
  imagenes = [],
  badge = '',
  tag = '',
  specifications,
  configurations,
  declaredCapabilities
}: ProductInput): Product {
  if (!Array.isArray(configurations) || configurations.length === 0) {
    throw new TypeError('El producto ' + id + ' necesita al menos una configuración');
  }

  const specs = specifications ?? {};
  const declaradas = normalizeDeclaredCapabilities(declaredCapabilities, id + '.declaredCapabilities');

  return Object.freeze({
    id,
    nombre,
    asin,
    precio,
    imagen: imagenes[0] ?? UNKNOWN,
    imagenes: Object.freeze([...imagenes]),
    badge,
    tag,
    specifications: Object.freeze({
      brand: asUnknownOr(specs.brand),
      material: asUnknownOr(specs.material),
      color: asUnknownOr(specs.color),
      weightKg: asUnknownOr(specs.weightKg),
      maxLoadKg: asUnknownOr(specs.maxLoadKg),
      dimensions: specs.dimensions
        ? Object.freeze({
            widthCm: asUnknownOr(specs.dimensions.widthCm),
            heightCm: asUnknownOr(specs.dimensions.heightCm),
            depthCm: asUnknownOr(specs.dimensions.depthCm)
          })
        : UNKNOWN,
      sections: asUnknownOr(specs.sections),
      stepsPerSection: asUnknownOr(specs.stepsPerSection),
      stepCount: asUnknownOr(specs.stepCount),
      platform: specs.platform
        ? Object.freeze({
            widthCm: asUnknownOr(specs.platform.widthCm),
            depthCm: asUnknownOr(specs.platform.depthCm),
            heightM: asUnknownOr(specs.platform.heightM)
          })
        : UNKNOWN,
      specialFeatures: Object.freeze([...(specs.specialFeatures ?? [])]),
      declaredUses: Object.freeze([...(specs.declaredUses ?? [])]),
      gtin: asUnknownOr(specs.gtin),
      datasheet: Object.freeze((specs.datasheet ?? []).map((fila) => Object.freeze({ ...fila })))
    }),
    configurations: Object.freeze([...configurations]),
    declaredCapabilities: declaradas,
    capabilities: mergeCapabilities(declaradas, deriveCapabilities(configurations))
  });
}
