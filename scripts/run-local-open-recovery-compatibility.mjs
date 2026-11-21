import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CANDIDATE_MIGRATION_IDS } from "./production-preflight-policy.mjs";
import { EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS } from "./exceptional-open-recovery-capsule.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://127.0.0.1:4173";
const API = "http://127.0.0.1:54821";
const MAIL = "http://127.0.0.1:54824";
const DUMMY_SECRET = "1x0000000000000000000000000000000AA";
const DUMMY_TOKEN = "local-open-recovery-compatibility-token";
const NOTICE_HASH =
  "b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3";
const networkFetch = globalThis.fetch;
const completed = new Set();
let externalNetworkRequests = 0;
let server, browser, context, userId, secret, publicKey;
let accountCleanupConfirmed = false;
let pending = [];
let phase = "startup";
let interrupted = false;
let cleanupPromise;
const invariant = (value, message) => {
  if (!value) throw new Error(message);
};
const hash = (value) => createHash("sha256").update(value).digest("hex");

function localFetch(value, init) {
  const url = new URL(value instanceof Request ? value.url : value);
  if (
    url.origin === "https://challenges.cloudflare.com" &&
    url.pathname === "/turnstile/v0/siteverify"
  ) {
    const body = new URLSearchParams(init?.body);
    invariant(
      init?.method === "POST" &&
        body.get("secret") === DUMMY_SECRET &&
        body.get("response") === DUMMY_TOKEN,
      "Turnstile local recibió credenciales que no son de prueba.",
    );
    return Promise.resolve(Response.json({ success: true }));
  }
  if (
    url.username ||
    url.password ||
    ![API, MAIL, ORIGIN].includes(url.origin)
  ) {
    externalNetworkRequests += 1;
    throw new Error("La comprobación local bloqueó una salida no permitida.");
  }
  return networkFetch(value, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}
globalThis.fetch = localFetch;

function command(executable, args, input) {
  return execFileSync(executable, args, {
    cwd: ROOT,
    env: { ...process.env, DOCKER_HOST: "unix:///var/run/docker.sock" },
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}
function sql(source) {
  return command(
    "/usr/bin/docker",
    [
      "--host",
      "unix:///var/run/docker.sock",
      "exec",
      "-i",
      "supabase_db_agorbis",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-f",
      "-",
    ],
    source,
  );
}
function ledger() {
  const ids = sql(
    "select version from supabase_migrations.schema_migrations order by version;\n",
  )
    .trim()
    .split(/\r?\n/);
  assert.deepEqual(ids, CANDIDATE_MIGRATION_IDS);
  return ids;
}
function localCredentials() {
  const source = command(path.join(ROOT, "node_modules/.bin/supabase"), [
    "status",
    "-o",
    "env",
  ]);
  const values = Object.fromEntries(
    source.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|(.*))$/);
      return match ? [[match[1], match[2] ?? match[3] ?? ""]] : [];
    }),
  );
  invariant(
    values.API_URL === API &&
      (values.MAILPIT_URL ?? values.INBUCKET_URL) === MAIL &&
      values.PUBLISHABLE_KEY &&
      values.SECRET_KEY,
    "El stack de prueba no usa los endpoints locales fijados.",
  );
  return values;
}
async function api(pathname, { method = "GET", body, bearer = secret } = {}) {
  invariant(
    !interrupted || method === "DELETE",
    "La comprobación local fue interrumpida.",
  );
  const response = await localFetch(`${API}${pathname}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  invariant(response.ok, "Falló una operación del fixture local.");
  return response.status === 204 ? null : response.json();
}
async function cleanupAccount() {
  if (!userId || !secret) return;
  if (!cleanupPromise)
    cleanupPromise = api(`/auth/v1/admin/users/${userId}`, { method: "DELETE" })
      .then(() => {
        userId = undefined;
        accountCleanupConfirmed = true;
      })
      .finally(() => {
        cleanupPromise = undefined;
      });
  await cleanupPromise;
}
// A timeout sends SIGTERM. Preserve the same local cleanup path instead of
// exiting before finally; no new fixture or compatibility receipt is allowed.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"])
  process.on(signal, () => {
    interrupted = true;
    process.exitCode = 1;
    server?.closeAllConnections();
    if (context) void context.close().catch(() => {});
    if (browser) void browser.close().catch(() => {});
    void cleanupAccount().catch(() => {
      process.exitCode = 1;
    });
  });
function session(cookies) {
  const parts = cookies
    .filter((item) => /^sb-127-auth-token(?:\.\d+)?$/.test(item.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  invariant(
    parts.length && parts.every((item) => item.httpOnly),
    "No se obtuvo una sesión HttpOnly local.",
  );
  const encoded = parts.map((item) => decodeURIComponent(item.value)).join("");
  invariant(
    encoded.startsWith("base64-"),
    "Formato de sesión local desconocido.",
  );
  const value = JSON.parse(
    Buffer.from(encoded.slice(7), "base64url").toString(),
  );
  invariant(
    value.user?.id === userId &&
      typeof value.access_token === "string" &&
      !Object.hasOwn(value, "provider_token") &&
      !Object.hasOwn(value, "provider_refresh_token"),
    "La sesión final local no está saneada.",
  );
  return value;
}
const offlineWidget = `(()=>{let n=0;const c=new Map();window.turnstile={render(_el,o){const id=String(++n);c.set(id,o.callback);queueMicrotask(()=>o.callback(${JSON.stringify(DUMMY_TOKEN)}));return id},remove(id){c.delete(id)},reset(id){queueMicrotask(()=>c.get(id)?.(${JSON.stringify(DUMMY_TOKEN)}))}}})();`;

async function serve(artifactRoot, manifest) {
  invariant(!interrupted, "La comprobación local fue interrumpida.");
  const inventory = new Map(manifest.files.map((file) => [file.path, file]));
  const assets = {
    async fetch(request) {
      const url = new URL(request.url);
      const relative = `dist${decodeURIComponent(url.pathname)}`;
      const entry = inventory.get(relative);
      if (!entry || !relative.startsWith("dist/") || relative.includes(".."))
        return new Response("Not found", { status: 404 });
      const body = readFileSync(path.join(artifactRoot, relative));
      invariant(
        body.length === entry.size && hash(body) === entry.sha256,
        "Cambió un asset del fallback.",
      );
      const extension = path.extname(relative);
      const type =
        {
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".json": "application/json",
          ".png": "image/png",
          ".woff2": "font/woff2",
        }[extension] ?? "application/octet-stream";
      return new Response(request.method === "HEAD" ? null : body, {
        headers: { "Content-Type": type },
      });
    },
  };
  const { default: worker } = await import(
    pathToFileURL(path.join(artifactRoot, "dist/_worker.js")).href
  );
  invariant(
    typeof worker?.fetch === "function",
    "El fallback no exporta un Worker fetch.",
  );
  const env = {
    AGORBIS_LAUNCH_MODE: "open",
    AGORBIS_RUNTIME: "cloudflare-workers",
    ASSETS: assets,
    PUBLIC_SUPABASE_URL: API,
    PUBLIC_SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SECRET_KEY: secret,
    PUBLIC_SITE_URL: ORIGIN,
    PUBLIC_GOOGLE_AUTH_ENABLED: "false",
    PUBLIC_FACEBOOK_AUTH_ENABLED: "false",
    TURNSTILE_TESTING: "true",
    TURNSTILE_SECRET: DUMMY_SECRET,
    TURNSTILE_HOSTNAMES: "127.0.0.1",
    CRON_SECRET: "local-open-recovery-compatibility-only-secret",
  };
  server = createServer(async (incoming, outgoing) => {
    try {
      invariant(
        incoming.headers.host === "127.0.0.1:4173",
        "Host local inválido.",
      );
      const chunks = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        invariant(size < 5 * 1024 * 1024, "Body local excesivo.");
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(",") : value);
      headers.set("CF-Connecting-IP", "127.0.0.1");
      const request = new Request(`${ORIGIN}${incoming.url}`, {
        method: incoming.method,
        headers,
        ...(["GET", "HEAD"].includes(incoming.method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      });
      const response = await worker.fetch(request, env, {
        waitUntil(promise) {
          pending.push(Promise.resolve(promise));
        },
      });
      const resultHeaders = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) resultHeaders["set-cookie"] = cookies;
      outgoing.writeHead(response.status, resultHeaders);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500);
      outgoing.end("Local compatibility request failed.");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(4173, "127.0.0.1", resolve);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  invariant(
    argv.length === 4 &&
      argv[0] === "--artifact-root" &&
      argv[2] === "--artifact-hash" &&
      /^[a-f0-9]{64}$/.test(argv[3]) &&
      path.isAbsolute(argv[1]) &&
      realpathSync(argv[1]) === argv[1],
    "Argumentos locales inválidos.",
  );
  const artifactRoot = argv[1],
    recoveryArtifactHash = argv[3];
  const manifest = JSON.parse(readFileSync(`${artifactRoot}.json`, "utf8"));
  invariant(
    manifest.artifactPurpose === "recovery" &&
      manifest.contentSha256 === recoveryArtifactHash,
    "Se requiere el fallback congelado.",
  );
  const beforeFiles = manifest.files.map((file) => ({
    path: file.path,
    sha256: hash(readFileSync(path.join(artifactRoot, file.path))),
  }));
  invariant(
    beforeFiles.every(
      (file, index) => file.sha256 === manifest.files[index].sha256,
    ),
    "El fallback cambió antes de verificarlo.",
  );
  const migrationIds = ledger();
  phase = "local-sql";
  sql(
    readFileSync(
      path.join(ROOT, "supabase/tests/google_auth_consent_checks.sql"),
      "utf8",
    ),
  );
  ledger();
  completed.add("post-0067-database-compatibility");
  const noticeSql = sql(
    "select version || '|' || content_hash from public.google_auth_notice_versions where is_current = true;\n",
  ).trim();
  invariant(
    noticeSql === `2026-09-09.1|${NOTICE_HASH}`,
    "El aviso local no coincide con 0067.",
  );
  phase = "redaction-tests";
  const unit = JSON.parse(
    command(process.execPath, [
      path.join(ROOT, "node_modules/vitest/vitest.mjs"),
      "run",
      "src/lib/oauth-session.spec.ts",
      "src/lib/protected-auth-session.spec.ts",
      "--reporter=json",
    ]),
  );
  invariant(
    unit.success === true &&
      unit.numFailedTests === 0 &&
      unit.numPendingTests === 0 &&
      unit.numPassedTests > 0 &&
      unit.testResults?.length === 2 &&
      unit.testResults.every((result) => result.status === "passed"),
    "No se verificó la redacción OAuth local.",
  );
  phase = "local-worker";
  const values = localCredentials();
  secret = values.SECRET_KEY;
  publicKey = values.PUBLISHABLE_KEY;
  await serve(artifactRoot, manifest);
  const { chromium, expect } = await import("@playwright/test");
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    baseURL: ORIGIN,
    serviceWorkers: "block",
    acceptDownloads: false,
    locale: "es-AR",
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "https://challenges.cloudflare.com" &&
      /\/turnstile\/v0\/api\.js$/.test(url.pathname)
    )
      return route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: offlineWidget,
      });
    if (url.origin !== ORIGIN) {
      externalNetworkRequests += 1;
      return route.abort();
    }
    return route.continue();
  });
  const email = `recovery-compat-${randomUUID()}@agorbis.test`;
  const password = `Local-Compat-${randomUUID()}!`;
  const user = await api("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true },
  });
  userId = user.id;
  invariant(typeof userId === "string", "No se creó el fixture local.");
  const page = await context.newPage();
  const login = async (value) => {
    await page.goto(`${ORIGIN}/ingresar/?next=%2Fperfil%2Facceso-google`);
    await expect(
      page.getByRole("button", { name: "Continuar con Google", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continuar con Facebook", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Correo electrónico").first().fill(email);
    await page.locator('input[name="password"]').fill(value);
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
      DUMMY_TOKEN,
    );
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect
      .poll(async () =>
        (await context.cookies()).some((cookie) =>
          cookie.name.startsWith("sb-127-auth-token"),
        ),
      )
      .toBe(true);
    return session(await context.cookies());
  };
  phase = "email-login";
  let current = await login(password);
  const own = await api("/auth/v1/user", { bearer: current.access_token });
  invariant(own.id === userId, "La sesión no corresponde al fixture local.");
  completed.add("email-sign-in");
  completed.add("provider-token-redaction");
  phase = "google-withdrawal";
  await api("/rest/v1/rpc/grant_google_auth_consent", {
    method: "POST",
    bearer: current.access_token,
    body: {
      p_version: "2026-09-09.1",
      p_content_hash: NOTICE_HASH,
      p_started_at: new Date().toISOString(),
      p_locale: "es",
      p_expressly_accepted: true,
    },
  });
  await page.goto(`${ORIGIN}/perfil/acceso-google/`);
  await page
    .getByLabel(
      "Confirmo que quiero retirar mi consentimiento para acceder con Google.",
    )
    .check();
  await page
    .getByRole("button", {
      name: "Retirar consentimiento para Google",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Consentimiento retirado", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Consentimiento retirado", { exact: true }),
  ).toBeVisible();
  session(await context.cookies());
  completed.add("google-consent-withdrawal-0066");
  phase = "google-export";
  const exportedResponse = await page.request.get(`${ORIGIN}/perfil/datos/`);
  invariant(
    exportedResponse.status() === 200 &&
      exportedResponse.headers()["cache-control"]?.includes("no-store"),
    "La exportación local no es privada o no está disponible.",
  );
  const exported = await exportedResponse.json();
  invariant(
    exported.formato === 6 &&
      exported.cuentaYModeracion?.estadoDeConsentimientoDeAccesoConGoogle
        ?.status === "withdrawn" &&
      exported.cuentaYModeracion.estadoDeConsentimientoDeAccesoConGoogle
        .notice_version === "2026-09-09.1" &&
      exported.cuentaYModeracion.consentimientosDeAccesoConGoogle?.some(
        (item) => item.decision === "withdrawn",
      ),
    "La exportación perdió la decisión Google anterior.",
  );
  invariant(
    !JSON.stringify(exported).includes(current.access_token),
    "La exportación contiene una credencial local.",
  );
  completed.add("google-consent-export-0066");
  phase = "google-notice";
  await page.goto(`${ORIGIN}/acceso-google/`);
  await expect(
    page.getByRole("heading", {
      name: "Acceso opcional con Google",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Versión 2026-09-09.1", { exact: false }),
  ).toBeVisible();
  completed.add("google-notice-snapshot-0067");

  phase = "email-recovery-request";
  await context.clearCookies();
  const messages = await (await localFetch(`${MAIL}/api/v1/messages`)).json();
  const previous = new Set((messages.messages ?? []).map((item) => item.ID));
  await page.goto(`${ORIGIN}/recuperar/`);
  await page.getByLabel("Correo electrónico").fill(email);
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    DUMMY_TOKEN,
  );
  await page
    .getByRole("button", { name: "Enviar enlace", exact: true })
    .click();
  phase = "email-recovery-mail";
  let messageId;
  await expect
    .poll(
      async () => {
        const mail = await (await localFetch(`${MAIL}/api/v1/messages`)).json();
        messageId = (mail.messages ?? []).find(
          (item) =>
            !previous.has(item.ID) &&
            item.To?.some((recipient) => recipient.Address === email),
        )?.ID;
        return Boolean(messageId);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  const message = await (
    await localFetch(`${MAIL}/api/v1/message/${messageId}`)
  ).json();
  const mailBody = `${message.HTML ?? ""}\n${message.Text ?? ""}`.replaceAll(
    "&amp;",
    "&",
  );
  const href = [...mailBody.matchAll(/https?:\/\/[^\s"'<>]+/g)]
    .map((match) => match[0])
    .find(
      (value) =>
        value.startsWith(`${ORIGIN}/auth/confirm`) &&
        new URL(value).searchParams.get("type") === "recovery",
    );
  invariant(href, "No se recibió un enlace de recuperación local.");
  phase = "email-recovery-confirm";
  await page.goto(href);
  await page
    .getByRole("button", {
      name: "Continuar para cambiar contraseña",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/perfil\/contrasena\/?\?recovery=1$/);
  phase = "email-recovery-password";
  const changedPassword = `Changed-Compat-${randomUUID()}!`;
  await page.locator('input[name="password"]').fill(changedPassword);
  await page.getByLabel("Repetí la contraseña nueva").fill(changedPassword);
  await page
    .getByRole("button", { name: "Guardar contraseña", exact: true })
    .click();
  await expect(
    page.getByText(
      "Listo: tu contraseña quedó guardada. Ya podés usarla para ingresar.",
      { exact: true },
    ),
  ).toBeVisible();
  await context.clearCookies();
  phase = "email-recovery-new-login";
  current = await login(changedPassword);
  current.access_token = "";
  current.refresh_token = "";
  completed.add("email-recovery");
  phase = "cleanup";
  await context.close();
  context = undefined;
  await browser.close();
  browser = undefined;
  await Promise.race([
    Promise.all(pending),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Las tareas locales no finalizaron.")),
        5000,
      ),
    ),
  ]);
  pending = [];
  await cleanupAccount();
  ledger();
  invariant(
    !interrupted &&
      externalNetworkRequests === 0 &&
      EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.every((id) => completed.has(id)),
    "La comprobación no completó los siete checks aislados.",
  );
  invariant(
    beforeFiles.every(
      (file) =>
        hash(readFileSync(path.join(artifactRoot, file.path))) === file.sha256,
    ),
    "Cambió el fallback durante la comprobación.",
  );
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
  return {
    schemaVersion: "agorbis-local-open-recovery-observation/v1",
    scope: "frozen-worker-node-local-supabase-offline-turnstile",
    recoveryArtifactHash,
    migrationIds,
    checks: EXCEPTIONAL_OPEN_RECOVERY_CHECK_IDS.map((id) => ({
      id,
      status: "PASS",
    })),
    accountCleanupConfirmed,
    externalNetworkRequests,
    completedAtUtc: new Date().toISOString(),
  };
}

try {
  const result = await main();
  invariant(!interrupted, "La comprobación local fue interrumpida.");
  await new Promise((resolve) =>
    process.stdout.write(`${JSON.stringify(result)}\n`, resolve),
  );
} catch {
  process.stderr.write(
    `La compatibilidad del fallback local no pudo verificarse (${phase}); no hay evidencia de publicación.\n`,
  );
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await cleanupAccount().catch(() => {
    process.exitCode = 1;
  });
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await Promise.race([
    Promise.allSettled(pending),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  secret = undefined;
  publicKey = undefined;
  // The imported Worker may leave SDK timers alive. All requests, browsers,
  // accounts and server handles have already been closed before this exit.
  process.exit(process.exitCode ?? 0);
}
