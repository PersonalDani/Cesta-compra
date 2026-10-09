# Mi Cesta

Lista de la compra con los catálogos de **Dia** y **Ahorramas**: productos por secciones con foto y precio, botón Añadir, subtotal, cesta por supermercado, cestas guardadas y cesta compartida por enlace (por ejemplo, con tu madre).

## Cómo está montada

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| App (PWA) | `index.html`, `styles.css`, `app.js`, `sw.js` | Se publica en GitHub Pages y se instala en el móvil |
| Catálogos | `data/dia.json`, `data/ahorramas.json` | Productos, precios, ofertas y ruta de la foto |
| Fotos | Webs de Dia y Ahorramas | Se cargan directamente desde ellas; no se copian al repo |
| Cesta compartida | Supabase (tabla `cestas`) | Cesta y cestas guardadas, accesibles solo con el código del enlace |
| Precios | `.github/workflows/actualizar-precios.yml` | El día 1 de cada mes lee las webs y actualiza los JSON |
| Keepalive | `.github/workflows/keepalive.yml` | Lunes y jueves llama a Supabase para que no se pause |

## Puesta en marcha

1. **Supabase**: ejecuta `supabase/schema.sql` en *SQL Editor* (ya hecho). La URL y la clave *publishable* están en `config.js`.
2. **Repositorio**: `PersonalDani/Cesta-compra`, con todo el contenido de esta carpeta, incluida la carpeta oculta `.github`.
3. **GitHub Pages**: *Settings → Pages → Build and deployment → Deploy from a branch →* rama `main`, carpeta `/ (root)`.
4. **Permisos de las Actions**: *Settings → Actions → General → Workflow permissions →* **Read and write permissions**.
5. **Keepalive**: no necesita secrets; lee la URL y la clave *publishable* de `config.js`.
6. **Primera actualización de precios**: *Actions → Actualizar precios → Run workflow*. Tarda alrededor de una hora y además rellena las fotos de Ahorramas, que en el catálogo inicial todavía no están.

## Actualizar precios a mano

Desde tu ordenador, con Node 20 o superior:

```
npm install
npm run precios
```

Para un solo supermercado: `node scripts/scrape.mjs dia` o `node scripts/scrape.mjs ahorramas`. Después haz commit y push de `data/`.

Si una actualización trae menos del 60 % de los productos que había, el script no sobrescribe ese catálogo y la Action termina en rojo (GitHub te avisa por email).

## Compartir la cesta

Toca el indicador «Cesta compartida» arriba a la derecha. Desde ahí puedes copiar el enlace o enviarlo por WhatsApp. Quien lo abra ve y edita la misma cesta y las mismas cestas guardadas, y lo que marque uno lo ve el otro en unos segundos. «Crear enlace nuevo» deja de compartir con quien tenga el anterior.

## Limitaciones

- Precios de las tiendas online (Dia, con el código postal por defecto de Madrid). En tienda física pueden variar.
- Las ofertas solo para Club Dia van marcadas como «Club» y se descuentan en el subtotal.
- Si Dia o Ahorramas bloquean las lecturas desde los servidores de GitHub, la Action fallará. En ese caso, usa `npm run precios` desde tu ordenador.
- GitHub desactiva las tareas programadas de un repo público tras 60 días sin actividad. Los commits mensuales de precios cuentan como actividad.
- Mercadona no está incluido; sus productos se añaden a mano desde la pestaña Cesta.
