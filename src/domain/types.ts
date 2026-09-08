/**
 * Vocabulario cerrado del dominio de escaleras.
 *
 * Regla de oro de este módulo: aquí sólo se declaran *tipos*, nunca capacidades
 * de un producto concreto. Un tipo existe únicamente si alguna configuración
 * declarada en la ficha de Amazon lo necesita.
 *
 * Se usan objetos `as const` + uniones en lugar de `enum` de TypeScript: el
 * type-stripping de Node sólo admite sintaxis borrable, y `enum` no lo es.
 */

/** Valor con el que se representa un dato técnico que todavía NO conocemos. */
export const UNKNOWN = null;
export type Unknown = null;

/** Un dato que puede no estar declarado. */
export type Maybe<T> = T | Unknown;

/**
 * Qué quiere hacer la persona una vez arriba.
 *
 * Sólo dos valores: es la única distinción que las fichas soportan hoy
 * (trabajar apoyado/subiendo vs. trabajar de pie sobre una plataforma).
 *
 * Los usos concretos que enumera un fabricante ("jardinería", "lavado de
 * autos", "tapicería"...) NO son TaskType: sólo los declara TEENO, así que
 * convertirlos en enum haría parecer que los otros dos no sirven para eso. Van
 * en `specifications.declaredUses` como texto libre.
 */
export const TaskType = {
  /** Subir, alcanzar un punto y trabajar apoyado en la propia escalera. */
  ACCESO: 'acceso',
  /** Trabajar de pie sobre una plataforma, con las manos libres. */
  TRABAJO_SOBRE_PLATAFORMA: 'trabajo-sobre-plataforma'
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

/**
 * Dónde se usa la escalera. Coincide con las tres opciones que ya existen en la
 * UI del calculador, no se añaden entornos nuevos.
 *
 * Ninguna de las tres fichas de Amazon declara compatibilidad por entorno, así
 * que hoy este enum no se consume desde el catálogo (ver `supportedEnvironments`).
 */
export const EnvironmentType = {
  INTERIOR: 'interior',
  FACHADA: 'fachada',
  TEJADO: 'tejado'
} as const;
export type EnvironmentType = (typeof EnvironmentType)[keyof typeof EnvironmentType];

/**
 * Forma física en la que se puede montar la escalera.
 *
 * Cada valor procede literalmente de una configuración declarada por el
 * fabricante. Ojo: el *mecanismo* del producto (telescópico, plegable,
 * extensible) NO es una configuración; vive en `specifications.specialFeatures`.
 */
export const ConfigurationType = {
  /** Apoyada en línea recta contra un muro. TEENO "escalera"/"escalera recta", TecTake "escalera simple". */
  ESCALERA_APOYADA: 'escalera-apoyada',
  /** Forma plegada corta. TEENO "escalera plegable". */
  ESCALERA_PLEGABLE: 'escalera-plegable',
  /** Marco A / tijera autoportante. TEENO "marco A", TecTake "de tijera", DRABEST "escalera de tijera". */
  TIJERA: 'tijera',
  /** Marco A con un tramo extendido. DRABEST "configuración A con una extensión". */
  TIJERA_CON_EXTENSION: 'tijera-con-extension',
  /** DRABEST lista "escalera autónoma" aparte de "escalera de tijera"; se respeta esa distinción. */
  AUTOPORTANTE: 'autoportante',
  /** TEENO "marco M". */
  MARCO_M: 'marco-m',
  /** TEENO "marco L". */
  MARCO_L: 'marco-l',
  /** Modo plataforma a 180° con las bandejas de andamio. TEENO "plataforma". */
  PLATAFORMA: 'plataforma',
  /** Andamio simple con plataforma. TecTake "andamio simple". */
  ANDAMIO: 'andamio',
  /** Andamio para desniveles (escaleras, terreno irregular). TecTake "andamio para desniveles". */
  ANDAMIO_DESNIVEL: 'andamio-desnivel'
} as const;
export type ConfigurationType = (typeof ConfigurationType)[keyof typeof ConfigurationType];

export const TASK_TYPES: readonly TaskType[] = Object.freeze(Object.values(TaskType));
export const ENVIRONMENT_TYPES: readonly EnvironmentType[] = Object.freeze(Object.values(EnvironmentType));
export const CONFIGURATION_TYPES: readonly ConfigurationType[] = Object.freeze(Object.values(ConfigurationType));

/**
 * Tareas que un tipo de configuración permite *por definición* de su forma.
 *
 * Esto NO es una especificación del fabricante: es la definición del propio tipo
 * (una tijera sirve para acceder; un andamio con plataforma sirve para trabajar
 * sobre ella). Cualquier dato que sí dependa del fabricante —alturas, entornos
 * admitidos— se deja como UNKNOWN en el catálogo.
 */
export const TASKS_BY_CONFIGURATION_TYPE: Readonly<Record<ConfigurationType, readonly TaskType[]>> = Object.freeze({
  [ConfigurationType.ESCALERA_APOYADA]: Object.freeze([TaskType.ACCESO]),
  [ConfigurationType.ESCALERA_PLEGABLE]: Object.freeze([TaskType.ACCESO]),
  [ConfigurationType.TIJERA]: Object.freeze([TaskType.ACCESO]),
  [ConfigurationType.TIJERA_CON_EXTENSION]: Object.freeze([TaskType.ACCESO]),
  [ConfigurationType.AUTOPORTANTE]: Object.freeze([TaskType.ACCESO]),
  [ConfigurationType.MARCO_M]: Object.freeze([TaskType.ACCESO]),
  [ConfigurationType.MARCO_L]: Object.freeze([TaskType.ACCESO]),
  [ConfigurationType.PLATAFORMA]: Object.freeze([TaskType.TRABAJO_SOBRE_PLATAFORMA]),
  [ConfigurationType.ANDAMIO]: Object.freeze([TaskType.TRABAJO_SOBRE_PLATAFORMA]),
  [ConfigurationType.ANDAMIO_DESNIVEL]: Object.freeze([TaskType.TRABAJO_SOBRE_PLATAFORMA])
});

export const isTaskType = (valor: unknown): valor is TaskType => TASK_TYPES.includes(valor as TaskType);
export const isEnvironmentType = (valor: unknown): valor is EnvironmentType =>
  ENVIRONMENT_TYPES.includes(valor as EnvironmentType);
export const isConfigurationType = (valor: unknown): valor is ConfigurationType =>
  CONFIGURATION_TYPES.includes(valor as ConfigurationType);
