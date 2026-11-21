#!/usr/bin/env node

const origin =
  process.env.AGORBIS_SMOKE_ORIGIN?.trim() || "https://agorbis.com";
const parsedOrigin = new URL(origin);
if (
  parsedOrigin.protocol !== "https:" ||
  parsedOrigin.pathname !== "/" ||
  parsedOrigin.search ||
  parsedOrigin.hash ||
  parsedOrigin.username ||
  parsedOrigin.password
) {
  throw new Error("AGORBIS_SMOKE_ORIGIN debe ser un origen HTTPS sin ruta.");
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(pathname, init = {}) {
  const response = await fetch(new URL(pathname, parsedOrigin), {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  invariant(bytes.byteLength <= MAX_BODY_BYTES, `${pathname} excede 3 MiB.`);
  return {
    response,
    text: new TextDecoder().decode(bytes),
  };
}

function assertReadOnlyHeaders(response, label, { html = false } = {}) {
  invariant(
    response.headers.get("x-agorbis-launch-mode") === "public-read-only",
    `${label} no acredita el modo public-read-only.`,
  );
  invariant(
    response.headers.get("cache-control") === "private, no-store",
    `${label} no usa Cache-Control private, no-store.`,
  );
  invariant(
    response.headers.get("set-cookie") === null,
    `${label} intentó crear una cookie.`,
  );
  if (!html) return;
  const csp = response.headers.get("content-security-policy") ?? "";
  invariant(
    /(?:^|;)\s*form-action 'none'(?:;|$)/i.test(csp),
    `${label} permite formularios en CSP.`,
  );
  invariant(
    /(?:^|;)\s*connect-src 'self'(?:;|$)/i.test(csp),
    `${label} permite conexiones de navegador ajenas al origen.`,
  );
  invariant(
    /(?:^|;)\s*frame-src 'none'(?:;|$)/i.test(csp),
    `${label} permite frames.`,
  );
  invariant(
    !csp.includes("challenges.cloudflare.com"),
    `${label} todavía permite cargar Turnstile.`,
  );
}

const allowedPages = [
  "/",
  "/explorar/",
  "/manual/",
  "/privacidad",
  "/eliminar-datos/",
  "/terminos",
  "/normas-comunitarias",
  "/moderacion-y-apelaciones",
  "/subencargados",
  "/transferencias-internacionales",
];

for (const pathname of allowedPages) {
  const { response, text } = await request(pathname);
  invariant(
    response.status === 200,
    `${pathname} devolvió HTTP ${response.status}.`,
  );
  invariant(
    response.headers.get("content-type")?.includes("text/html"),
    `${pathname} no devolvió HTML.`,
  );
  assertReadOnlyHeaders(response, pathname, { html: true });
  invariant(
    !/(?:sb_secret_|eyJhbGciOi|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(text),
    `${pathname} contiene un formato secreto conocido.`,
  );
  if (pathname === "/") {
    invariant(
      text.includes("sólo lectura"),
      "La portada no informa el estado read-only.",
    );
    invariant(
      text.includes('data-agorbis-launch-mode="public-read-only"'),
      "La portada no marca el DOM como public-read-only.",
    );
    const cssPaths = [
      ...text.matchAll(/href="([^" ]+\.css(?:\?[^" ]*)?)"/g),
    ].map((match) => match[1]);
    invariant(
      cssPaths.length > 0,
      "La portada no enlaza la hoja de estilos del preview.",
    );
    let css = "";
    for (const cssPath of cssPaths) {
      const asset = await request(cssPath);
      invariant(
        asset.response.status === 200,
        `${cssPath} devolvió ${asset.response.status}.`,
      );
      assertReadOnlyHeaders(asset.response, cssPath);
      css += asset.text;
    }
    invariant(
      /data-agorbis-launch-mode[^\{]{0,500}public-read-only[^\{]{0,500}form/.test(
        css,
      ),
      "La hoja de estilos no oculta formularios en public-read-only.",
    );
  }
}

const canonicalRedirects = [
  {
    location: "/manual/?fixture=a%2Fb+c",
    source: "/manual?fixture=a%2Fb+c",
  },
  {
    location: "/explorar/?parent=buenos-aires&view=map",
    source: "/explorar?parent=buenos-aires&view=map",
  },
];

for (const { location, source } of canonicalRedirects) {
  for (const method of ["GET", "HEAD"]) {
    const { response, text } = await request(source, { method });
    invariant(
      response.status === 301,
      `${method} ${source} devolvió ${response.status}, no 301.`,
    );
    invariant(
      response.headers.get("location") === location,
      `${method} ${source} no preservó path y query en el redirect canónico.`,
    );
    invariant(text === "", `${method} ${source} devolvió body.`);
    invariant(
      response.headers.get("refresh") === null,
      `${method} ${source} devolvió Refresh.`,
    );
    assertReadOnlyHeaders(response, `${method} ${source}`);
  }
}

const blockedGetPaths = [
  "/auth/callback?code=fixture",
  "/auth/confirm?token_hash=fixture",
  "/buscar?q=fixture",
  "/c/earth/debates/nuevo",
  "/comunidades/solicitar",
  "/consentimiento",
  "/ingresar",
  "/internal/health",
  "/internal/purge-retained-data",
  "/media/reclamos/pendientes/fixture.png",
  "/moderacion",
  "/notificaciones",
  "/onboarding",
  "/perfil",
  "/recuperar",
  "/reenviar-confirmacion",
  "/registro",
  "/explorar?q=opinion-politica",
  "/explorar/?q=opinion-politica",
  "/instituciones?q=texto-libre",
];

for (const pathname of blockedGetPaths) {
  const { response, text } = await request(pathname);
  invariant(
    response.status === 403,
    `${pathname} debería devolver 403 y devolvió ${response.status}.`,
  );
  assertReadOnlyHeaders(response, pathname);
  invariant(
    text === "Agorbis está disponible temporalmente sólo para lectura.",
    `${pathname} devolvió un detalle inesperado.`,
  );
}

for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  for (const pathname of [
    "/",
    "/manual",
    "/manual/",
    "/explorar?parent=earth",
    "/explorar/?parent=earth",
  ]) {
    const { response } = await request(pathname, {
      method,
      body: method === "OPTIONS" ? undefined : "fixture=non-sensitive",
      headers:
        method === "OPTIONS"
          ? undefined
          : { "Content-Type": "application/x-www-form-urlencoded" },
    });
    invariant(
      response.status === 403,
      `${method} ${pathname} debería devolver 403 y devolvió ${response.status}.`,
    );
    invariant(
      response.headers.get("location") === null,
      `${method} ${pathname} intentó redirigir.`,
    );
    assertReadOnlyHeaders(response, `${method} ${pathname}`);
  }
}

for (const header of ["X-QRL", "X-HTTP-Method-Override", "X-Method-Override"]) {
  const { response } = await request("/", { headers: { [header]: "POST" } });
  invariant(response.status === 403, `${header} no fue rechazado.`);
}

const head = await request("/", { method: "HEAD" });
invariant(
  head.response.status === 200,
  `HEAD / devolvió ${head.response.status}.`,
);
invariant(head.text === "", "HEAD / devolvió body.");
assertReadOnlyHeaders(head.response, "HEAD /", { html: true });

const wwwUrl = new URL("/manual?fixture=1", parsedOrigin);
wwwUrl.hostname = "www.agorbis.com";
const wwwResponse = await fetch(wwwUrl, {
  redirect: "manual",
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});
invariant(
  wwwResponse.status === 308,
  `www devolvió ${wwwResponse.status}, no 308.`,
);
invariant(
  wwwResponse.headers.get("location") ===
    "https://agorbis.com/manual?fixture=1",
  "www no preservó path y query hacia el apex.",
);

console.log(
  `Smoke preview read-only: PASS (${allowedPages.length} páginas públicas, ${canonicalRedirects.length * 2} redirects canónicos, ${blockedGetPaths.length} rutas sensibles, cinco métodos de escritura, tres headers de bypass y www 308).`,
);
