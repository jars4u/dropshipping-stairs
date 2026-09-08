/**
 * Comprobación de enlaces de afiliado previa al build.
 *
 * Recorre el array de productos y hace una petición a la ficha de cada ASIN en
 * Amazon España. Un 404 significa que el listado ha desaparecido: eso rompe el
 * build. Cualquier otro resultado (bloqueo antibot, red caída, timeout) se
 * reporta como aviso pero NO detiene la compilación, porque no demuestra que el
 * enlace esté roto y dejaría el despliegue a merced del rate limiting de Amazon.
 */

import { productosEscaleras } from '../src/data/productos.js';

// Verificación TLS obligatoria. Si el entorno que lanza el build trae
// NODE_TLS_REJECT_UNAUTHORIZED=0 (proxies corporativos, imágenes de CI mal
// configuradas), Node aceptaría certificados inválidos en silencio. Node lee esta
// variable en el momento de abrir el socket, así que borrarla aquí restaura la
// verificación estándar para todas las peticiones de este script.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  console.warn(
    '\nAviso: se ha ignorado NODE_TLS_REJECT_UNAUTHORIZED=0 heredada del entorno.\n' +
      'Las comprobaciones se harán verificando el certificado TLS.'
  );
}

const AFILIADO = 'jars4u2-21';
const TIMEOUT_MS = 15000;
const REINTENTOS_404 = 2;
const ESPERA_REINTENTO_MS = 2000;

// User-Agent de navegador estándar: Amazon rechaza de plano los clientes sin él.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const CABECERAS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9'
};

const urlProducto = (asin) => `https://www.amazon.es/dp/${asin}?tag=${AFILIADO}`;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pedir(url) {
  try {
    const respuesta = await fetch(url, {
      headers: CABECERAS,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    return { codigo: respuesta.status };
  } catch (error) {
    return {
      codigo: null,
      motivo: error.name === 'TimeoutError' ? `timeout tras ${TIMEOUT_MS} ms` : error.message
    };
  }
}

async function comprobarProducto(producto) {
  const url = urlProducto(producto.asin);

  // Amazon devuelve 404 de forma intermitente a peticiones automatizadas, incluso
  // sobre fichas que existen. Solo damos un enlace por roto si el 404 se repite.
  let resultado = await pedir(url);

  for (let intento = 1; intento <= REINTENTOS_404 && resultado.codigo === 404; intento++) {
    await esperar(ESPERA_REINTENTO_MS * intento);
    resultado = await pedir(url);
  }

  if (resultado.codigo === 404) {
    return { producto, url, estado: 'roto', codigo: 404 };
  }

  if (resultado.codigo && resultado.codigo >= 200 && resultado.codigo < 300) {
    return { producto, url, estado: 'ok', codigo: resultado.codigo };
  }

  return {
    producto,
    url,
    estado: 'indeterminado',
    codigo: resultado.codigo,
    motivo: resultado.motivo
  };
}

async function main() {
  console.log(`\nComprobando ${productosEscaleras.length} enlaces de afiliado en Amazon.es...\n`);

  const resultados = await Promise.all(productosEscaleras.map(comprobarProducto));

  for (const r of resultados) {
    const etiqueta = `[ID ${r.producto.id}] ${r.producto.asin}`;

    if (r.estado === 'ok') {
      console.log(`  OK       ${etiqueta} -> HTTP ${r.codigo}`);
    } else if (r.estado === 'roto') {
      console.error(`  ROTO     ${etiqueta} -> HTTP 404 (listado no disponible)`);
      console.error(`           ${r.url}`);
    } else {
      const detalle = r.codigo ? `HTTP ${r.codigo}` : r.motivo;
      console.warn(`  AVISO    ${etiqueta} -> ${detalle} (no verificable, no bloquea el build)`);
    }
  }

  const rotos = resultados.filter((r) => r.estado === 'roto');
  const avisos = resultados.filter((r) => r.estado === 'indeterminado');

  console.log('');

  if (rotos.length > 0) {
    console.error(
      `Build detenido: ${rotos.length} enlace(s) de afiliado devuelven 404. ` +
        `Actualiza el ASIN en src/data/productos.js antes de desplegar.\n`
    );
    process.exit(1);
  }

  if (avisos.length > 0) {
    console.warn(
      `${avisos.length} enlace(s) no se han podido verificar (Amazon suele bloquear ` +
        `peticiones automatizadas). Compruébalos manualmente si hace tiempo que no los revisas.\n`
    );
  } else {
    console.log('Todos los enlaces de afiliado responden correctamente.\n');
  }
}

main().catch((error) => {
  console.error('\nError inesperado al comprobar los enlaces:', error);
  process.exit(1);
});
