/**
 * Pruebas de los ayudantes compartidos: recorte de texto, escapado XML,
 * iniciales, rutas de contenido y origen del sitio.
 *
 * Son las piezas que estaban copiadas en varias rutas y componentes. Ahora que
 * hay una sola implementación de cada una, un error acá sale en el sitemap, en
 * las imágenes para compartir, en los avatares y en los enlaces al mismo
 * tiempo — que es justo el motivo para cubrirlas.
 *
 * Se transpilan en memoria, igual que `test-civic.mjs`, para no depender de que
 * la versión de Node cargue TypeScript.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";

process.env.NODE_ENV = "test";

const moduleUrl = (path, replacements = []) => {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
};
const load = async (path, replacements = []) =>
  import(moduleUrl(path, replacements));

const text = await load("../src/lib/text.ts");
// `community.ts` importa i18n sólo para `compareNames`; acá se prueban las
// rutas, así que se sustituye por un stub.
const community = await load("../src/lib/community.ts", [
  [
    /import \{[^}]*\} from "\.\/i18n";/,
    'const DEFAULT_LOCALE = "es"; const localeTag = () => "es-AR";',
  ],
]);
const http = await load("../src/lib/http.ts", [
  [/import type \{[^}]*\} from "@qwik\.dev\/router";/, ""],
]);
// `uploads.ts` usa estos helpers compartidos en funciones que no necesitan una
// red real. Se sustituyen por equivalentes mínimos porque un módulo cargado
// desde `data:` no puede resolver imports relativos.
const cursor = await load("../src/lib/cursor.ts");
const lastSeen = await load("../src/lib/last-seen.ts", [
  [/import type \{[^}]*\} from "@qwik\.dev\/router";/, ""],
]);
// De `timezone.ts` se prueba `resolveTimeZone`, que es pura; el resto son el
// contexto de Qwik y el lector de cookies.
const timezone = await load("../src/lib/timezone.ts", [
  [
    /import \{[^}]*\} from "@qwik\.dev\/core";/,
    "const createContextId = () => ({}); const useContext = () => '';",
  ],
  [/import type \{[^}]*\} from "@qwik\.dev\/router";/, ""],
]);
const uploads = await load("../src/lib/uploads.ts", [
  [
    /import \{ claimDraftMediaUrl \} from "\.\/claim-media";/,
    "const claimDraftMediaUrl = (path) => `/media/reclamos/pendientes/${path.split('/').at(-1)}`;",
  ],
  // `limitMessage` traduce los topes de la base; las funciones puras que se
  // prueban acá (sniff, rutas) no lo llaman.
  [
    /import \{ limitMessage \} from "\.\/db-error";/,
    "const limitMessage = () => null;",
  ],
  [
    /import \{[^}]*\} from "\.\/i18n";/,
    'const DEFAULT_LOCALE = "es"; const translate = (_l, s) => s;',
  ],
  [
    /import \{ isUuid \} from "\.\/http";/,
    "const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);",
  ],
  [
    /import \{ normalizeHttpUrl \} from "\.\/url";/,
    "const normalizeHttpUrl = (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };",
  ],
]);

// ---------------------------------------------------------------------------
// clipText / summarizeText · no partir un carácter en dos
// ---------------------------------------------------------------------------
assert.equal(text.clipText("hola", 10), "hola");
assert.equal(text.clipText("hola", 4), "hola");
assert.equal(text.clipText("hola mundo", 4), "hola");

// Un emoji ocupa dos unidades UTF-16: `slice(0, 1)` devolvía media pareja de
// sustitución, que se pinta como "�". Con puntos de código entra o no entra.
const emoji = "🏙️Buenos Aires";
assert.equal(text.clipText("🌍", 1), "🌍");
assert.doesNotMatch(text.clipText(emoji, 1), /�/);
assert.ok(!/[\uD800-\uDBFF]$/.test(text.clipText(emoji, 3)));

// El "…" se decide sobre el texto ya colapsado, no sobre el original: una
// frase que entra completa después de colapsar espacios no lleva puntos.
assert.equal(text.summarizeText("uno   dos\n\ntres", 40), "uno dos tres");
assert.equal(text.summarizeText("  hola  ", 10), "hola");
assert.equal(text.summarizeText("abcdefghij", 4), "abcd…");

// El caso que estaba mal: el original pasa de 150 caracteres, pero es casi todo
// espacio en blanco y colapsado entra completo. Antes se comparaba contra el
// largo sin colapsar y se le pegaba un "…" a una frase entera.
const padded = `hola${" ".repeat(200)}mundo`;
assert.ok(padded.length > 150);
assert.equal(text.summarizeText(padded, 150), "hola mundo");

// ---------------------------------------------------------------------------
// resolveTimeZone · el valor sale de una cookie, o sea del cliente
// ---------------------------------------------------------------------------
assert.equal(
  timezone.resolveTimeZone("America/Argentina/Buenos_Aires"),
  "America/Argentina/Buenos_Aires",
);
assert.equal(timezone.resolveTimeZone("Pacific/Auckland"), "Pacific/Auckland");
assert.equal(timezone.resolveTimeZone("UTC"), "UTC");

// Sin cookie, UTC: es lo que se venía mostrando y no sorprende a nadie.
assert.equal(timezone.resolveTimeZone(undefined), "UTC");
assert.equal(timezone.resolveTimeZone(null), "UTC");
assert.equal(timezone.resolveTimeZone(""), "UTC");

// Lo que motiva validar: `Intl` LANZA con una zona desconocida, y eso tumbaría
// el render de cualquier página con una fecha — o sea, casi todas.
for (const basura of [
  "No/Existe",
  "'; drop table --",
  "America/Argentina/Buenos_Aires; rm -rf",
  "0",
]) {
  assert.doesNotThrow(() => timezone.resolveTimeZone(basura), basura);
  assert.equal(timezone.resolveTimeZone(basura), "UTC", basura);
}

// ---------------------------------------------------------------------------
// readLastSeen · marcar lo nuevo sin que desaparezca al recargar
// ---------------------------------------------------------------------------
const seenEv = (stored) => {
  const jar = new Map(stored ? [["agorbis-visto", { value: stored }]] : []);
  return {
    cookie: { get: (n) => jar.get(n), set: (n, v) => jar.set(n, { value: v }) },
    url: { protocol: "https:" },
    jar,
  };
};
const T0 = new Date("2026-03-01T12:00:00Z");
const enMinutos = (m) => new Date(T0.getTime() + m * 60_000);

// Primera visita: no hay con qué comparar, así que no se marca nada. Estrenar
// la app con todo en "Nuevo" no informa.
const visitaPrimera = seenEv(undefined);
assert.equal(lastSeen.readLastSeen(visitaPrimera, true, T0).since, null);
assert.equal(visitaPrimera.jar.get("agorbis-visto").value, T0.toISOString());

// Segunda visita, al rato: la marca NO avanza. Sin esta ventana, recargar
// borraba todos los "Nuevo" al instante.
const visitaAlRato = seenEv(T0.toISOString());
assert.equal(
  lastSeen.readLastSeen(visitaAlRato, true, enMinutos(5)).since,
  T0.toISOString(),
);
assert.equal(visitaAlRato.jar.get("agorbis-visto").value, T0.toISOString());

// Al volver más tarde, sí avanza.
const visitaMasTarde = seenEv(T0.toISOString());
assert.equal(
  lastSeen.readLastSeen(visitaMasTarde, true, enMinutos(45)).since,
  T0.toISOString(),
  "se compara contra la visita anterior, no contra ahora",
);
assert.equal(
  visitaMasTarde.jar.get("agorbis-visto").value,
  enMinutos(45).toISOString(),
);

// Paginar no adelanta la marca: bajar no es haber leído lo de arriba.
const visitaPaginando = seenEv(T0.toISOString());
lastSeen.readLastSeen(visitaPaginando, false, enMinutos(45));
assert.equal(visitaPaginando.jar.get("agorbis-visto").value, T0.toISOString());

// Cookie corrupta: se trata como visitaPrimera visita, no se rompe nada.
const visitaRota = seenEv("no es una fecha");
assert.equal(lastSeen.readLastSeen(visitaRota, true, T0).since, null);

// isNew compara ISO como texto, que para UTC es el mismo orden que el temporal.
assert.equal(lastSeen.isNew("2026-03-01T13:00:00Z", T0.toISOString()), true);
assert.equal(lastSeen.isNew("2026-03-01T11:00:00Z", T0.toISOString()), false);
assert.equal(lastSeen.isNew("2026-03-01T13:00:00Z", null), false);

// ---------------------------------------------------------------------------
// highlightSegments · resaltar sin inyectar y sin perder acentos
// ---------------------------------------------------------------------------
const unir = (segs) => segs.map((s) => s.text).join("");
const marcado = (segs) =>
  segs
    .filter((s) => s.match)
    .map((s) => s.text)
    .join("|");

// Invariante básico: los tramos reconstruyen el original, siempre.
for (const [texto, q] of [
  ["Plaza Córdoba", "cordoba"],
  ["", "algo"],
  ["sin coincidencia", "zzz"],
  ["Ñandú en Añatuya", "anatuya"],
  ["🏙️ Buenos Aires", "buenos"],
]) {
  assert.equal(unir(text.highlightSegments(texto, q)), texto, texto);
}

// Se compara sin acentos pero se devuelve el original.
assert.equal(
  marcado(text.highlightSegments("Plaza Córdoba", "cordoba")),
  "Córdoba",
);
assert.equal(marcado(text.highlightSegments("Añatuya", "anatuya")), "Añatuya");
// Y al revés: buscar con acento encuentra el texto sin él.
assert.equal(marcado(text.highlightSegments("Cordoba", "Córdoba")), "Cordoba");

// Varios términos, y todas las apariciones de cada uno.
assert.equal(
  marcado(text.highlightSegments("agua y luz: falta agua", "agua luz")),
  "agua|luz|agua",
);

// Términos de una sola letra se ignoran: marcarían media pantalla.
assert.equal(text.highlightSegments("agua", "a").length, 1);
assert.equal(marcado(text.highlightSegments("agua", "a")), "");

// Sin coincidencia devuelve un solo tramo sin marcar.
const nada = text.highlightSegments("hola", "zzz");
assert.equal(nada.length, 1);
assert.equal(nada[0].match, false);

// Lo que motiva devolver datos y no HTML: el término viene de la URL.
const peligroso = text.highlightSegments("un <script> suelto", "<script>");
assert.equal(unir(peligroso), "un <script> suelto");
assert.equal(marcado(peligroso), "<script>");

// ---------------------------------------------------------------------------
// csvField / csvRow · el archivo lo abre una planilla, no un parser nuestro
// ---------------------------------------------------------------------------
assert.equal(text.csvField("hola"), '"hola"');
assert.equal(text.csvField(42), '"42"');
assert.equal(text.csvField(null), '""');
assert.equal(text.csvField(undefined), '""');

// Escapado: coma, comilla y salto de línea rompen la fila si van crudos.
assert.equal(text.csvField("uno, dos"), '"uno, dos"');
assert.equal(text.csvField('di "hola"'), '"di ""hola"""');
assert.equal(text.csvField("dos\nlíneas"), '"dos\nlíneas"');

// Inyección de fórmulas: una opción la escribe cualquiera, y Excel ejecuta lo
// que empiece con =, +, - o @.
for (const peligroso of [
  '=HYPERLINK("http://evil")',
  "+1+1",
  "-2+3",
  "@SUM(A1)",
]) {
  const salida = text.csvField(peligroso);
  assert.ok(
    salida.startsWith(`"'`),
    `${peligroso} tiene que quedar neutralizado con apóstrofo, salió ${salida}`,
  );
}
// Un texto normal no se toca: el apóstrofo sólo va donde hace falta.
assert.equal(text.csvField("Plaza principal"), '"Plaza principal"');
assert.doesNotMatch(text.csvField("2 de abril"), /^"'/);

// La fila cierra con CRLF, como pide el RFC 4180.
assert.equal(text.csvRow(["a", 1]), '"a","1"\r\n');

// ---------------------------------------------------------------------------
// escapeXml · el sitemap y las imágenes para compartir emiten XML a mano
// ---------------------------------------------------------------------------
assert.equal(
  text.escapeXml(`<a href="x">& '`),
  "&lt;a href=&quot;x&quot;&gt;&amp; &apos;",
);
assert.equal(text.escapeXml("Mar del Plata"), "Mar del Plata");

// ---------------------------------------------------------------------------
// initials · nombres reales, incluidos los que empiezan con emoji
// ---------------------------------------------------------------------------
assert.equal(text.initials("Ada Lovelace"), "AL");
assert.equal(text.initials("  ada   lovelace  "), "AL");
assert.equal(text.initials("Ada Byron Lovelace"), "AB");
assert.equal(text.initials("ada"), "A");
assert.equal(text.initials(""), "?");
assert.equal(text.initials("   "), "?");
assert.equal(text.initials("🌟Ada"), "🌟");
assert.doesNotMatch(text.initials("🌟Ada Lovelace"), /�/);

// ---------------------------------------------------------------------------
// contentHref · una sola tabla de rutas para los cuatro tipos
// ---------------------------------------------------------------------------
assert.equal(community.contentHref("poll", "abc"), "/encuestas/abc");
assert.equal(community.contentHref("debate", "abc"), "/debates/abc");
assert.equal(community.contentHref("claim", "abc"), "/reclamos/abc");
assert.equal(community.contentHref("project", "abc"), "/proyectos/abc");
for (const type of ["poll", "debate", "claim", "project"]) {
  assert.equal(
    community.contentHref(type, "id"),
    community.routes[type]("id"),
    `contentHref(${type}) tiene que coincidir con routes.${type}`,
  );
}

assert.equal(
  community.routes.newContent("earth", "encuestas/nueva"),
  "/c/earth/encuestas/nueva",
);

// ---------------------------------------------------------------------------
// ancestorPaths · la cadena de residencia sale de acá en tres lugares
// ---------------------------------------------------------------------------
assert.deepEqual(community.ancestorPaths("earth"), ["earth"]);
assert.deepEqual(community.ancestorPaths("earth.south-america.argentina"), [
  "earth",
  "earth.south-america",
  "earth.south-america.argentina",
]);

// ---------------------------------------------------------------------------
// siteOrigin · PUBLIC_SITE_URL la completa una persona a mano
// ---------------------------------------------------------------------------
const ev = (configured) => ({
  env: { get: () => configured },
  url: { origin: "http://localhost:5173" },
});

assert.equal(http.siteOrigin(ev(undefined)), "http://localhost:5173");
assert.equal(http.siteOrigin(ev("")), "http://localhost:5173");
assert.equal(http.siteOrigin(ev("   ")), "http://localhost:5173");
assert.equal(http.siteOrigin(ev("https://agorbis.org")), "https://agorbis.org");
// La barra final producía `https://agorbis.org//sitemap.xml`.
assert.equal(
  http.siteOrigin(ev("https://agorbis.org/")),
  "https://agorbis.org",
);
assert.equal(
  http.siteOrigin(ev("https://agorbis.org///")),
  "https://agorbis.org",
);
assert.equal(
  `${http.siteOrigin(ev("https://agorbis.org/"))}/sitemap.xml`,
  "https://agorbis.org/sitemap.xml",
);

// ---------------------------------------------------------------------------
// safeInternalPath · ningún redirect controlado por datos sale del sitio
// ---------------------------------------------------------------------------
assert.equal(http.safeInternalPath("/perfil"), "/perfil");
assert.equal(
  http.safeInternalPath("/buscar?q=córdoba#resultados"),
  "/buscar?q=c%C3%B3rdoba#resultados",
);
assert.equal(http.safeInternalPath("https://evil.example"), "/");
assert.equal(http.safeInternalPath("//evil.example"), "/");
assert.equal(http.safeInternalPath("/\\\\evil.example"), "/");
assert.equal(http.safeInternalPath("javascript:alert(1)"), "/");
assert.equal(http.safeInternalPath(null, "/notificaciones"), "/notificaciones");

// ---------------------------------------------------------------------------
// Los endpoints de mantenimiento fallan cerrados sin CRON_SECRET
// ---------------------------------------------------------------------------
const cronEv = (secret, authorization) => {
  const sent = [];
  const headers = new Map();
  return {
    sent,
    sentHeaders: headers,
    env: { get: () => secret },
    request: { headers: { get: () => authorization } },
    headers: { set: (name, value) => headers.set(name, value) },
    send: (status, body) => sent.push({ status, body }),
  };
};

const noSecret = cronEv(undefined, "Bearer x");
assert.equal(await http.cronAuthorized(noSecret), false);
assert.equal(noSecret.sent[0].status, 401);

const cronSecret = "0123456789abcdef0123456789abcdef";
const wrongSecret = cronEv(cronSecret, "Bearer otro");
assert.equal(await http.cronAuthorized(wrongSecret), false);
assert.equal(wrongSecret.sent[0].status, 401);

const noHeader = cronEv(cronSecret, null);
assert.equal(await http.cronAuthorized(noHeader), false);

const shortSecret = cronEv("demasiado-corto", "Bearer demasiado-corto");
assert.equal(await http.cronAuthorized(shortSecret), false);

const good = cronEv(cronSecret, `Bearer ${cronSecret}`);
assert.equal(await http.cronAuthorized(good), true);
assert.equal(good.sent.length, 0);

// Node no ofrece la extensión timingSafeEqual de Workers. Fuera del modo test
// el helper no debe degradar a una comparación casera: falla cerrado.
const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
const noRuntimePrimitive = cronEv(cronSecret, `Bearer ${cronSecret}`);
assert.equal(await http.cronAuthorized(noRuntimePrimitive), false);
process.env.NODE_ENV = previousNodeEnv;

// ---------------------------------------------------------------------------
// Cabeceras de seguridad · toda respuesta las lleva
// ---------------------------------------------------------------------------
const seguridad = await load("../src/routes/plugin@cabeceras.ts", [
  [/import\.meta\.env\.DEV/g, "false"],
]);

const headersEv = (href, vars = {}) => {
  const headers = new Map();
  return {
    headers: { set: (name, value) => headers.set(name, value) },
    url: new URL(href),
    env: { get: (name) => vars[name] },
    sharedMap: new Map(),
    map: headers,
  };
};

const enProduccion = headersEv("https://agorbis.org/reclamos/abc");
seguridad.onRequest(enProduccion);

assert.equal(enProduccion.map.get("X-Content-Type-Options"), "nosniff");
assert.equal(
  enProduccion.map.get("Referrer-Policy"),
  "strict-origin-when-cross-origin",
);
assert.equal(enProduccion.map.get("X-Frame-Options"), "DENY");
assert.equal(enProduccion.map.get("Cross-Origin-Opener-Policy"), "same-origin");
assert.match(enProduccion.map.get("Strict-Transport-Security"), /max-age=\d+/);

const csp = enProduccion.map.get("Content-Security-Policy");
// Clickjacking sobre votar y apoyar reclamos: es la razón de ser de la cabecera.
assert.match(csp, /frame-ancestors 'none'/);
assert.match(csp, /base-uri 'none'/);
assert.match(csp, /object-src 'none'/);
assert.match(csp, /upgrade-insecure-requests/);
// El acceso social es un POST nativo que redirige a Supabase y luego a Google:
// `form-action` debe cubrir exactamente esa cadena y nada más (sin Facebook).
const formAction = (policy) =>
  policy
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("form-action "));
assert.equal(formAction(csp), "form-action 'self' https://accounts.google.com");
const conSupabase = headersEv("https://agorbis.org/ingresar/", {
  PUBLIC_SUPABASE_URL: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
});
seguridad.onRequest(conSupabase);
assert.equal(
  formAction(conSupabase.map.get("Content-Security-Policy")),
  "form-action 'self' https://ibtvlvpxwourrxwcrfkf.supabase.co https://accounts.google.com",
);
assert.doesNotMatch(
  conSupabase.map.get("Content-Security-Policy"),
  /facebook/i,
);
// Declarar `script-src` sin nonce sería una protección de mentira: mejor que
// no esté a que esté con `unsafe-inline`.
const scriptPolicy = csp
  .split(";")
  .map((directive) => directive.trim())
  .find((directive) => directive.startsWith("script-src "));
assert.match(scriptPolicy, /'nonce-[0-9a-f]+'/);
assert.doesNotMatch(scriptPolicy, /unsafe-inline/);

// `ShareButton` copia el enlace cuando no hay `navigator.share`.
const permisos = enProduccion.map.get("Permissions-Policy");
assert.match(permisos, /camera=\(\)/);
// `geolocation` es la única excepción y está acotada al propio origen: el
// formulario de reclamo la ofrece para marcar dónde está el problema. Se
// verifica el `(self)` exacto porque un `*` acá se la daría a cualquier
// iframe de terceros que la app llegue a embeber.
assert.match(permisos, /geolocation=\(self\)/);
assert.doesNotMatch(permisos, /geolocation=\*/);
assert.doesNotMatch(permisos, /clipboard/);

// En http local no se manda HSTS: quedaría cacheado contra el dominio de
// desarrollo y rompería cualquier otro sitio en `localhost`.
const enLocal = headersEv("http://localhost:5173/");
seguridad.onRequest(enLocal);
assert.equal(enLocal.map.get("Strict-Transport-Security"), undefined);
assert.doesNotMatch(
  enLocal.map.get("Content-Security-Policy"),
  /upgrade-insecure-requests/,
);
assert.equal(enLocal.map.get("X-Frame-Options"), "DENY");

// Qwik Router ordena los `plugin@*` por ruta alfabética y `plugin@i18n.ts`
// puede cortar el request con un `throw redirect(303)` al limpiar `?lang=`.
// El identificador de request puede correr antes, pero las cabeceras tienen que
// quedar instaladas antes de cualquier plugin que corte la cadena.
const plugins = readdirSync(new URL("../src/routes", import.meta.url))
  .filter((name) => name.startsWith("plugin@"))
  .sort();
assert.ok(
  plugins.indexOf("plugin@cabeceras.ts") < plugins.indexOf("plugin@i18n.ts"),
  `cabeceras tiene que correr antes de i18n (hoy: ${plugins.join(", ")})`,
);

// ---------------------------------------------------------------------------
// throttledByCookie · las tareas "por las dudas" no corren en cada request
// ---------------------------------------------------------------------------
const cookieEv = (stored) => {
  const jar = new Map(stored === undefined ? [] : [["t", { value: stored }]]);
  return {
    cookie: {
      get: (n) => jar.get(n),
      set: (n, v) => jar.set(n, { value: v }),
    },
    url: { protocol: "https:" },
    jar,
  };
};

// Primera vez: corre y deja la marca.
const primera = cookieEv(undefined);
assert.equal(http.throttledByCookie(primera, "t", 3600, 1_000_000), false);
assert.equal(primera.jar.get("t").value, "1000000");

// Dentro de la ventana: se saltea.
assert.equal(
  http.throttledByCookie(cookieEv("1000000"), "t", 3600, 1_000_000 + 60_000),
  true,
);
// Justo al vencer: vuelve a correr.
assert.equal(
  http.throttledByCookie(cookieEv("1000000"), "t", 3600, 1_000_000 + 3_600_000),
  false,
);
// Cookie basura o borrada: corre, que es el lado seguro (las tareas son
// idempotentes en la base).
assert.equal(http.throttledByCookie(cookieEv("nada"), "t", 3600, 5), false);
assert.equal(http.throttledByCookie(cookieEv(undefined), "t", 3600, 5), false);

// ---------------------------------------------------------------------------
// query · una consulta fallida no es un resultado vacío
// ---------------------------------------------------------------------------
const query = await load("../src/lib/query.ts", [
  [/import type \{[^}]*\} from "@qwik\.dev\/router";/, ""],
  [/import \{[^}]*\} from "\.\/constants";/, 'const LOAD_FAILED = "fallo";'],
  [
    /import \{[^}]*\} from "\.\/i18n";/,
    'const resolveLocale = () => "es"; const translate = (_l, s) => s;',
  ],
  [/import \{[^}]*\} from "\.\/log";/, "const logFailure = () => {};"],
  [
    /import \{[^}]*\} from "\.\/request-id";/,
    "const requestIdOf = () => undefined;",
  ],
]);

const evStub = () => ({
  locale: () => "es",
  error: (status, message) => Object.assign(new Error(message), { status }),
});

// Éxito: devuelve las filas.
assert.deepEqual(
  await query.many(
    evStub(),
    "t",
    Promise.resolve({ data: [1, 2], error: null }),
  ),
  [1, 2],
);
// Vacío real: `[]` sólo cuando la consulta salió bien.
assert.deepEqual(
  await query.many(evStub(), "t", Promise.resolve({ data: [], error: null })),
  [],
);
assert.deepEqual(
  await query.many(evStub(), "t", Promise.resolve({ data: null, error: null })),
  [],
);

// El caso que motivó todo: fallo != vacío. Antes esto devolvía `[]` y la
// página anunciaba "todavía no hay nada".
await assert.rejects(
  () =>
    query.many(
      evStub(),
      "t",
      Promise.resolve({ data: null, error: { message: "boom" } }),
    ),
  /fallo/,
);
await assert.rejects(
  () =>
    query.single(
      evStub(),
      "t",
      Promise.resolve({ data: null, error: { message: "boom" } }),
    ),
  /fallo/,
);

// server$ recibe RequestEventBase sin ev.error/locale: conserva la misma
// distinción sin enviar el detalle interno del proveedor al navegador.
assert.deepEqual(
  await query.serverMany(
    {},
    "autocomplete",
    Promise.resolve({ data: [], error: null }),
  ),
  [],
);
assert.deepEqual(
  await query.serverMany(
    {},
    "autocomplete",
    Promise.resolve({ data: ["coincidencia"], error: null }),
  ),
  ["coincidencia"],
);
await assert.rejects(
  () =>
    query.serverMany(
      {},
      "autocomplete",
      Promise.resolve({
        data: null,
        error: { message: "detalle interno del proveedor" },
      }),
    ),
  (error) => error.message === "fallo",
);

// `single` reserva `null` para "no existe", que es lo que el 404 necesita.
assert.equal(
  await query.single(
    evStub(),
    "t",
    Promise.resolve({ data: null, error: null }),
  ),
  null,
);

// `orFallback` degrada a propósito y no lanza.
assert.deepEqual(
  await query.orFallback(
    "t",
    Promise.resolve({ data: null, error: { message: "boom" } }),
    ["respaldo"],
  ),
  ["respaldo"],
);

// ---------------------------------------------------------------------------
// sniffImageType · el tipo sale de los bytes, no de lo que dice el cliente
// ---------------------------------------------------------------------------
const bytesOf = (...parts) => {
  const out = [];
  for (const part of parts) {
    if (typeof part === "string")
      out.push(...[...part].map((c) => c.charCodeAt(0)));
    else out.push(...part);
  }
  // Se rellena hasta 16, que es lo que lee `uploadImage`.
  while (out.length < 16) out.push(0);
  return Uint8Array.from(out);
};

assert.equal(
  uploads.sniffImageType(bytesOf([0xff, 0xd8, 0xff, 0xe0])),
  "image/jpeg",
);
assert.equal(
  uploads.sniffImageType(
    bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ),
  "image/png",
);
assert.equal(
  uploads.sniffImageType(bytesOf("RIFF", [0, 0, 0, 0], "WEBP")),
  "image/webp",
);
assert.equal(
  uploads.sniffImageType(bytesOf([0, 0, 0, 0], "ftyp", "avif")),
  "image/avif",
);
assert.equal(
  uploads.sniffImageType(bytesOf([0, 0, 0, 0], "ftyp", "mif1")),
  "image/avif",
);

// Lo que motivó el cambio: un archivo que *dice* ser PNG pero no lo es.
assert.equal(uploads.sniffImageType(bytesOf("<!DOCTYPE html>")), null);
assert.equal(
  uploads.sniffImageType(bytesOf("<svg xmlns=")),
  null,
  "SVG queda fuera",
);
assert.equal(
  uploads.sniffImageType(bytesOf("GIF89a")),
  null,
  "GIF no está permitido",
);
// RIFF sin la marca WEBP es otro contenedor (un .wav, por ejemplo).
assert.equal(
  uploads.sniffImageType(bytesOf("RIFF", [0, 0, 0, 0], "WAVE")),
  null,
);
assert.equal(uploads.sniffImageType(bytesOf([])), null);

// El tipo detectado elige la extensión y el `Content-Type` guardados, así que
// `uploadImage` no puede devolver nada que `EXTENSIONS` no cubra.
const detectables = [
  bytesOf([0xff, 0xd8, 0xff, 0xe0]),
  bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bytesOf("RIFF", [0, 0, 0, 0], "WEBP"),
].map((bytes) => uploads.sniffImageType(bytes));
const uploadsSource = readFileSync(
  new URL("../src/lib/uploads.ts", import.meta.url),
  "utf8",
);
for (const type of detectables) {
  assert.match(
    uploadsSource,
    new RegExp(`"${type}":\\s*"`),
    `EXTENSIONS no tiene entrada para ${type}: el path quedaría con "undefined"`,
  );
}
assert.doesNotMatch(
  uploadsSource,
  /"image\/avif":\s*"/,
  "AVIF se reconoce para rechazarlo, no para construir un path",
);

// ---------------------------------------------------------------------------
// isCalendarDate · lo que llega de un <input type="date"> antes de una columna date
// ---------------------------------------------------------------------------
assert.equal(text.isCalendarDate("2026-08-13"), true);
assert.equal(text.isCalendarDate("2024-02-29"), true, "2024 es bisiesto");
// El caso que la expresión regular sola dejaba pasar y Postgres rechazaba con
// un error genérico.
assert.equal(text.isCalendarDate("2026-02-30"), false);
assert.equal(text.isCalendarDate("2026-02-29"), false, "2026 no es bisiesto");
assert.equal(text.isCalendarDate("2026-13-01"), false);
assert.equal(text.isCalendarDate("2026-00-10"), false);
assert.equal(text.isCalendarDate("2026-8-13"), false, "exige dos dígitos");
assert.equal(text.isCalendarDate("13/08/2026"), false);
assert.equal(text.isCalendarDate("2026-08-13T10:00:00Z"), false);
assert.equal(text.isCalendarDate(""), false);
assert.equal(text.isCalendarDate("no es una fecha"), false);

// Toda respuesta de mantenimiento lleva su tipo y prohíbe la caché: una de las
// tres rutas mandaba JSON sin ninguno de los dos encabezados.
const jsonEv = cronEv(cronSecret, `Bearer ${cronSecret}`);
http.sendJson(jsonEv, 200, { deleted: 0 });
assert.equal(
  jsonEv.sentHeaders.get("Content-Type"),
  "application/json; charset=utf-8",
);
assert.equal(jsonEv.sentHeaders.get("Cache-Control"), "no-store");
assert.equal(jsonEv.sent[0].body, '{"deleted":0}');

// ---------------------------------------------------------------------------
// loadContentExtensions · una consulta por tipo, no una por relación
// ---------------------------------------------------------------------------
// La selección sigue usando su implementación real. Sus dependencias puras
// también se transpilan: un módulo data: no resuelve rutas relativas.
const relationSelectionUrl = moduleUrl("../src/lib/relation-selection.ts", [
  [
    /import \{ isUuid \} from "\.\/http";/,
    `import { isUuid } from "${moduleUrl("../src/lib/http.ts")}";`,
  ],
  [
    /import \{ logFailure \} from "\.\/log";/,
    `import { logFailure } from "${moduleUrl("../src/lib/log.ts")}";`,
  ],
]);
const extensions = await load("../src/lib/content-extensions.ts", [
  [
    /import \{\s*loadRelationSelection,[\s\S]*?\} from "\.\/relation-selection";/,
    `import { loadRelationSelection } from "${relationSelectionUrl}";`,
  ],
  [
    /import \{ contentHref \} from "\.\/community";/,
    "const contentHref = (type, id) => `/${type}/${id}`;",
  ],
  // El logger registra fallos; acá se prueba el agrupado de títulos, así
  // que alcanza con la parte que devuelve las filas.
  [/import \{ logFailure \} from "\.\/log";/, "const logFailure = () => {};"],
  [
    /import \{ safeHttpUrl \} from "\.\/url";/,
    "const safeHttpUrl = (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };",
  ],
]);

/**
 * Cliente falso: encadena como el de Supabase y resuelve según la tabla.
 * Lo que importa medir es cuántas veces se consulta cada tabla.
 */
const fakeDb = (rowsByTable) => {
  const queries = [];
  return {
    queries,
    from(table) {
      queries.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        in: () => builder,
        or: () => builder,
        order: () => builder,
        maybeSingle: () => builder,
        then: (resolve) => resolve({ data: rowsByTable[table] ?? [] }),
      };
      return builder;
    },
  };
};

// Ocho relaciones repartidas entre los cuatro tipos. Antes esto disparaba ocho
// consultas de título, una por relación; ahora tienen que ser cuatro.
const relationRows = [
  ["poll", "p1"],
  ["poll", "p2"],
  ["debate", "d1"],
  ["debate", "d2"],
  ["claim", "c1"],
  ["claim", "c2"],
  ["project", "j1"],
  ["project", "j2"],
].map(([targetType, targetId], index) => ({
  id: `rel-${index}`,
  source_type: "claim",
  source_id: "origen",
  target_type: targetType,
  target_id: targetId,
  relation_type: "proposal_for",
  created_at: "2026-01-01T00:00:00Z",
}));

const db = fakeDb({
  content_relations: relationRows,
  content_sources: [],
  institutional_responses: [],
  polls: [
    { id: "p1", question: "Pregunta 1" },
    { id: "p2", question: "Pregunta 2" },
  ],
  debates: [
    { id: "d1", title: "Debate 1" },
    { id: "d2", title: "Debate 2" },
  ],
  claims: [
    { id: "c1", title: "Reclamo 1" },
    { id: "c2", title: "Reclamo 2" },
  ],
  projects: [
    { id: "j1", title: "Proyecto 1" },
    { id: "j2", title: "Proyecto 2" },
  ],
});

const loaded = await extensions.loadContentExtensions(
  db,
  "claim",
  "origen",
  null,
);

assert.equal(loaded.related.length, 8, "las ocho relaciones traen título");
assert.equal(
  loaded.selectedRelation,
  null,
  "sin candidata no se agrega otra lectura",
);
assert.deepEqual(
  loaded.related.map((item) => item.title),
  [
    "Pregunta 1",
    "Pregunta 2",
    "Debate 1",
    "Debate 2",
    "Reclamo 1",
    "Reclamo 2",
    "Proyecto 1",
    "Proyecto 2",
  ],
  "el título va con su relación y no se cruzan entre tipos",
);

const titleQueries = db.queries.filter((table) =>
  ["polls", "debates", "claims", "projects"].includes(table),
);
assert.equal(
  titleQueries.length,
  4,
  `una consulta por tipo, no una por relación (fueron ${titleQueries.length})`,
);
assert.equal(
  new Set(titleQueries).size,
  4,
  "y las cuatro son de tablas distintas",
);

// Una relación cuyo destino ya no existe se descarta, no aparece sin título.
const dbSinTitulo = fakeDb({
  content_relations: [relationRows[0]],
  polls: [],
});
const huerfana = await extensions.loadContentExtensions(
  dbSinTitulo,
  "claim",
  "origen",
  null,
);
assert.deepEqual(huerfana.related, []);

// ---------------------------------------------------------------------------
// readCursor · los dos valores vienen de la query string
// ---------------------------------------------------------------------------
const leer = (busqueda) => cursor.readCursor(new URLSearchParams(busqueda));

const VALIDO = "2026-08-22T14:03:12.123456+00:00";
const UUID_VALIDO = "3f8a1c2e-9b4d-4e7a-8c1f-2d5e6a7b8c90";

// El caso normal: lo que produce `nextCursorParams` tiene que volver a entrar.
assert.deepEqual(
  leer(`antes=${encodeURIComponent(VALIDO)}&id=${UUID_VALIDO}`),
  {
    created_at: VALIDO,
    id: UUID_VALIDO,
  },
);

// Las formas que efectivamente devuelve PostgREST según haya o no fracción de
// segundo y según cómo exprese el desplazamiento.
for (const momento of [
  "2026-08-22T14:03:12+00:00",
  "2026-08-22T14:03:12Z",
  "2026-08-22T14:03:12.5Z",
  "2026-08-22T14:03:12.123456Z",
  "2026-08-22T14:03:12-03:00",
  "2026-08-22T14:03:12-0300",
  "2026-08-22T14:03:12",
]) {
  assert.deepEqual(
    leer(`antes=${encodeURIComponent(momento)}&id=${UUID_VALIDO}`),
    { created_at: momento, id: UUID_VALIDO },
    `debería aceptar ${momento}`,
  );
}

// Sin cursor, o con la mitad: primera página. Quedarse con un solo valor deja
// el desempate sin su otra columna.
assert.equal(leer(""), null);
assert.equal(leer(`antes=${encodeURIComponent(VALIDO)}`), null);
assert.equal(leer(`id=${UUID_VALIDO}`), null);

// El motivo de todo esto: `beforeCursor` interpola en la gramática de
// PostgREST, donde la coma separa ramas del `or` y el paréntesis las agrupa.
// Un `id` así cerraba el `and(...)` y agregaba una rama propia que lo anulaba.
const INYECCION = "0),recipient_id.neq.0";
assert.equal(
  leer(
    `antes=${encodeURIComponent(VALIDO)}&id=${encodeURIComponent(INYECCION)}`,
  ),
  null,
);
assert.equal(
  leer(
    `antes=${encodeURIComponent("2026-08-22T14:03:12+00:00,id.gt.0")}&id=${UUID_VALIDO}`,
  ),
  null,
);

// Basura variada: nada que no sea exactamente un timestamp y un UUID entra.
assert.equal(leer(`antes=ayer&id=${UUID_VALIDO}`), null);
assert.equal(leer(`antes=${encodeURIComponent(VALIDO)}&id=x`), null);
assert.equal(
  leer(`antes=${encodeURIComponent(VALIDO)}&id=${UUID_VALIDO}extra`),
  null,
);
// `/inicio` pasa el `id` como argumento `uuid` de `personalized_feed`: antes
// esto era un error de cast en Postgres y un 500, no una primera página.
assert.equal(leer(`antes=${encodeURIComponent(VALIDO)}&id=1`), null);

// Forma correcta pero fecha inexistente. `Date.parse` no sirve para esto: no
// devuelve NaN, desborda al 3 de marzo.
assert.equal(
  leer(`antes=${encodeURIComponent("2026-02-31T00:00:00Z")}&id=${UUID_VALIDO}`),
  null,
);
assert.equal(
  leer(`antes=${encodeURIComponent("2027-02-29T00:00:00Z")}&id=${UUID_VALIDO}`),
  null,
);
// Y el 29 de febrero de un año bisiesto sí existe.
assert.deepEqual(
  leer(`antes=${encodeURIComponent("2028-02-29T00:00:00Z")}&id=${UUID_VALIDO}`),
  { created_at: "2028-02-29T00:00:00Z", id: UUID_VALIDO },
);

// Y lo que sí pasa se pega tal cual: se comprueba que el filtro resultante no
// tenga más comas ni paréntesis que los que pone el propio ayudante.
const filtro = cursor.beforeCursor({ created_at: VALIDO, id: UUID_VALIDO });
assert.equal(
  filtro,
  `created_at.lt.${VALIDO},and(created_at.eq.${VALIDO},id.lt.${UUID_VALIDO})`,
);
assert.equal(filtro.split(",").length, 3);
assert.equal(filtro.split("(").length, 2);

// ---------------------------------------------------------------------------
// nextCursorParams · sólo hay enlace si la página vino llena
// ---------------------------------------------------------------------------
const fila = { created_at: VALIDO, id: UUID_VALIDO };
assert.equal(
  cursor.nextCursorParams([fila, fila], 2),
  `antes=${encodeURIComponent(VALIDO)}&id=${UUID_VALIDO}`,
);
assert.equal(cursor.nextCursorParams([fila], 2), null);
assert.equal(cursor.nextCursorParams([], 2), null);

// El ida y vuelta completo: lo que sale del listado vuelve a entrar por
// `readCursor`. Es la garantía que hace que la paginación no se corte sola.
assert.deepEqual(leer(cursor.nextCursorParams([fila, fila], 2)), fila);

// ---------------------------------------------------------------------------
// quota · "no sé cuánto cupo te queda" no es "no te queda cupo"
// ---------------------------------------------------------------------------
const quota = await load("../src/lib/quota.ts", [
  [/import type \{[^}]*\} from "@qwik\.dev\/router";/, ""],
  [/import type \{[^}]*\} from "\.\/database\.types\.helpers";/, ""],
  [
    /import \{ supabase \} from "\.\/session";/,
    "const supabase = (ev) => ev.db;",
  ],
  [
    /import \{[^}]*\} from "\.\/i18n";/,
    'const DEFAULT_LOCALE = "es"; const localeTag = () => "es-AR"; const translate = (_l, s) => s;',
  ],
  [/import \{[^}]*\} from "\.\/log";/, "const logFailure = () => {};"],
]);

const quotaEv = (resultado) => ({ db: { rpc: async () => resultado } });

const FILA = {
  level: 4,
  community_id: "c1",
  community_slug: "mar-del-plata",
  community_name: "Mar del Plata",
  community_emoji: "🏖️",
  content_type: "poll",
  monthly_limit: 3,
  remaining: 2,
};

// Camino normal.
const conCupo = await quota.loadQuotaSummary(
  quotaEv({ data: [FILA], error: null }),
  "u1",
);
assert.equal(conCupo.unavailable, false);
assert.equal(conCupo.entries.length, 1);
assert.equal(quota.quotaFor(conCupo, "mar-del-plata", "poll").remaining, 2);

// Sin sesión: no hay cupo que mostrar, pero tampoco un fallo.
const anonimo = await quota.loadQuotaSummary(
  quotaEv({ data: [], error: null }),
  null,
);
assert.equal(anonimo.unavailable, false);
assert.deepEqual(anonimo.entries, []);

// Con sesión y sin filas —todavía no eligió residencia— tampoco es un fallo.
const sinResidencia = await quota.loadQuotaSummary(
  quotaEv({ data: [], error: null }),
  "u1",
);
assert.equal(sinResidencia.unavailable, false);

// El caso que motivó el tercer estado: la consulta falla. Antes esto devolvía
// `entries: []`, y de ahí `CreateButton` deducía `remaining = 0, limit = 0` y
// anunciaba "Agotaste tus 0 encuestas de este mes".
const rota = await quota.loadQuotaSummary(
  quotaEv({ data: null, error: { message: "boom", code: "57014" } }),
  "u1",
);
assert.equal(rota.unavailable, true);
assert.deepEqual(rota.entries, []);
assert.equal(rota.unlimited, false);

// Y lo que distingue los dos estados vacíos es exactamente ese campo: sin él,
// "no sé" y "no te queda" son el mismo objeto.
assert.notDeepEqual(rota, sinResidencia);
assert.equal(quota.quotaFor(rota, "mar-del-plata", "poll"), null);

// Moderación: sin tope en ningún nivel. `unlimited` no puede confundirse con
// el estado vacío, que también tiene todas las entradas sin tope (ninguna).
const modFilas = [
  { ...FILA, monthly_limit: null, remaining: null },
  { ...FILA, content_type: "debate", monthly_limit: null, remaining: null },
];
const moderacion = await quota.loadQuotaSummary(
  quotaEv({ data: modFilas, error: null }),
  "u1",
);
assert.equal(moderacion.unlimited, true);
assert.equal(moderacion.unavailable, false);
assert.equal(anonimo.unlimited, false);
assert.equal(rota.unlimited, false);

// Las constantes exportadas mantienen la misma distinción.
assert.equal(quota.EMPTY_QUOTA.unavailable, false);
assert.equal(quota.UNAVAILABLE_QUOTA.unavailable, true);

// `alternativesWithQuota` no puede ofrecer salidas cuando no sabe nada.
assert.deepEqual(
  quota.alternativesWithQuota(rota, "poll", "mar-del-plata"),
  [],
);

console.log(
  "✓ ayudantes compartidos · texto, XML, iniciales, rutas, origen, cron, cursor, cupo y relaciones",
);
