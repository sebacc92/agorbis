import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

const seededEmail = process.env.E2E_USER_EMAIL ?? "sofia@agorbis.test";
const seededPassword =
  process.env.E2E_USER_PASSWORD ?? "AgorbisLocal-2026!";
const seededUserId =
  process.env.E2E_USER_ID ?? "33333333-3333-4333-8333-333333333333";
const recoveryPassword = "AgorbisRecovery-2026!";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54824";
const moderatorEmail = "moderador@agorbis.test";
const moderatorTotpSecret = "KRUGS4ZANFZSAYJA";
const supabaseCaptchaToken = "XXXX.DUMMY.TOKEN.XXXX";

type EmailOtpType = "signup" | "recovery" | "magiclink" | "email_change";

interface MailSummary {
  ID: string;
  Subject?: string;
  To?: { Address?: string }[];
}

interface MailMessage {
  HTML?: string;
  Subject?: string;
  Text?: string;
}

async function mailSummariesFor(address: string): Promise<MailSummary[]> {
  const response = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!response.ok) throw new Error(`Mailpit respondió ${response.status}.`);
  const data = (await response.json()) as { messages?: MailSummary[] };
  return (data.messages ?? []).filter((message) =>
    message.To?.some(
      (recipient) => recipient.Address?.toLowerCase() === address.toLowerCase(),
    ),
  );
}

async function mailIdsFor(address: string): Promise<Set<string>> {
  return new Set(
    (await mailSummariesFor(address)).map((message) => message.ID),
  );
}

async function waitForNewMail(
  address: string,
  previousMessages: Set<string>,
  expectedSubject?: string,
): Promise<string> {
  let messageId = "";
  await expect
    .poll(
      async () => {
        const current = await mailSummariesFor(address);
        messageId =
          current.find(
            (candidate) =>
              !previousMessages.has(candidate.ID) &&
              (!expectedSubject || candidate.Subject === expectedSubject),
          )?.ID ?? "";
        return messageId;
      },
      { timeout: 20_000, intervals: [250, 500, 1_000] },
    )
    .not.toBe("");
  return messageId;
}

async function mailMessage(messageId: string): Promise<MailMessage> {
  const response = await fetch(`${mailpitUrl}/api/v1/message/${messageId}`);
  if (!response.ok) throw new Error(`Mailpit respondió ${response.status}.`);
  return (await response.json()) as MailMessage;
}

function mailBody(message: MailMessage): string {
  return `${message.Text ?? ""}\n${message.HTML ?? ""}`;
}

async function expectMail(
  messageId: string,
  subject: string,
  bodyFragment: string,
): Promise<void> {
  const message = await mailMessage(messageId);
  expect(message.Subject).toBe(subject);
  expect(mailBody(message)).toContain(bodyFragment);
}

async function reauthenticationCode(messageId: string): Promise<string> {
  const match = mailBody(await mailMessage(messageId)).match(/\b(\d{6})\b/);
  if (!match) {
    throw new Error("El correo de reautenticación no contiene un código de 6 dígitos.");
  }
  return match[1];
}

async function confirmationHref(
  messageId: string,
  expectedType: EmailOtpType,
): Promise<string> {
  const message = await mailMessage(messageId);
  const links = [...(message.HTML ?? "").matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .concat((message.Text ?? "").match(/https?:\/\/\S+/g) ?? []);
  const href = links.find((candidate) => {
    try {
      const url = new URL(candidate);
      return (
        url.pathname.replace(/\/$/, "") === "/auth/confirm" &&
        url.searchParams.get("type") === expectedType &&
        !!url.searchParams.get("token_hash")
      );
    } catch {
      return false;
    }
  });
  if (!href) {
    throw new Error(
      `El correo no contiene un enlace /auth/confirm seguro de tipo ${expectedType}.`,
    );
  }
  return href;
}

function adminClient() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("Faltan credenciales locales de Supabase para los E2E.");
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userClient() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Faltan credenciales locales de Supabase para los E2E.");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function waitForTurnstile(page: Page): Promise<void> {
  const token = page.locator('input[name="turnstile_token"]');
  await expect(token).toHaveCount(1);
  // TurnstileGate carga el SDK recién cuando el widget entra en pantalla
  // (`useVisibleTask$`). Con los acuerdos del alta queda debajo del pliegue
  // a 1280×720; se desplaza hasta él como haría quien llega a "Crear cuenta".
  await page.getByLabel("Verificación antiabuso").scrollIntoViewIfNeeded();
  await expect(token).toHaveValue(/\S+/, { timeout: 20_000 });
}

function totpCode(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replaceAll("=", "").toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Secreto TOTP base32 inválido.");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
    ),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) >>>
    0;
  return String(binary % 1_000_000).padStart(6, "0");
}

async function deleteUserByEmail(email: string): Promise<void> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1_000,
  });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) return;
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) throw deleteError;
}

async function createConfirmedLegalUser(email: string): Promise<string> {
  const admin = adminClient();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: seededPassword,
      email_confirm: true,
    });
  if (createError || !created.user) {
    throw createError ?? new Error("No se creó la cuenta E2E.");
  }

  const userId = created.user.id;
  // Desde 0049 ninguna credencial de servicio puede aceptar términos en
  // nombre de otra persona. El fixture confirma primero el correo y registra
  // la aceptación con la sesión real que acaba de crear.
  try {
    await acceptCurrentLegal(email, seededPassword);
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    throw error;
  }
  return userId;
}

async function acceptCurrentLegal(
  email: string,
  password: string,
): Promise<void> {
  const user = userClient();
  try {
    const { error: signInError } = await user.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: supabaseCaptchaToken },
    });
    if (signInError) throw signInError;
    const { error: legalError } = await user.rpc("accept_current_legal", {
      p_minimum_age_attested: true,
    });
    if (legalError) throw legalError;
    const { error: transferError } = await user.rpc(
      "grant_current_international_transfer_consent",
      {
        p_expressly_accepted: true,
        p_locale: "es",
        p_version: "2026-08-29.1",
      },
    );
    if (transferError) throw transferError;
  } finally {
    await user.auth.signOut();
  }
}

async function restoreSeededPassword(): Promise<void> {
  const { error } = await adminClient().auth.admin.updateUserById(
    seededUserId,
    { password: seededPassword },
  );
  if (error) throw error;
}

function ageUserSessions(userId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("El usuario E2E no tiene un UUID válido.");
  }

  const output = execFileSync(
    "docker",
    [
      "exec",
      process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_agorbis",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `update auth.sessions set created_at = now() - interval '25 hours' where user_id = '${userId}'`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!/UPDATE [1-9]\d*/.test(output)) {
    throw new Error("No se encontró una sesión E2E para envejecer.");
  }
}

async function submitEmailConfirmation(
  page: import("@playwright/test").Page,
  buttonName: string,
) {
  const form = page.locator('form[method="post"]');
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: buttonName }).click();
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}@agorbis.test`;
}

function hasAuthenticatedSession(
  cookies: readonly { name: string }[],
): boolean {
  return cookies.some(
    (cookie) =>
      cookie.name.startsWith("sb-") &&
      cookie.name.includes("-auth-token") &&
      !cookie.name.includes("code-verifier"),
  );
}

test.describe("superficie pública", () => {
  for (const path of [
    "/",
    "/explorar/",
    "/manual/",
    "/c/earth/",
    "/privacidad/",
    "/terminos/",
    "/normas-comunitarias/",
    "/moderacion-y-apelaciones/",
    "/subencargados/",
    "/transferencias-internacionales/",
  ]) {
    test(`${path} responde y conserva el shell`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.locator("main#contenido")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();
    });
  }

  test("los headers defensivos se aplican al documento", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers()["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  test("los IDs malformados son 404 y no errores internos", async ({ request }) => {
    for (const resource of ["encuestas", "debates", "reclamos", "proyectos"]) {
      const response = await request.get(`/${resource}/no-es-uuid/`);
      expect(response.status(), resource).toBe(404);
      expect(await response.text()).not.toContain("invalid input syntax for type uuid");
    }
  });

  test("los crons fallan cerrados sin secreto", async ({ request }) => {
    for (const path of [
      "/internal/cleanup-claim-uploads/",
      "/internal/escalate-claims/",
      "/internal/process-account-deletions/",
      "/internal/purge-retained-data/",
      "/internal/sync-notifications/",
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  });

  test("health comprueba la base sin exponer configuración", async ({ request }) => {
    const response = await request.get("/internal/health/");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: { database: "ok", auth: "ok", storage: "ok" },
    });
  });

  test("Widget B rechaza las cinco llamadas Auth públicas sin CAPTCHA", async () => {
    const url = process.env.PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !publishableKey) {
      throw new Error("Falta la configuración pública local de Supabase.");
    }
    const headers = {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
    };
    const probes = [
      ["/auth/v1/signup", { email: "invalid", password: "x" }],
      [
        "/auth/v1/token?grant_type=password",
        { email: "invalid", password: "x" },
      ],
      ["/auth/v1/otp", { email: "invalid", create_user: false }],
      ["/auth/v1/recover", { email: "invalid" }],
      ["/auth/v1/resend", { type: "signup", email: "invalid" }],
    ] as const;

    for (const [path, body] of probes) {
      const response = await fetch(`${url}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const error = (await response.json()) as {
        code?: number | string;
        error_code?: string;
      };
      expect(response.status, path).toBe(400);
      expect(error.error_code ?? error.code, path).toBe("captcha_failed");
    }
  });

  test("el alta exige contraseña fuerte y acuerdos; respeta los proveedores habilitados", async ({
    page,
  }) => {
    await page.goto("/registro/");
    await expect(page).toHaveTitle(/Agorbis/);
    for (const [provider, flag] of [
      ["Google", "PUBLIC_GOOGLE_AUTH_ENABLED"],
      ["Facebook", "PUBLIC_FACEBOOK_AUTH_ENABLED"],
    ]) {
      await expect(
        page.getByRole("button", { name: `Continuar con ${provider}` }),
      ).toHaveCount(process.env[flag] === "true" ? 1 : 0);
    }
    await expect(page.locator("input#password")).toHaveAttribute(
      "minlength",
      "12",
    );
    // Desde 2ed0a3d el alta tiene una casilla legal unificada (edad +
    // Términos + Normas + Privacidad) y otra separada para transferencias.
    const legalConsent = page.getByLabel(
      /Confirmo que tengo 18 años o más, acepto los/,
    );
    await expect(legalConsent).toHaveAttribute("required", "");
    await expect(legalConsent).not.toBeChecked();
    for (const derived of [
      "age_confirmed",
      "terms_accepted",
      "privacy_acknowledged",
      "community_rules_accepted",
    ]) {
      await expect(
        page.locator(`input[type="hidden"][name="${derived}"]`),
      ).toHaveValue("");
    }
    await expect(
      page.getByLabel(/Consiento expresamente las transferencias/),
    ).toHaveAttribute("required", "");
    await expect(
      page.getByLabel(/Consiento expresamente las transferencias/),
    ).not.toBeChecked();
    // El formulario de un solo paso monta el widget antiabuso junto con los
    // acuerdos; el token sigue vacío hasta que Turnstile lo resuelve.
    await expect(page.locator('input[name="turnstile_token"]')).toHaveCount(1);
  });

  for (const next of [undefined, "/c/mar-del-plata/reclamos/nuevo/"] as const) {
    test(`el alta real confirma el correo sólo después del POST explícito (${next ? "con destino de publicación" : "sin destino"})`, async ({
      browser,
      context,
      page,
    }) => {
      test.setTimeout(120_000);
      const localHosts = ["127.0.0.1", "localhost"];
      const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
      if (!supabaseUrl || !localHosts.includes(new URL(supabaseUrl).hostname) || !localHosts.includes(new URL(mailpitUrl).hostname)) {
        throw new Error("El alta completa sólo puede probarse con Supabase y Mailpit locales.");
      }
      const expectedNext = next ?? "/onboarding";
      const email = uniqueEmail("alta-e2e");
      const previousMessages = await mailIdsFor(email);
      let replayContext: import("@playwright/test").BrowserContext | undefined;

      try {
        await page.goto(`/registro/${next ? `?next=${encodeURIComponent(next)}` : ""}`);
        await page.getByLabel("Correo electrónico").fill(email);
        await page.locator("input#password").fill(seededPassword);
        await page
          .getByLabel(/Confirmo que tengo 18 años o más, acepto los/)
          .check();
        await page
          .getByLabel(/Consiento expresamente las transferencias/)
          .check();
        await waitForTurnstile(page);
        await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();

        await expect(page.getByRole("heading", { name: "Revisá tu correo" })).toBeVisible();
        const messageId = await waitForNewMail(email, previousMessages);
        const href = await confirmationHref(messageId, "signup");
        const confirmationUrl = new URL(href);
        expect(confirmationUrl.origin).toBe(new URL(page.url()).origin);
        expect(confirmationUrl.searchParams.get("next")).toBe(expectedNext);

        await page.goto(href);
        await expect(page).toHaveURL(/\/auth\/confirm\/?\?/);
        await expect(
          page.getByRole("button", { name: "Confirmar correo" }),
        ).toBeVisible();
        expect(hasAuthenticatedSession(await context.cookies())).toBe(false);

        // Ni los scanners de correo ni una recarga deben gastar el token.
        await page.reload();
        expect(hasAuthenticatedSession(await context.cookies())).toBe(false);
        await submitEmailConfirmation(page, "Confirmar correo");
        await expect(page).toHaveURL(
          (url) => url.pathname.replace(/\/$/, "") === "/consentimiento" && url.searchParams.get("next") === expectedNext,
        );
        expect(hasAuthenticatedSession(await context.cookies())).toBe(true);

        // El mismo token no puede abrir una segunda sesión.
        replayContext = await browser.newContext();
        const replayPage = await replayContext.newPage();
        await replayPage.goto(href);
        await submitEmailConfirmation(replayPage, "Confirmar correo");
        await expect(replayPage).not.toHaveURL((url) => url.pathname.replace(/\/$/, "") === "/onboarding");
        expect(hasAuthenticatedSession(await replayContext.cookies())).toBe(
          false,
        );

        // Confirmar la identidad no equivale a aceptar documentos. La cuenta
        // sólo continúa tras una aceptación autenticada y explícita.
        // D108: las mismas dos casillas que el registro.
        const legalConsent = page.getByLabel(/Confirmo que tengo 18 años o más, acepto los/);
        const transferConsent = page.getByLabel(/Consiento expresamente las transferencias/);
        await expect(legalConsent).not.toBeChecked();
        await expect(transferConsent).not.toBeChecked();
        await expect(page.getByRole("link", { name: "Volver a mi perfil" })).toHaveCount(0);
        // D110: el progreso común marca el paso y el aviso del layout no se
        // repite sobre la propia página de acuerdos.
        const progress = page.getByRole("navigation", { name: "Progreso del registro" });
        await expect(progress.locator('[aria-current="step"]')).toContainText("Acuerdos");
        await expect(page.getByRole("link", { name: "Revisar documentos" })).toHaveCount(0);
        await legalConsent.check();
        await transferConsent.check();
        await page.getByRole("button", { name: "Aceptar y continuar" }).click();
        await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === "/onboarding" && url.searchParams.get("next") === (next ?? null));
        await expect(page.locator('form input[name="next"]')).toHaveValue(next ?? "");

        await expect(progress.locator('[aria-current="step"]')).toContainText("Tu nombre");
        const username = `alta_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
        await page.getByRole("textbox", { name: "Nombre de usuario", exact: true }).fill(username);
        await page.getByRole("button", { name: "Continuar", exact: true }).click();
        await expect(page).toHaveURL((url) => url.searchParams.get("paso") === "lugar" && url.searchParams.get("next") === (next ?? null));

        // El buscador GET y el enlace de elección también deben conservar next.
        await page.getByRole("searchbox", { name: "Buscar ciudad, barrio o municipio por nombre" }).fill("Mar del Plata");
        await page.getByRole("button", { name: "Buscar", exact: true }).click();
        await expect(page).toHaveURL((url) => url.searchParams.get("q") === "Mar del Plata" && (url.searchParams.get("next") || null) === (next ?? null));
        await page.locator('a[href*="paso=confirmar"][href*="c=mar-del-plata"]').first().click();
        await expect(page.getByRole("heading", { name: "Confirmá tu comunidad", exact: true })).toBeVisible();
        await expect(page).toHaveURL((url) => url.searchParams.get("c") === "mar-del-plata" && url.searchParams.get("next") === (next ?? null));
        await expect(page.locator('form input[name="next"]')).toHaveValue(next ?? "");
        await page.getByRole("button", { name: "Confirmar y entrar", exact: true }).click();
        await expect(page).toHaveURL((url) => url.pathname === (next ?? "/c/mar-del-plata/"));
        if (next) {
          await expect(page.getByRole("heading", { name: "Nuevo reclamo", exact: true })).toBeVisible();
          await expect(page.locator('input[name="community_slug"]')).toHaveValue("mar-del-plata");
        }
      } finally {
        try {
          await replayContext?.close();
        } finally {
          await deleteUserByEmail(email);
        }
      }
    });
  }

  test("el reenvío funciona sin revelar si una cuenta está pendiente", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const pendingEmail = uniqueEmail("reenvio-pendiente-e2e");
    const unknownEmail = uniqueEmail("reenvio-inexistente-e2e");
    const genericMessage =
      "Si existe una cuenta pendiente con ese correo, vas a recibir un enlace en unos minutos.";
    const admin = adminClient();
    const { error } = await admin.auth.admin.createUser({
      email: pendingEmail,
      password: seededPassword,
      email_confirm: false,
    });
    if (error) throw error;

    try {
      const previousMessages = await mailIdsFor(pendingEmail);
      await page.goto("/reenviar-confirmacion/");
      await page.getByLabel("Correo electrónico").fill(pendingEmail);
      await waitForTurnstile(page);
      await page
        .getByRole("button", { name: "Reenviar confirmación" })
        .click();
      await expect(page.getByText(genericMessage)).toBeVisible();

      const messageId = await waitForNewMail(pendingEmail, previousMessages);
      await confirmationHref(messageId, "signup");

      await page.goto("/reenviar-confirmacion/");
      await page.getByLabel("Correo electrónico").fill(unknownEmail);
      await waitForTurnstile(page);
      await page
        .getByRole("button", { name: "Reenviar confirmación" })
        .click();
      await expect(page.getByText(genericMessage)).toBeVisible();
    } finally {
      await deleteUserByEmail(pendingEmail);
    }
  });

  test("el magic link inicia sesión sólo por POST y no admite reuso", async ({
    browser,
    context,
    page,
  }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("magic-e2e");
    const userId = await createConfirmedLegalUser(email);
    const previousMessages = await mailIdsFor(email);
    let replayContext: import("@playwright/test").BrowserContext | undefined;

    try {
      await page.goto("/ingresar/?next=%2Fperfil");
      await page
        .getByRole("tab", {
          name: "Con un enlace",
        })
        .click();
      await page.locator("input#magic-email").fill(email);
      await waitForTurnstile(page);
      await page.getByRole("button", { name: "Enviarme el enlace" }).click();
      await expect(page.getByRole("heading", { name: "Revisá tu correo" })).toBeVisible();

      const messageId = await waitForNewMail(
        email,
        previousMessages,
        "Agorbis · Enlace de acceso / Sign-in link",
      );
      await expectMail(
        messageId,
        "Agorbis · Enlace de acceso / Sign-in link",
        "Este enlace inicia sesión en tu cuenta",
      );
      const href = await confirmationHref(messageId, "magiclink");

      await page.goto(href);
      await expect(page.getByRole("button", { name: "Entrar a Agorbis" })).toBeVisible();
      expect(hasAuthenticatedSession(await context.cookies())).toBe(false);

      // Un GET y una recarga no gastan el token ni abren una sesión.
      await page.reload();
      expect(hasAuthenticatedSession(await context.cookies())).toBe(false);
      await submitEmailConfirmation(page, "Entrar a Agorbis");
      // Sin residencia, /perfil pasa por el onboarding y conserva el destino.
      await expect(page).toHaveURL(
        (url) =>
          url.pathname.replace(/\/$/, "") === "/onboarding" &&
          url.searchParams.get("next") === "/perfil",
      );
      expect(hasAuthenticatedSession(await context.cookies())).toBe(true);

      replayContext = await browser.newContext();
      const replayPage = await replayContext.newPage();
      await replayPage.goto(href);
      await submitEmailConfirmation(replayPage, "Entrar a Agorbis");
      await expect(replayPage).not.toHaveURL(
        (url) => url.pathname.replace(/\/$/, "") === "/onboarding",
      );
      expect(hasAuthenticatedSession(await replayContext.cookies())).toBe(
        false,
      );
    } finally {
      try {
        await replayContext?.close();
      } finally {
        const { error } = await adminClient().auth.admin.deleteUser(userId);
        expect.soft(error).toBeNull();
      }
    }
  });

  test("recuperación responde sin revelar si el correo existe", async ({
    page,
  }) => {
    await page.goto("/recuperar/");
    await page
      .getByLabel("Correo electrónico")
      .fill("cuenta-inexistente@agorbis.test");
    await waitForTurnstile(page);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(
      page.getByText(
        "Si existe una cuenta con ese correo, vas a recibir un enlace en unos minutos.",
      ),
    ).toBeVisible();
  });

  test("recuperación completa exige POST, rechaza el reuso y permite fijar una contraseña", async ({
    browser,
    page,
  }) => {
    test.setTimeout(90_000);
    const previousMessages = await mailIdsFor(seededEmail);
    let replayContext: import("@playwright/test").BrowserContext | undefined;

    try {
      await page.goto("/recuperar/");
      await page.getByLabel("Correo electrónico").fill(seededEmail);
      await waitForTurnstile(page);
      await page.getByRole("button", { name: "Enviar enlace" }).click();
      await expect(
        page.getByText(
          "Si existe una cuenta con ese correo, vas a recibir un enlace en unos minutos.",
        ),
      ).toBeVisible();

      const messageId = await waitForNewMail(seededEmail, previousMessages);
      const href = await confirmationHref(messageId, "recovery");

      await page.goto(href);
      await expect(page).toHaveURL(/\/auth\/confirm\/?\?/);
      await expect(
        page.getByRole("button", {
          name: "Continuar para cambiar contraseña",
        }),
      ).toBeVisible();
      await page.reload();
      await submitEmailConfirmation(
        page,
        "Continuar para cambiar contraseña",
      );
      await expect(page).toHaveURL(/\/perfil\/contrasena\/?\?recovery=1$/);
      await expect(page.getByText("El enlace fue validado.")).toBeVisible();

      replayContext = await browser.newContext();
      const replayPage = await replayContext.newPage();
      await replayPage.goto(href);
      await submitEmailConfirmation(
        replayPage,
        "Continuar para cambiar contraseña",
      );
      await expect(replayPage).not.toHaveURL(
        /\/perfil\/contrasena\/?\?recovery=1$/,
      );
      expect(hasAuthenticatedSession(await replayContext.cookies())).toBe(
        false,
      );

      const beforePasswordNotification = await mailIdsFor(seededEmail);
      await page.locator('input[name="password"]').fill(recoveryPassword);
      await page
        .getByLabel("Repetí la contraseña nueva")
        .fill(recoveryPassword);
      await page.getByRole("button", { name: "Guardar contraseña" }).click();
      await expect(
        page.getByText("Listo: tu contraseña quedó guardada."),
      ).toBeVisible();
      const notificationId = await waitForNewMail(
        seededEmail,
        beforePasswordNotification,
        "Agorbis · Contraseña actualizada / Password changed",
      );
      await expectMail(
        notificationId,
        "Agorbis · Contraseña actualizada / Password changed",
        "Tu contraseña cambió",
      );
    } finally {
      try {
        await replayContext?.close();
      } finally {
        await restoreSeededPassword();
      }
    }
  });
});

test.describe("sesión autenticada", () => {
  test("una sesión antigua exige el OTP de reautenticación antes de cambiar la contraseña", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail("reauth-e2e");
    const changedPassword = "AgorbisReauth-2026!";
    const userId = await createConfirmedLegalUser(email);

    try {
      await page.goto("/ingresar/?next=%2Fperfil");
      await page.getByLabel("Correo electrónico").first().fill(email);
      await page.locator('input[name="password"]').fill(seededPassword);
      await waitForTurnstile(page);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(page).toHaveURL(/\/perfil\/?$/);

      // GoTrue decide la reautenticación por auth.sessions.created_at. Envejecer
      // la única sesión de esta identidad efímera reproduce las 24 horas sin
      // esperas ni tokens fabricados.
      ageUserSessions(userId);
      const beforeReauthentication = await mailIdsFor(email);

      await page.goto("/perfil/contrasena/");
      await page.locator('input[name="current"]').fill(seededPassword);
      await page.locator('input[name="password"]').fill(changedPassword);
      await page.locator('input[name="confirm"]').fill(changedPassword);
      await page.getByRole("button", { name: "Guardar contraseña" }).click();

      await expect(page.locator('input[name="nonce"]')).toBeVisible();
      await expect(
        page.getByText("te enviamos un código de seguridad", { exact: false }),
      ).toBeVisible();
      const reauthenticationId = await waitForNewMail(
        email,
        beforeReauthentication,
        "Agorbis · Código de seguridad / Security code",
      );
      await expectMail(
        reauthenticationId,
        "Agorbis · Código de seguridad / Security code",
        "Confirmá que sos vos",
      );
      const code = await reauthenticationCode(reauthenticationId);
      const beforePasswordNotification = await mailIdsFor(email);

      // El action vuelve a renderizar el mismo formulario. Reescribimos todos
      // los secretos para que la prueba no dependa de la preservación del DOM.
      await page.locator('input[name="current"]').fill(seededPassword);
      await page.locator('input[name="nonce"]').fill(code);
      await page.locator('input[name="password"]').fill(changedPassword);
      await page.locator('input[name="confirm"]').fill(changedPassword);
      await page.getByRole("button", { name: "Guardar contraseña" }).click();
      await expect(
        page.getByText("Listo: tu contraseña quedó guardada."),
      ).toBeVisible();

      const notificationId = await waitForNewMail(
        email,
        beforePasswordNotification,
        "Agorbis · Contraseña actualizada / Password changed",
      );
      await expectMail(
        notificationId,
        "Agorbis · Contraseña actualizada / Password changed",
        "Tu contraseña cambió",
      );

      const verifier = userClient();
      const { error } = await verifier.auth.signInWithPassword({
        email,
        password: changedPassword,
        options: { captchaToken: supabaseCaptchaToken },
      });
      expect(error).toBeNull();
      await verifier.auth.signOut();
    } finally {
      const { error } = await adminClient().auth.admin.deleteUser(userId);
      expect.soft(error).toBeNull();
    }
  });

  test("el cambio de correo exige confirmar ambas direcciones y avisa a la anterior", async ({
    browser,
    page,
  }) => {
    test.setTimeout(90_000);
    const oldEmail = uniqueEmail("email-anterior-e2e");
    const newEmail = uniqueEmail("email-nuevo-e2e");
    const userId = await createConfirmedLegalUser(oldEmail);
    const client = userClient();
    let replayContext: import("@playwright/test").BrowserContext | undefined;

    try {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: oldEmail,
        password: seededPassword,
        options: { captchaToken: supabaseCaptchaToken },
      });
      if (signInError) throw signInError;

      const beforeOldMail = await mailIdsFor(oldEmail);
      const beforeNewMail = await mailIdsFor(newEmail);
      const { error: updateError } = await client.auth.updateUser(
        { email: newEmail },
        {
          emailRedirectTo: `${process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173"}/auth/confirm?next=%2Fperfil`,
        },
      );
      if (updateError) throw updateError;

      const [oldConfirmationId, newConfirmationId] = await Promise.all([
        waitForNewMail(
          oldEmail,
          beforeOldMail,
          "Agorbis · Confirmá tu nuevo correo / Confirm your new email",
        ),
        waitForNewMail(
          newEmail,
          beforeNewMail,
          "Agorbis · Confirmá tu nuevo correo / Confirm your new email",
        ),
      ]);
      const [oldHref, newHref] = await Promise.all([
        confirmationHref(oldConfirmationId, "email_change"),
        confirmationHref(newConfirmationId, "email_change"),
      ]);
      expect(new URL(oldHref).searchParams.get("token_hash")).not.toBe(
        new URL(newHref).searchParams.get("token_hash"),
      );

      const firstUrl = new URL(oldHref);
      await page.goto(`${firstUrl.pathname}${firstUrl.search}`);
      await page.reload();
      await submitEmailConfirmation(page, "Confirmar cambio de correo");
      await expect(
        page.getByText("Confirmamos una de las dos direcciones."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Confirmar cambio de correo" }),
      ).toHaveCount(0);
      const afterFirst = await adminClient().auth.admin.getUserById(userId);
      expect(afterFirst.error).toBeNull();
      expect(afterFirst.data.user?.email).toBe(oldEmail);

      const beforeChangedNotification = await mailIdsFor(oldEmail);
      const secondUrl = new URL(newHref);
      await page.goto(`${secondUrl.pathname}${secondUrl.search}`);
      await submitEmailConfirmation(page, "Confirmar cambio de correo");
      await expect(page).toHaveURL(/\/perfil\/?$/);
      const afterSecond = await adminClient().auth.admin.getUserById(userId);
      expect(afterSecond.error).toBeNull();
      expect(afterSecond.data.user?.email).toBe(newEmail);

      const notificationId = await waitForNewMail(
        oldEmail,
        beforeChangedNotification,
        "Agorbis · Correo actualizado / Email changed",
      );
      const notification = await mailMessage(notificationId);
      expect(notification.Subject).toBe(
        "Agorbis · Correo actualizado / Email changed",
      );
      expect(mailBody(notification)).toContain(oldEmail);
      expect(mailBody(notification)).toContain(newEmail);

      replayContext = await browser.newContext();
      const replayPage = await replayContext.newPage();
      await replayPage.goto(`${firstUrl.pathname}${firstUrl.search}`);
      await submitEmailConfirmation(replayPage, "Confirmar cambio de correo");
      await expect(replayPage).not.toHaveURL(/\/perfil\/?$/);
      expect(hasAuthenticatedSession(await replayContext.cookies())).toBe(
        false,
      );
    } finally {
      try {
        await replayContext?.close();
        await client.auth.signOut();
      } finally {
        const { error } = await adminClient().auth.admin.deleteUser(userId);
        expect.soft(error).toBeNull();
      }
    }
  });

  test("abrir una notificación muta sólo por POST propio y redirige de forma segura", async ({
    page,
  }) => {
    const email = uniqueEmail("notificacion-post-e2e");
    const userId = await createConfirmedLegalUser(email);
    const admin = adminClient();
    const title = "Abrir notificación segura E2E";

    try {
      const { data: notification, error: notificationError } = await admin
        .from("notifications")
        .insert({
          recipient_id: userId,
          type: "e2e",
          title,
          href: "/perfil",
          dedupe_key: `e2e-notification-open:${userId}`,
        })
        .select("id")
        .single();
      if (notificationError || !notification) {
        throw notificationError ?? new Error("No se creó la notificación E2E.");
      }

      await page.goto("/ingresar/?next=%2Fnotificaciones");
      await page.getByLabel("Correo electrónico").first().fill(email);
      await page.locator('input[name="password"]').fill(seededPassword);
      await waitForTurnstile(page);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(page).toHaveURL(/\/notificaciones\/?$/);

      const csrfResponse = await page.request.post(
        "/notificaciones/abrir/",
        {
          form: { id: notification.id },
          headers: { Origin: "https://ataque.invalid" },
          maxRedirects: 0,
        },
      );
      expect(csrfResponse.status()).toBe(403);

      // Un scanner o prefetch que conserva la URL histórica sólo recibe una
      // redirección inocua: GET no consume ni marca la notificación.
      const getResponse = await page.request.get(
        `/notificaciones/abrir/?id=${notification.id}`,
        { maxRedirects: 0 },
      );
      expect(getResponse.status()).toBe(303);

      const { data: before, error: beforeError } = await admin
        .from("notifications")
        .select("read_at")
        .eq("id", notification.id)
        .single();
      expect(beforeError).toBeNull();
      expect(before?.read_at).toBeNull();

      const openForm = page.locator(
        'form[method="post"][action="/notificaciones/abrir/"]',
      );
      await expect(openForm).toBeVisible();
      await openForm.getByRole("button", { name: title, exact: true }).click();
      await expect(page).toHaveURL(/\/perfil\/?$/);

      const { data: after, error: afterError } = await admin
        .from("notifications")
        .select("read_at")
        .eq("id", notification.id)
        .single();
      expect(afterError).toBeNull();
      expect(after?.read_at).not.toBeNull();
    } finally {
      const { error } = await admin.auth.admin.deleteUser(userId);
      expect.soft(error).toBeNull();
    }
  });

  test("login, cookie HttpOnly y exportación privada", async ({ page, context }) => {
    const email = uniqueEmail("exportacion-e2e");
    const userId = await createConfirmedLegalUser(email);

    try {
      // Una identidad efímera hace que el cooldown autoritativo también sea
      // aislado: la suite se puede repetir sin esperar cinco minutos.
      await page.goto("/ingresar/?next=%2Fperfil");
      await page.getByLabel("Correo electrónico").first().fill(email);
      await page.locator('input[name="password"]').fill(seededPassword);
      await waitForTurnstile(page);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();

      await expect(page).toHaveURL(/\/perfil\/?$/);
      await expect(page.locator("main#contenido")).toBeVisible();

      const authCookies = (await context.cookies()).filter((cookie) =>
        hasAuthenticatedSession([cookie]),
      );
      expect(authCookies.length).toBeGreaterThan(0);
      expect(authCookies.every((cookie) => cookie.httpOnly)).toBe(true);

      const visibleCookieNames = await page.evaluate(() =>
        document.cookie
          .split("; ")
          .filter(Boolean)
          .map((cookie) => cookie.split("=")[0]),
      );
      expect(visibleCookieNames.some((name) => name.startsWith("sb-"))).toBe(
        false,
      );

      // Retirar Google es un derecho de cuenta aun sin una aceptación previa;
      // no debe perder la sesión que acabamos de obtener por correo. El enlace
      // vive en la pestaña de cuenta del perfil.
      await page.getByRole("link", { name: "Configuración y Cuenta", exact: true }).click();
      await page.getByRole("link", { name: "Tu acceso con Google", exact: true }).click();
      await expect(page).toHaveURL(/\/perfil\/acceso-google\/?$/);
      await page.getByLabel("Confirmo que quiero retirar mi consentimiento para acceder con Google.").check();
      await page.getByRole("button", { name: "Retirar consentimiento para Google", exact: true }).click();
      await expect(page.getByText("Consentimiento retirado", { exact: true })).toBeVisible();
      await expect(page.getByText("Retiraste tu consentimiento para acceder con Google. Tu cuenta y esta sesión siguen abiertas; podés ingresar por correo.", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("Consentimiento retirado", { exact: true })).toBeVisible();

      const exportResponse = await page.request.get("/perfil/datos/");
      expect(exportResponse.status()).toBe(200);
      expect(exportResponse.headers()["cache-control"]).toContain("no-store");
      expect(exportResponse.headers()["content-disposition"]).toContain(
        "attachment",
      );
      const data = await exportResponse.json();
      expect(data).toHaveProperty("perfil");
      expect(data).toHaveProperty("participacion");
      expect(data.formato).toBe(6);
      expect(data.cuentaYModeracion.estadoDeConsentimientoDeAccesoConGoogle).toMatchObject({ provider: "google", status: "withdrawn", notice_version: null });
      expect(data.cuentaYModeracion.estadoDeConsentimientoDeAccesoConGoogle.last_withdrawn_at).toBeTruthy();
      expect(data.cuentaYModeracion.consentimientosDeAccesoConGoogle).toHaveLength(1);
      expect(data.cuentaYModeracion.consentimientosDeAccesoConGoogle[0].decision).toBe("withdrawn");

      // La exportación puede describir decisiones de moderación, pero nunca debe
      // revelar los UUID personales de quienes moderaron, notificaron o quedaron
      // asignados a contenido de esta cuenta.
      const serialized = JSON.stringify(data);
      for (const thirdPartyUserId of [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "44444444-4444-4444-8444-444444444444",
        "55555555-5555-4555-8555-555555555555",
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
        "88888888-8888-4888-8888-888888888888",
      ]) {
        expect(serialized).not.toContain(thirdPartyUserId);
      }

      const repeatedExport = await page.request.get("/perfil/datos/");
      expect(repeatedExport.status()).toBe(429);
      expect(repeatedExport.headers()["retry-after"]).toBe("300");
    } finally {
      const { error } = await adminClient().auth.admin.deleteUser(userId);
      expect.soft(error).toBeNull();
    }
  });

  test("moderación exige el TOTP aprobado de la sesión actual", async ({
    page,
  }) => {
    // Una suite ejecutada sobre un volumen anterior puede haber aplicado una
    // versión nueva de Privacidad después del seed. La aceptación sigue siendo
    // del usuario real, nunca de la secret administrativa.
    await acceptCurrentLegal(moderatorEmail, seededPassword);
    await page.goto("/ingresar/?next=%2Fmoderacion");
    await page.getByLabel("Correo electrónico").first().fill(moderatorEmail);
    await page.locator('input[name="password"]').fill(seededPassword);
    await waitForTurnstile(page);
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();

    await expect(page).toHaveURL(/\/perfil\/seguridad\/?\?next=/);
    await page.getByLabel("Código temporal").fill(totpCode(moderatorTotpSecret));
    await page
      .getByRole("button", { name: "Verificar y continuar" })
      .click();
    await expect(page).toHaveURL(/\/moderacion\/?$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("un TOTP enrolado por API directa obtiene AAL2 pero no privilegios", async () => {
    const email = uniqueEmail("moderador-adversarial-e2e");
    const admin = adminClient();
    const client = userClient();
    let userId: string | undefined;

    try {
      userId = await createConfirmedLegalUser(email);

      const { error: signInError } = await client.auth.signInWithPassword({
        email,
        password: seededPassword,
        options: { captchaToken: supabaseCaptchaToken },
      });
      if (signInError) throw signInError;
      const beforeEnrollmentNotification = await mailIdsFor(email);

      // La API pública de Auth permite registrar el primer factor sin pasar
      // por la action de Agorbis. Aun llegando a AAL2, ese factor no recibió
      // el ticket server-side y por lo tanto no debe habilitar moderación.
      const { data: enrollment, error: enrollError } =
        await client.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Agorbis E2E adversarial",
        friendlyName: "Factor directo no aprobado",
      });
      if (enrollError || !enrollment || enrollment.type !== "totp") {
        throw enrollError ?? new Error("GoTrue no devolvió un TOTP.");
      }

      const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
        factorId: enrollment.id,
        code: totpCode(enrollment.totp.secret),
      });
      if (verifyError) throw verifyError;
      const enrollmentNotificationId = await waitForNewMail(
        email,
        beforeEnrollmentNotification,
        "Agorbis · Segundo factor agregado / Verification method added",
      );
      await expectMail(
        enrollmentNotificationId,
        "Agorbis · Segundo factor agregado / Verification method added",
        "Se agregó un segundo factor",
      );

      // Tampoco un operador con service_role puede promover esa cuenta: la
      // base exige que el factor haya sido aprobado antes de asignar el rol.
      const { error: promotionError } = await admin
        .from("profiles")
        .update({ role: "moderator" })
        .eq("id", userId);
      expect(promotionError).toMatchObject({
        code: "55000",
        message: "AGORBIS_PRIVILEGED_MFA_REQUIRED",
      });

      const [assuranceResult, approved, moderator] = await Promise.all([
        client.auth.mfa.getAuthenticatorAssuranceLevel(),
        client.rpc("current_session_uses_approved_factor"),
        client.rpc("is_moderator", { p_user: userId }),
      ]);
      expect(assuranceResult.error).toBeNull();
      expect(assuranceResult.data).not.toBeNull();
      expect(assuranceResult.data?.currentLevel).toBe("aal2");
      expect(approved.error).toBeNull();
      expect(approved.data).toBe(false);
      expect(moderator.error).toBeNull();
      expect(moderator.data).toBe(false);

      const beforeUnenrollmentNotification = await mailIdsFor(email);
      const { error: unenrollError } = await client.auth.mfa.unenroll({
        factorId: enrollment.id,
      });
      expect(unenrollError).toBeNull();
      const unenrollmentNotificationId = await waitForNewMail(
        email,
        beforeUnenrollmentNotification,
        "Agorbis · Segundo factor eliminado / Verification method removed",
      );
      await expectMail(
        unenrollmentNotificationId,
        "Agorbis · Segundo factor eliminado / Verification method removed",
        "Se eliminó un segundo factor",
      );
    } finally {
      try {
        await client.auth.signOut();
      } finally {
        if (userId) {
          const { error: deleteError } =
            await admin.auth.admin.deleteUser(userId);
          expect.soft(deleteError).toBeNull();
        }
      }
    }
  });
});
