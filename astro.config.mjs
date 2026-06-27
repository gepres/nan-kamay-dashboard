// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Panel renderizado en el servidor (SSR): cada carga consulta Supabase en vivo.
// El adaptador `node` standalone permite `npm run build && npm start`.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { port: 4321, host: true },
  devToolbar: { enabled: false },
});
