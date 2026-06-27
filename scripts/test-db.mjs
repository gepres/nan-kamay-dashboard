// Prueba rápida de la conexión a Supabase usando DATABASE_URL de .env.
//   npm run test:db
// Imprime si conecta y cuántas filas hay en nk_events / nk_bug_reports.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ Falta DATABASE_URL. ¿Copiaste .env.example a .env y lo editaste?');
  process.exit(1);
}

// Pista de diagnóstico: muestra host y usuario (sin la contraseña).
try {
  const u = new URL(url);
  console.log(`→ host: ${u.hostname}:${u.port || 5432}  usuario: ${u.username}`);
  if (u.hostname.startsWith('db.') && u.hostname.endsWith('.supabase.co')) {
    console.log('⚠️  Estás usando la conexión DIRECTA (db.<ref>.supabase.co). Suele fallar por IPv6.');
    console.log('   Usa el "Session pooler" (host aws-...pooler.supabase.com).');
  }
} catch {
  console.error('❌ DATABASE_URL no parece una URL válida. ¿La contraseña tiene @ : / # ? sin codificar?');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 10, max: 1 });

try {
  const [{ n: events }] = await sql`SELECT count(*)::int AS n FROM nk_events`;
  const [{ n: bugs }] = await sql`SELECT count(*)::int AS n FROM nk_bug_reports`;
  console.log(`✅ Conexión OK.  nk_events: ${events} filas · nk_bug_reports: ${bugs} filas.`);
} catch (e) {
  console.error('❌ Falló:', e.message);
  if (/ENOTFOUND/.test(e.message)) console.error('   → El host no resuelve: usa el Session pooler.');
  if (/password authentication/.test(e.message)) console.error('   → Usuario/clave: en el pooler el usuario es metabase_ro.<ref>.');
  if (/permission denied|does not exist/.test(e.message)) console.error('   → ¿Aplicaste schema.sql y el GRANT SELECT al rol?');
  process.exitCode = 1;
} finally {
  await sql.end();
}
