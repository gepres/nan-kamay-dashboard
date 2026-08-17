import { getSql, hasDb } from './db';

/** Datos agregados para el panel. Todo viene de `nk_events` / `nk_bug_reports`. */
export interface DashboardData {
  connected: boolean;
  error: string | null;
  kpis: { totalEvents: number; activeUsers7d: number; eventsToday: number; openBugs: number; syncFailures7d: number };
  dau: { day: string; users: number }[];
  topScreens: { screen: string; views: number }[];
  funnel: { name: string; users: number }[];
  activities: { activity: string; count: number }[];
  regions: { region: string; downloads: number }[];
  features: { name: string; uses: number; users: number }[];
  bugsByCategory: { category: string; count: number }[];
  recentBugs: { created_at: string; category: string; app_version: string; platform: string; message: string }[];
  /** Prueba cerrada de Play: quién se apuntó y hace cuántos días (KA-16). */
  testers: { email: string; name: string | null; status: string; dias: number; created_at: string }[];
}

function empty(error: string | null): DashboardData {
  return {
    connected: false,
    error,
    kpis: { totalEvents: 0, activeUsers7d: 0, eventsToday: 0, openBugs: 0, syncFailures7d: 0 },
    dau: [], topScreens: [], funnel: [], activities: [], regions: [], features: [],
    bugsByCategory: [], recentBugs: [], testers: [],
  };
}

/** Orden y etiqueta legible del embudo de grabación. */
const FUNNEL_STEPS = ['recording_started', 'route_saved', 'route_exported'] as const;

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasDb()) return empty('Falta DATABASE_URL. Copia .env.example a .env y configúralo.');
  const sql = getSql();
  if (!sql) return empty('No se pudo inicializar la conexión a la base de datos.');

  try {
    const [
      kTotal, kUsers7d, kToday, kBugs, kSyncFail,
      dau, topScreens, funnel, activities, regions, features, bugsByCategory, recentBugs,
    ] = await Promise.all([
      sql`SELECT count(*)::int AS n FROM nk_events`,
      sql`SELECT count(DISTINCT user_id)::int AS n FROM nk_events WHERE created_at > now() - interval '7 days'`,
      sql`SELECT count(*)::int AS n FROM nk_events WHERE created_at >= date_trunc('day', now())`,
      sql`SELECT count(*)::int AS n FROM nk_bug_reports WHERE status = 'open'`,

      // Fallos de sincronización: lo primero que hay que mirar durante la beta,
      // porque son problemas que el usuario casi nunca reporta.
      sql`SELECT count(*)::int AS n FROM nk_events
          WHERE name IN ('sync_failed','sync_integrity_mismatch')
            AND created_at > now() - interval '7 days'`,

      sql`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(DISTINCT user_id)::int AS users
          FROM nk_events
          WHERE created_at > now() - interval '30 days'
          GROUP BY 1 ORDER BY 1`,

      sql`SELECT coalesce(screen, '(desconocido)') AS screen, count(*)::int AS views
          FROM nk_events
          WHERE name = 'screen_view' AND created_at > now() - interval '30 days'
          GROUP BY 1 ORDER BY views DESC LIMIT 12`,

      sql`SELECT name, count(DISTINCT user_id)::int AS users
          FROM nk_events
          WHERE name IN ('recording_started','route_saved','route_exported')
          GROUP BY name`,

      sql`SELECT coalesce(props->>'activity', '(sin tipo)') AS activity, count(*)::int AS count
          FROM nk_events
          WHERE name = 'recording_started'
          GROUP BY 1 ORDER BY count DESC`,

      sql`SELECT coalesce(props->>'region', '(?)') AS region, count(*)::int AS downloads
          FROM nk_events
          WHERE name = 'offline_map_downloaded'
          GROUP BY 1 ORDER BY downloads DESC LIMIT 12`,

      sql`SELECT name, count(*)::int AS uses, count(DISTINCT user_id)::int AS users
          FROM nk_events
          WHERE name IN ('live_share_started','safety_share_prepared','planned_route_saved','route_exported','bug_report_submitted','offline_map_downloaded','track_edited','replay_played','postcard_shared','public_route_opened','waypoint_added')
          GROUP BY name ORDER BY uses DESC`,

      sql`SELECT coalesce(category, '(sin categoría)') AS category, count(*)::int AS count
          FROM nk_bug_reports
          GROUP BY 1 ORDER BY count DESC`,

      sql`SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
                 coalesce(category, '(sin)') AS category,
                 coalesce(app_version, '?') AS app_version,
                 coalesce(platform, '?') AS platform,
                 message
          FROM nk_bug_reports
          ORDER BY created_at DESC LIMIT 15`,
    ]);

    // Testers aparte y tolerante a fallo: si a `nk_testers` le falta el GRANT o
    // la política de SELECT (KA-19), esta consulta lanza — y dentro del
    // Promise.all se llevaría por delante TODO el panel. Degradar a lista vacía.
    let testers: DashboardData['testers'] = [];
    try {
      testers = (await sql`
        SELECT email,
               name,
               status,
               EXTRACT(day FROM now() - created_at)::int AS dias,
               to_char(created_at, 'YYYY-MM-DD') AS created_at
        FROM nk_testers
        WHERE status <> 'baja'
        ORDER BY created_at
      `) as DashboardData['testers'];
    } catch (e) {
      console.warn('[dashboard] no se pudo leer nk_testers:', e instanceof Error ? e.message : e);
    }

    // Reordena el embudo a record → save → export, rellenando con 0 los ausentes.
    const funnelMap = new Map(funnel.map((r) => [r.name as string, r.users as number]));
    const funnelOrdered = FUNNEL_STEPS.map((name) => ({ name, users: funnelMap.get(name) ?? 0 }));

    return {
      connected: true,
      error: null,
      kpis: {
        totalEvents: kTotal[0]?.n ?? 0,
        activeUsers7d: kUsers7d[0]?.n ?? 0,
        eventsToday: kToday[0]?.n ?? 0,
        openBugs: kBugs[0]?.n ?? 0,
        syncFailures7d: kSyncFail[0]?.n ?? 0,
      },
      dau: dau as DashboardData['dau'],
      topScreens: topScreens as DashboardData['topScreens'],
      funnel: funnelOrdered,
      activities: activities as DashboardData['activities'],
      regions: regions as DashboardData['regions'],
      features: features as DashboardData['features'],
      bugsByCategory: bugsByCategory as DashboardData['bugsByCategory'],
      recentBugs: recentBugs as DashboardData['recentBugs'],
      testers,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido consultando la base de datos.';
    return empty(msg);
  }
}

/** Etiquetas legibles en español para los nombres internos de evento. */
export const EVENT_LABELS: Record<string, string> = {
  recording_started: 'Inició grabación',
  route_saved: 'Guardó ruta',
  route_exported: 'Exportó ruta',
  live_share_started: 'Compartió en vivo',
  safety_share_prepared: 'Seguridad (check-in/SOS)',
  planned_route_saved: 'Guardó plan',
  bug_report_submitted: 'Reportó bug',
  offline_map_downloaded: 'Descargó mapa offline',
  screen_view: 'Vista de pantalla',
  // Añadidos 2026-08: funciones que existían sin medir + los primeros eventos
  // de fallo (antes un problema solo se veía si el usuario lo reportaba a mano).
  track_edited: 'Editó el trazado',
  replay_played: 'Vio el replay',
  postcard_shared: 'Compartió postal',
  waypoint_added: 'Añadió waypoint',
  public_route_opened: 'Abrió ruta pública',
  sync_completed: 'Sincronizó',
  sync_failed: 'Falló la sincronización',
  sync_integrity_mismatch: 'Descuadre de puntos al sincronizar',
};
