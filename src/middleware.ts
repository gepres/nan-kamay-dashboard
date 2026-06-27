import { defineMiddleware } from 'astro:middleware';

/**
 * Basic Auth opcional. Si DASH_USER y DASH_PASS están definidos, exige
 * credenciales; si no, deja pasar (modo local). El panel muestra datos de uso
 * de todos los usuarios, así que protégelo si lo expones fuera de tu máquina.
 */
const user =
  (typeof process !== 'undefined' ? process.env.DASH_USER : undefined) ?? import.meta.env.DASH_USER;
const pass =
  (typeof process !== 'undefined' ? process.env.DASH_PASS : undefined) ?? import.meta.env.DASH_PASS;

export const onRequest = defineMiddleware(async (context, next) => {
  if (!user || !pass) return next(); // auth deshabilitada

  const header = context.request.headers.get('authorization');
  const expected = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  if (header !== expected) {
    return new Response('Autenticación requerida', {
      status: 401,
      // OJO: el valor de una cabecera HTTP solo admite bytes Latin-1 (0–255);
      // nada de "—"/emojis aquí. El realm va en ASCII puro.
      headers: { 'WWW-Authenticate': 'Basic realm="Nan Kamay Panel"' },
    });
  }
  return next();
});
