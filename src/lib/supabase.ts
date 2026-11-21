import type { RequestEventBase } from "@qwik.dev/router";
import {
  createServerClient as createSsrServerClient,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type DB = SupabaseClient<Database>;

/**
 * Lee una variable de entorno pública. En el servidor viene del `RequestEvent`
 * del Worker; en el browser, del bundle de Vite.
 */
function publicEnv(
  ev: RequestEventBase | undefined,
  key: "PUBLIC_SUPABASE_URL" | "PUBLIC_SUPABASE_ANON_KEY",
): string {
  const value = ev
    ? ev.env.get(key)
    : (import.meta.env[key] as string | undefined);
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${key}. Copiá .env.example a .env y completala con los datos de tu proyecto Supabase.`,
    );
  }
  return value;
}

/**
 * Las opciones que entrega `@supabase/ssr` son defaults de librería, no una
 * política de seguridad. En particular hoy incluyen `httpOnly: false`; si se
 * respetara ese valor, cualquier XSS podría leer el refresh token. La app
 * completa el PKCE en rutas server-side, así que JavaScript nunca necesita
 * acceder a estas cookies.
 */
export function hardenedSupabaseCookieOptions(
  options: CookieOptions | undefined,
  secure: boolean,
): CookieOptions {
  return {
    ...options,
    path: options?.path ?? "/",
    sameSite: options?.sameSite ?? "lax",
    secure,
    httpOnly: true,
  };
}

/**
 * Adaptador de cookies entre `@supabase/ssr` y Qwik Router.
 *
 * Detalle importante: Qwik *decodifica* con `decodeURIComponent` al leer, pero
 * escribe el string tal cual. Si no codificamos al escribir, el round-trip de
 * un valor con `%` se rompe. Por eso el `encodeURIComponent` explícito.
 */
function qwikCookieAdapter(ev: RequestEventBase) {
  return {
    getAll() {
      return Object.entries(ev.cookie.getAll()).map(([name, cookie]) => ({
        name,
        value: cookie.value,
      }));
    },
    setAll(
      cookies: { name: string; value: string; options?: CookieOptions }[],
    ) {
      for (const { name, value, options } of cookies) {
        ev.cookie.set(
          name,
          encodeURIComponent(value),
          hardenedSupabaseCookieOptions(options, ev.url.protocol === "https:"),
        );
      }
    },
  };
}

/**
 * Cliente para usar dentro de `routeLoader$`, `routeAction$` y `server$`.
 * Respeta la sesión del usuario y, por lo tanto, todas las policies de RLS.
 */
export function createServerSupabase(ev: RequestEventBase): DB {
  return createSsrServerClient<Database>(
    publicEnv(ev, "PUBLIC_SUPABASE_URL"),
    publicEnv(ev, "PUBLIC_SUPABASE_ANON_KEY"),
    { cookies: qwikCookieAdapter(ev) },
  );
}

/**
 * Cliente anónimo, sin cookies ni sesión: para respuestas que se cachean como
 * `public` (imágenes sociales, `datos.json`, `feed.xml`) y que por lo tanto
 * tienen que ser exactamente las que vería cualquier visitante. Con el cliente
 * de la sesión, RLS le deja leer a un moderador contenido retirado que después
 * quedaría en la caché compartida, y el refresco del token puede agregar un
 * `Set-Cookie` a una respuesta pública. Usa la clave publicable, así que sigue
 * sujeto a las mismas policies que un visitante sin cuenta.
 */
export function createAnonymousSupabase(ev: RequestEventBase): DB {
  return createClient<Database>(
    publicEnv(ev, "PUBLIC_SUPABASE_URL").trim(),
    publicEnv(ev, "PUBLIC_SUPABASE_ANON_KEY").trim(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

function secretKey(ev: RequestEventBase): string {
  const key = ev.env.get("SUPABASE_SECRET_KEY")?.trim();
  if (!key) {
    throw new Error("Falta SUPABASE_SECRET_KEY en el entorno del servidor.");
  }
  return key;
}

/**
 * Cliente server-only con una `sb_secret_`: actúa con el rol PostgreSQL
 * `service_role` e ignora RLS por completo.
 *
 * Se usa para la cache y los leases server-only de resúmenes IA. Nunca debe
 * llegar al bundle del browser — de ahí el chequeo defensivo.
 */
export function createAdminSupabase(ev: RequestEventBase): DB {
  if (ev.env.get("AGORBIS_LAUNCH_MODE") === "public-read-only") {
    throw new Error(
      "El cliente admin de Supabase está deshabilitado en el preview de sólo lectura.",
    );
  }
  if (!import.meta.env.SSR) {
    throw new Error("createAdminSupabase() sólo puede usarse en el servidor.");
  }
  return createClient<Database>(
    publicEnv(ev, "PUBLIC_SUPABASE_URL"),
    secretKey(ev),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
