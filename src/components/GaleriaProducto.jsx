import { useEffect, useRef, useState } from 'react';

export default function GaleriaProducto({ imagenes = [], alt = 'Imagen del producto' }) {
  const [imagenSeleccionada, setImagenSeleccionada] = useState(imagenes[0] ?? '');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cargandoImagen, setCargandoImagen] = useState(true);
  const imagenPrincipal = useRef(null);

  useEffect(() => {
    setImagenSeleccionada(imagenes[0] ?? '');
    setModalAbierto(false);
  }, [imagenes]);

  useEffect(() => {
    // Cada cambio de imagen vuelve a mostrar el esqueleto, salvo que el
    // navegador ya la tenga en caché: entonces `complete` es true antes de que
    // React llegue a enganchar el onLoad y no habría evento que esperar.
    setCargandoImagen(!imagenPrincipal.current?.complete);
  }, [imagenSeleccionada]);

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
          className="relative flex aspect-4/3 w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-none border-0 bg-white focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 focus:outline-none"
          aria-label="Ampliar imagen del producto"
        >
          {cargandoImagen && <span className="ll-barrido absolute inset-0 overflow-hidden bg-slate-100" aria-hidden="true" />}
          <img
            ref={imagenPrincipal}
            src={imagenSeleccionada}
            alt={alt}
            decoding="async"
            onLoad={() => setCargandoImagen(false)}
            onError={() => setCargandoImagen(false)}
            className={`h-full w-full object-contain transition-opacity duration-300 ${cargandoImagen ? 'opacity-0' : 'opacity-100'}`}
          />
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
              <img src={imagen} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
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
