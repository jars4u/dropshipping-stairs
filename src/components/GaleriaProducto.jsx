import { useEffect, useState } from 'react';

export default function GaleriaProducto({ imagenes = [], alt = 'Imagen del producto' }) {
  const [imagenSeleccionada, setImagenSeleccionada] = useState(imagenes[0] ?? '');
  const [modalAbierto, setModalAbierto] = useState(false);

  useEffect(() => {
    setImagenSeleccionada(imagenes[0] ?? '');
    setModalAbierto(false);
  }, [imagenes]);

  useEffect(() => {
    if (!modalAbierto) return undefined;

    const cerrarConEscape = (evento) => {
      if (evento.key === 'Escape') setModalAbierto(false);
    };

    document.addEventListener('keydown', cerrarConEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', cerrarConEscape);
      document.body.style.overflow = '';
    };
  }, [modalAbierto]);

  if (!imagenes.length) {
    return <div className="flex h-96 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">Imagen no disponible</div>;
  }

  return (
    <>
      <div className="w-full">
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="flex h-[28rem] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-none border-0 bg-white focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:outline-none sm:h-[32rem]"
          aria-label="Ampliar imagen del producto"
        >
          <img src={imagenSeleccionada} alt={alt} className="h-full w-full object-cover" />
        </button>

        <div className="mt-4 flex gap-3 overflow-x-auto pb-2" aria-label="Galería de imágenes del producto">
          {imagenes.map((imagen, indice) => (
            <button
              key={imagen}
              type="button"
              onMouseEnter={() => setImagenSeleccionada(imagen)}
              onFocus={() => setImagenSeleccionada(imagen)}
              onClick={() => setImagenSeleccionada(imagen)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white ${imagen === imagenSeleccionada ? 'border-2 border-orange-500' : 'border border-slate-200 hover:border-slate-400'}`}
              aria-label={`Ver imagen ${indice + 1}`}
              aria-pressed={imagen === imagenSeleccionada}
            >
              <img src={imagen} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Imagen ampliada del producto"
          onClick={() => setModalAbierto(false)}
        >
          <button
            type="button"
            onClick={() => setModalAbierto(false)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl font-medium text-slate-900 shadow-lg transition hover:bg-slate-100 focus:ring-2 focus:ring-orange-400 focus:outline-none"
            aria-label="Cerrar imagen ampliada"
          >
            <span aria-hidden="true">×</span>
          </button>
          <img
            src={imagenSeleccionada}
            alt={alt}
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(evento) => evento.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
