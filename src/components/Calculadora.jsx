import { useMemo, useState } from 'react';
import { productosEscaleras } from '../data/productos.js';
import GaleriaProducto from './GaleriaProducto.jsx';

const AFILIADO = 'jars4u2-21';
const FACTOR_INCLINACION = 1.035;
const SOBREPASO_SEGURIDAD = 1.0;

const TIPOS_TRABAJO = [
  { valor: 'interior', titulo: 'Interior', descripcion: 'Techos, lámparas, trasteros', icono: '⌂' },
  { valor: 'fachada', titulo: 'Fachada', descripcion: 'Pintar, ventanas, paredes', icono: '□' },
  { valor: 'tejado', titulo: 'Tejado', descripcion: 'Canalones, cubiertas, podas', icono: '⌁' }
];

const LIMITE_MAXIMO = Math.max(...productosEscaleras.map((producto) => producto.limite));
const PRODUCTOS_MAS_LARGOS = productosEscaleras.filter((producto) => producto.limite === LIMITE_MAXIMO);
const construirUrlAfiliado = (asin) => `https://www.amazon.es/dp/${asin}?tag=${AFILIADO}`;

export default function Calculadora() {
  const [altura, setAltura] = useState(3.5);
  const [trabajo, setTrabajo] = useState('interior');

  const { longitudMinima, sobrepasoAplicado, producto, fueraDeRango } = useMemo(() => {
    const necesitaSobrepaso = trabajo === 'fachada' || trabajo === 'tejado';
    const longitud = altura * FACTOR_INCLINACION + (necesitaSobrepaso ? SOBREPASO_SEGURIDAD : 0);
    const productosSuficientes = [...productosEscaleras]
      .sort((productoA, productoB) => productoA.limite - productoB.limite)
      .filter((item) => item.limite >= longitud);
    const encontrado = productosSuficientes[0];
    const empateDeLimite = productosSuficientes.filter((item) => item.limite === encontrado?.limite);
    const recomendado = empateDeLimite.length > 1
      ? empateDeLimite[trabajo === 'interior' ? 0 : empateDeLimite.length - 1]
      : encontrado ?? PRODUCTOS_MAS_LARGOS[trabajo === 'interior' ? 0 : PRODUCTOS_MAS_LARGOS.length - 1];

    return { longitudMinima: longitud, sobrepasoAplicado: necesitaSobrepaso, producto: recomendado, fueraDeRango: !encontrado };
  }, [altura, trabajo]);

  return (
    <section className="mx-auto max-w-7xl px-5 lg:px-10">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:gap-10">
        <div className="rounded-4xl bg-slate-50 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold tracking-[0.18em] text-orange-600 uppercase">Tu recomendación</p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.04em] text-slate-950 sm:text-3xl">Diseñada para tu altura</h2>
            </div>
            <span className="rounded-full bg-white px-3 py-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase shadow-sm">75° seguro</span>
          </div>
          <ul className="mt-6 grid gap-3 border-y border-slate-200 py-5 text-sm font-semibold text-slate-700 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-600" aria-hidden="true">✓</span>Medida exacta para tu proyecto</li>
            <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-600" aria-hidden="true">✓</span>Modelos con norma EN131</li>
            <li className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-extrabold text-orange-600" aria-hidden="true">✓</span>Compra sin acertijos</li>
          </ul>

          <div className="mt-10">
            <div className="flex items-end justify-between gap-4">
              <label htmlFor="altura" className="text-sm font-bold text-slate-800">¿A qué altura necesitas llegar?</label>
              <span className="text-3xl font-extrabold tabular-nums tracking-tighter text-orange-500">{altura.toFixed(1)} <small className="text-base font-bold">m</small></span>
            </div>
            <input id="altura" type="range" min="2" max="6.5" step="0.1" value={altura} onChange={(evento) => setAltura(Number(evento.target.value))} className="mt-6 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-orange-500" />
            <div className="mt-2 flex justify-between text-[11px] font-bold text-slate-400"><span>2.0 m</span><span>6.5 m</span></div>
          </div>

          <div className="mt-9">
            <span className="text-sm font-bold text-slate-800">¿Qué tipo de trabajo vas a hacer?</span>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {TIPOS_TRABAJO.map((opcion) => {
                const activo = trabajo === opcion.valor;
                return (
                  <button key={opcion.valor} type="button" onClick={() => setTrabajo(opcion.valor)} aria-pressed={activo} className={`rounded-2xl border p-4 text-left transition ${activo ? 'border-orange-500 bg-white shadow-md shadow-orange-500/10' : 'border-transparent bg-white/60 hover:border-slate-200 hover:bg-white'}`}>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold ${activo ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">{opcion.icono}</span>
                    <span className={`mt-3 block text-sm font-extrabold ${activo ? 'text-slate-950' : 'text-slate-700'}`}>{opcion.titulo}</span>
                    <span className="mt-1 block text-[11px] leading-snug text-slate-500">{opcion.descripcion}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-slate-500 uppercase">Longitud mínima necesaria</p>
                <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-[-0.06em] text-slate-950">{longitudMinima.toFixed(2)} <small className="text-lg">m</small></p>
              </div>
              <span className="text-right text-xs leading-relaxed text-slate-500">Inclinación<br />recomendada</span>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">{altura.toFixed(1)} m × {FACTOR_INCLINACION}{sobrepasoAplicado ? ` + ${SOBREPASO_SEGURIDAD.toFixed(1)} m de sobrepaso de seguridad.` : ' para trabajar con firmeza.'}</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-4xl bg-slate-100 shadow-2xl shadow-slate-300/50">
          <div className="pointer-events-none absolute left-2 top-2 z-10 -rotate-6 rounded-md border border-white bg-orange-500 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-md sm:left-3 sm:top-3">{producto.badge}</div>
          <GaleriaProducto key={producto.id} imagenes={producto.imagenes} alt={producto.nombre} />
          <div className="border-t border-slate-200 bg-white px-5 py-5 transition-all duration-300 sm:px-6">
            <p className="text-[10px] font-extrabold tracking-[0.16em] text-orange-600 uppercase">Recomendación actualizada</p>
            <h2 className="mt-2 text-lg font-extrabold leading-tight tracking-[-0.03em] text-slate-950">{producto.nombre}</h2>
            <div className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-2xl font-extrabold tracking-[-0.04em] text-slate-950">{producto.precio}</span>
              <span className="text-xs font-semibold text-slate-500">Hasta {producto.limite.toFixed(1)} m</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-4xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] sm:p-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <div>
            <p className="text-xs font-extrabold tracking-[0.18em] text-orange-600 uppercase">La elección LadderLand</p>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-slate-600">{producto.tag}</p>
            <div className="mt-8 flex items-end gap-3"><span className="text-5xl font-extrabold tracking-[-0.06em] text-slate-950">{producto.precio}</span><span className="pb-1 text-xs text-slate-500">precio orientativo<br />en Amazon</span></div>
            <a href={construirUrlAfiliado(producto.asin)} target="_blank" rel="noopener noreferrer" className="mt-8 block w-full rounded-xl bg-[#ff9900] px-6 py-5 text-center text-base font-extrabold text-white shadow-xl shadow-orange-500/20 transition hover:bg-[#e88700] focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:outline-none">Comprar en Amazon <span aria-hidden="true">→</span></a>
            <p className="mt-3 text-center text-[11px] text-slate-400">Enlace de afiliado. El precio final lo fija Amazon.</p>
          </div>

          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-4"><h3 className="text-sm font-extrabold tracking-[0.12em] text-slate-950 uppercase">Ficha técnica</h3><span className="text-xs font-bold text-slate-400">EN131 · 150 kg</span></div>
            <dl className="divide-y divide-slate-100">
              {producto.caracteristicas.map((caracteristica) => <div key={caracteristica.etiqueta} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 py-4 text-sm"><dt className="font-medium text-slate-500">{caracteristica.etiqueta}</dt><dd className="font-bold text-slate-900">{caracteristica.valor}</dd></div>)}
            </dl>
            {fueraDeRango && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">Necesitas {longitudMinima.toFixed(2)} m y el modelo más largo alcanza {LIMITE_MAXIMO.toFixed(1)} m. Valora medios de elevación profesionales.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}