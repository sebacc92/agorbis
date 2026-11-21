import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { readFileSync } from "node:fs";

function transferNoticeVersion() {
  // Playwright corre en Node, fuera de Vite. La versión proviene del mismo
  // catálogo fuente y la RPC registra los hashes vigentes con la sesión real.
  const source = readFileSync(
    new URL("../src/lib/legal.ts", import.meta.url),
    "utf8",
  );
  const version = source.match(
    /^export const INTERNATIONAL_TRANSFER_NOTICE_VERSION = "([^"]+)";$/m,
  )?.[1];
  if (!version)
    throw new Error(
      "No encontramos la versión vigente del aviso de transferencias.",
    );
  return version;
}

export const testAccountPassword = "AgorbisLocal-2026!";
export function localAccountAdmin() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !secret ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).port !== "54821"
  )
    throw new Error(
      "Estas pruebas sólo pueden escribir en Supabase local de Agorbis.",
    );
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createLegalTestAccount(prefix: string) {
  const admin = localAccountAdmin();
  const email = `${prefix}-${crypto.randomUUID()}@agorbis.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: testAccountPassword,
    email_confirm: true,
  });
  if (error || !data.user)
    throw error ?? new Error("No se creó la cuenta local.");
  const id = data.user.id;
  try {
    const anon = process.env.PUBLIC_SUPABASE_ANON_KEY;
    if (!anon) throw new Error("Falta la clave pública local.");
    const session = createClient(process.env.PUBLIC_SUPABASE_URL!, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      const signedIn = await session.auth.signInWithPassword({
        email,
        password: testAccountPassword,
        options: { captchaToken: "XXXX.DUMMY.TOKEN.XXXX" },
      });
      if (signedIn.error) throw signedIn.error;
      // La aceptación se registra con la sesión de la persona del fixture.
      const legal = await session.rpc("accept_current_legal", {
        p_minimum_age_attested: true,
      });
      if (legal.error) throw legal.error;
      const transfers = await session.rpc(
        "grant_current_international_transfer_consent",
        {
          p_expressly_accepted: true,
          p_locale: "es",
          p_version: transferNoticeVersion(),
        },
      );
      if (transfers.error) throw transfers.error;
    } finally {
      await session.auth.signOut();
    }
  } catch (error) {
    await admin.auth.admin.deleteUser(id);
    throw error;
  }
  return { id, email, admin };
}

/**
 * Acepta los documentos vigentes con la sesión real de una cuenta ya existente
 * (la sembrada de moderación, por ejemplo). Una suite ejecutada sobre un volumen
 * anterior puede haber aplicado una versión nueva de Privacidad después del
 * seed, y el gate legal falla cerrado.
 */
export async function acceptCurrentLegalAs(email: string, password: string) {
  const anon = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) throw new Error("Falta la clave pública local.");
  const session = createClient(process.env.PUBLIC_SUPABASE_URL!, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const signedIn = await session.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: "XXXX.DUMMY.TOKEN.XXXX" },
    });
    if (signedIn.error) throw signedIn.error;
    const legal = await session.rpc("accept_current_legal", {
      p_minimum_age_attested: true,
    });
    if (legal.error) throw legal.error;
    const transfers = await session.rpc(
      "grant_current_international_transfer_consent",
      {
        p_expressly_accepted: true,
        p_locale: "es",
        p_version: transferNoticeVersion(),
      },
    );
    if (transfers.error) throw transfers.error;
  } finally {
    await session.auth.signOut();
  }
}

/** Escribe filas con la sesión real de una cuenta de prueba (RLS y triggers). */
export async function withTestAccountSession<T>(
  email: string,
  run: (client: SupabaseClient<Database>) => Promise<T>,
): Promise<T> {
  const anon = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) throw new Error("Falta la clave pública local.");
  const session = createClient<Database>(
    process.env.PUBLIC_SUPABASE_URL!,
    anon,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  try {
    const signedIn = await session.auth.signInWithPassword({
      email,
      password: testAccountPassword,
      options: { captchaToken: "XXXX.DUMMY.TOKEN.XXXX" },
    });
    if (signedIn.error) throw signedIn.error;
    return await run(session);
  } finally {
    await session.auth.signOut();
  }
}

export async function signInTestAccount(
  page: Page,
  email: string,
  next: string,
) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.locator('input[name="password"]').fill(testAccountPassword);
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.replace(/\/$/, "") === next.split("?")[0].replace(/\/$/, ""),
  );
}
