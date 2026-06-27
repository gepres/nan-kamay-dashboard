import { getSql, hasDb } from './db';

/** Datos agregados para el panel. Todo viene de `nk_events` / `nk_bug_reports`. */
export interface DashboardData {
  connected: boolean;
  error: string | null;
  kpis: { totalEvents: number; activeUsers7d: number; eventsToday: number; openBugs: number };
  dau: { day: string; users: number }[];
  topScreens: { screen: string; views: number }[];
  funnel: { name: string; users: number }[];
  activities: { activity: string; count: number }[];
  regions: { region: string; downloads: number }[];
  features: { name: string; uses: number; users: number }[];
  bugsByCategory: { category: string; count: number }[];
  recentBugs: { created_at: string; category: string; app_version: string; platform: string; message: string }[];
}

function empty(error: string | null): DashboardData {
  return {
    connected: false,
    error,
    kpis: { totalEvents: 0, activeUsers7d: 0, eventsToday: 0, openBugs: 0 },
    dau: [], topScreens: [], funnel: [], activities: [], regions: [], features: [],
    bugsByCategory: [], recentBugs: [],
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
      kTotal, kUsers7d, kToday, kBugs,
      dau, topScreens, funnel, activities, regions, features, bugsByCategory, recentBugs,
    ] = await Promise.all([
      sql`SELECT count(*)::int AS n FROM nk_events`,
      sql`SELECT count(DISTINCT user_id)::int AS n FROM nk_events WHERE created_at > now() - interval '7 days'`,
      sql`SELECT count(*)::int AS n FROM nk_events WHERE created_at >= date_trunc('day', now())`,
      sql`SELECT count(*)::int AS n FROM nk_bug_reports WHERE status = 'open'`,

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
          WHERE name IN ('live_share_started','safety_share_prepared','planned_route_saved','route_exported','bug_report_submitted','offline_map_downloaded')
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
      },
      dau: dau as DashboardData['dau'],
      topScreens: topScreens as DashboardData['topScreens'],
      funnel: funnelOrdered,
      activities: activities as DashboardData['activities'],
      regions: regions as DashboardData['regions'],
      features: features as DashboardData['features'],
      bugsByCategory: bugsByCategory as DashboardData['bugsByCategory'],
      recentBugs: recentBugs as DashboardData['recentBugs'],
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
};
