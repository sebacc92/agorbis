import type { RequestHandler } from "@qwik.dev/router";

/**
 * Cabeceras de seguridad para toda respuesta del sitio.
 *
 * No había ninguna: la app se podía embeber en un `<iframe>` ajeno, que en una
 * plataforma donde se vota y se apoyan reclamos es el clickjacking de manual
 * —un botón invisible encima de "Apoyar"—, y cada enlace externo se llevaba la
 * URL completa de la página de origen en el `Referer`, incluido el id del
 * reclamo que se estaba leyendo.
 *
 * **El nombre del archivo importa.** Qwik Router ordena los `plugin@*` por
 * ruta alfabética (`walkServerPlugins`), así que `cabeceras` corre antes que
 * `i18n`. Tiene que ser así: `plugin@i18n.ts` puede cortar el request con un
 * `throw redirect(303, …)` al limpiar `?lang=`, y lo que se haya puesto
 * después de ese `throw` no llega a existir. Corriendo primero, hasta esa
 * redirección sale con cabeceras.
 */
export const onRequest: RequestHandler = ({ headers, url, env, sharedMap }) => {
  // Qwik Router pasa `@nonce` al renderer y éste se lo agrega también a sus
  // scripts SSR internos. Un valor nuevo por respuesta permite bloquear todo
  // script inline que no haya generado la aplicación.
  const nonce = crypto.randomUUID().replaceAll("-", "");
  sharedMap.set("@nonce", nonce);

  // No adivinar el tipo de un archivo por su contenido. Importa sobre todo en
  // lo que sube la gente: una imagen de evidencia servida desde el dominio no
  // puede terminar interpretada como HTML.
  headers.set("X-Content-Type-Options", "nosniff");

  // El destino externo se entera del origen, no de qué se estaba mirando. Un
  // enlace saliente desde `/reclamos/<id>` filtraba el id entero.
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Incluye documentos, q-data, acciones y redirecciones de los recorridos de
  // cuenta, aunque todavía no exista una sesión o Google esté deshabilitado.
  if (
    /^\/(?:registro|ingresar|recuperar|reenviar-confirmacion|auth|consentimiento|onboarding|perfil)(?:\/|$)/.test(
      url.pathname,
    )
  ) {
    headers.set("Cache-Control", "private, no-store");
    // Conserva Origin en POST de formularios propios para el check CSRF.
    // Los destinos externos no reciben Referer de estas pantallas.
    headers.set("Referrer-Policy", "same-origin");
  }

  // `frame-ancestors` de más abajo es la versión moderna y la que manda donde
  // se soporta; esto cubre a los navegadores que sólo entienden la vieja.
  headers.set("X-Frame-Options", "DENY");

  // Se niega por adelantado todo lo que la app no usa: si un día un script de
  // terceros lo intenta, el navegador ya dijo que no.
  //
  // Dos excepciones deliberadas. `clipboard-write`, que `ShareButton` necesita
  // cuando no hay `navigator.share`, ni siquiera se nombra. Y `geolocation` se
  // permite **sólo al propio origen** (`self`): el formulario de reclamo la
  // ofrece para marcar dónde está el problema. Sigue negada para cualquier
  // iframe de terceros, y el navegador igual pide permiso a la persona — esto
  // no lo saltea, sólo deja de bloquearlo antes de preguntar.
  headers.set(
    "Permissions-Policy",
    [
      "accelerometer=()",
      "camera=()",
      "display-capture=()",
      "geolocation=(self)",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  );

  // Sin popups de autenticación (el login es por redirección a
  // `/auth/callback`), así que aislar el grupo de navegación no rompe ningún
  // flujo y corta el acceso por `window.opener`.
  headers.set("Cross-Origin-Opener-Policy", "same-origin");

  let supabaseOrigin: string | null = null;
  try {
    const configured = new URL(env.get("PUBLIC_SUPABASE_URL") ?? "");
    if (["http:", "https:"].includes(configured.protocol)) {
      supabaseOrigin = configured.origin;
    }
  } catch {
    // La creación del cliente ya falla cerrado si falta la variable. La CSP no
    // debe abrir `https:` entero por una configuración inválida.
  }

  const policy = [
    "default-src 'self'",
    // `strict-dynamic` conserva la carga diferida de chunks que inicia Qwik a
    // partir de un script con nonce. En desarrollo, Vite inyecta su cliente y
    // handlers sin nonce y necesita eval para HMR; esa excepción existe sólo
    // en el bundle DEV. El preview/E2E y producción recorren la rama estricta.
    import.meta.env.DEV
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    "script-src-attr 'none'",
    // Qwik y Tailwind emiten varios estilos en atributos; retirarlo requeriría
    // primero reemplazar todos los style props por clases estáticas.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    `connect-src 'self' https://challenges.cloudflare.com${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "font-src 'self' data:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'none'",
    "frame-ancestors 'none'",
    // A se carga únicamente en los cinco formularios Auth. B no se renderiza:
    // su secreto vive en Supabase y protege las llamadas públicas directas.
    "frame-src https://challenges.cloudflare.com",
    "base-uri 'none'",
    // El acceso social envía un formulario nativo (`reloadDocument`) que
    // redirige a Supabase y de ahí a Google: `form-action` rige esa cadena.
    `form-action 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""} https://accounts.google.com`,
    "object-src 'none'",
  ];

  if (url.protocol === "https:") {
    // Sólo bajo https: en `http://localhost` no hay nada que actualizar y HSTS
    // sobre el dominio de desarrollo se queda cacheado en el navegador.
    policy.push("upgrade-insecure-requests");
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  headers.set("Content-Security-Policy", policy.join("; "));
};
