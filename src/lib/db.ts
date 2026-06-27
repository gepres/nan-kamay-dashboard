import postgres from 'postgres';

/**
 * Conexión Postgres a Supabase (solo lectura). El secreto vive en DATABASE_URL:
 * en `dev` lo toma de `.env` (import.meta.env); en producción del entorno del
 * proceso (process.env). Singleton para reutilizar el pool entre peticiones.
 */
const url =
  (typeof process !== 'undefined' ? process.env.DATABASE_URL : undefined) ??
  import.meta.env.DATABASE_URL;

type Sql = ReturnType<typeof postgres>;
let sql: Sql | null = null;

export function getSql(): Sql | null {
  if (!url) return null;
  if (!sql) {
    sql = postgres(url, {
      ssl: 'require',      // Supabase exige TLS
      prepare: false,      // compatible con el pooler de Supabase
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export function hasDb(): boolean {
  return Boolean(url);
}
