# Ñan Kamay — Panel de uso (dashboard)

Panel web (Astro SSR) para leer la **analítica in-house** de la app Ñan Kamay desde Supabase
(`nk_events` y `nk_bug_reports`). Muestra flujos más usados, usuarios activos, embudos, adopción de
funciones y reportes de bug — **con datos propios, sin Google/Firebase**.

> Es el complemento del documento `docs/ANALYTICS.md` del repo de la app. Mismo origen de datos
> (no graba GPS ni PII; las pantallas se registran como patrón de segmento).

---

## Requisitos previos

1. **Aplicar `supabase/schema.sql`** del repo de la app (crea `nk_events`, `nk_bug_reports`, etc.).
2. **Rol Postgres de SOLO-LECTURA** en Supabase (no uses el `service_role` ni el owner). En el
   **SQL Editor** de Supabase:

   ```sql
   CREATE ROLE metabase_ro LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE';
   GRANT USAGE ON SCHEMA public TO metabase_ro;
   GRANT SELECT ON public.nk_events, public.nk_bug_reports TO metabase_ro;
   -- opcional, para cruzar con rutas:
   -- GRANT SELECT ON public.nk_routes TO metabase_ro;
   ```

   > El rol salta la RLS al hacer `SELECT` (la RLS solo limitaba a la app a *insertar* lo suyo).
   > Concede únicamente `SELECT`.

3. **Node 18+** (probado con Node 24).

---

## Configuración

```bash
cp .env.example .env
```

Edita `.env`. **Usa el "Session pooler"** (Supabase → botón **Connect** → pestaña *Session pooler*),
NO la conexión directa: la directa (`db.<ref>.supabase.co`) suele fallar con `ENOTFOUND` (IPv6-only).

```env
# Session pooler. OJO: el usuario lleva el ref → metabase_ro.<ref> (obligatorio en el pooler).
# El host/región (aws-0-... o aws-1-...) cópialo tal cual de tu dashboard.
DATABASE_URL=postgresql://metabase_ro.xyemkrcqpbqpaujifjpp:TU_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres

# Opcional: protege el panel con Basic Auth (recomendado si no es solo localhost).
# El valor del realm es ASCII; no metas tildes/emojis en cabeceras.
DASH_USER=admin
DASH_PASS=una-clave-larga
```

> Clave del rol: usa **solo letras y números** — si lleva `@ : / # ?` rompe la URL de conexión.

---

## Ejecutar

**Desarrollo** (recarga en caliente, lee `.env`):

```bash
npm install
npm run test:db   # valida la conexión e imprime el conteo de filas (diagnostica errores comunes)
npm run dev
# http://localhost:4321
```

**Producción** (build + servidor Node standalone):

```bash
npm run build
# define DATABASE_URL (y DASH_USER/DASH_PASS) en el entorno del proceso:
#   Windows PowerShell:  $env:DATABASE_URL="postgresql://..."; npm start
#   bash:                DATABASE_URL="postgresql://..." npm start
npm start
# http://localhost:4321
```

---

## Qué muestra

| Sección | Fuente |
|---------|--------|
| KPIs: eventos totales · usuarios activos 7d · eventos hoy · bugs abiertos | `nk_events`, `nk_bug_reports` |
| Usuarios activos por día (30d) | `screen_view` y demás, `DISTINCT user_id` |
| Pantallas más usadas | `name = 'screen_view'` por `screen` (patrón de segmento) |
| Embudo grabar → guardar → exportar | `recording_started` / `route_saved` / `route_exported` |
| Tipos de actividad | `props->>'activity'` de `recording_started` |
| Zonas offline más descargadas | `props->>'region'` de `offline_map_downloaded` |
| Adopción de funciones | live share · seguridad · planificador · export · bug |
| Bugs por categoría + tabla de recientes | `nk_bug_reports` |

Para añadir paneles, edita las consultas en `src/lib/queries.ts` y agrégalos en
`src/pages/index.astro` con el componente `<Chart>`.

---

## Privacidad

El panel **solo lee** agregados. Ningún evento contiene coordenadas ni PII (lo garantiza el cliente
de la app). Las capturas de bug viven en el bucket **privado** `nk-bug-shots`; este panel muestra el
texto del reporte, no la imagen (ábrela desde la consola de Supabase).

---

## Stack

Astro 5 (SSR, adaptador Node) · `postgres` (porsager) · Chart.js 4 · CSS con los tokens del app
(verde bosque + ámbar).
