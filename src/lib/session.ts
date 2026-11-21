import type { RequestEventBase, RequestEventCommon } from "@qwik.dev/router";
import { onboardingPath, returnPathFor, withAuthNext } from "./auth-navigation";
import type { CommunityRef } from "./community";
import { ancestorPaths, isMemberOf } from "./community";
import type { Tables, UserRole } from "./database.types.helpers";
import { throttledByCookie } from "./http";
import { resolveLocale, translate } from "./i18n";
import { logFailure } from "./log";
import { isCurrentAal2, moderatorMfaUrl } from "./mfa";
import { createServerSupabase, type DB } from "./supabase";

export type Profile = Tables<"profiles">;

/**
 * Todo lo que la UI necesita saber del visitante, resuelto una sola vez por
 * request. La promesa se guarda en `sharedMap` para que varios `routeLoader$`
 * de la misma navegación no repitan la consulta; ver `getViewer`.
 */
export interface Viewer {
  userId: string | null;
  profile: Profile | null;
  /** Cadena de residencia, de `earth` a la comunidad más específica. */
  residenceChain: CommunityRef[];
  homePath: string | null;
  isModerator: boolean;
  unreadNotifications: number;
  /** El perfil existe pero todavía no eligió residencia. */
  needsOnboarding: boolean;
}

/** Marca de la última visita registrada; ver `throttledByCookie`. */
const VISIT_COOKIE = "agorbis-visit";

const VIEWER_KEY = "agorbis:viewer";
const SUPABASE_KEY = "agorbis:supabase";

/** Ventana de step-up compartida por contraseña y borrado de cuenta. */
export const RECENT_AUTH_MS = 15 * 60 * 1000;

const PRIMARY_AUTH_METHODS = new Set([
  "password",
  "otp",
  "oauth",
  "oauth_provider/authorization_code",
  "sso/saml",
  "magiclink",
  "web3",
  "recovery",
  "invite",
  "email/signup",
]);

/**
 * Comprueba la autenticación primaria de esta sesión, no `last_sign_in_at`.
 * Ese campo pertenece a la cuenta y puede haberlo actualizado otro dispositivo;
 * los timestamps AMR, en cambio, vienen dentro del JWT verificado de la sesión.
 * Un array RFC-8176 sin timestamps falla cerrado porque no demuestra frescura.
 */
export function isRecentAuthentication(
  authenticationMethods: unknown,
  now = Date.now(),
): boolean {
  if (!Array.isArray(authenticationMethods)) return false;

  return authenticationMethods.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const method = Reflect.get(entry, "method");
    const timestamp = Reflect.get(entry, "timestamp");
    if (
      typeof method !== "string" ||
      !PRIMARY_AUTH_METHODS.has(method) ||
      typeof timestamp !== "number" ||
      !Number.isFinite(timestamp)
    ) {
      return false;
    }
    const age = now - timestamp * 1000;
    return age >= -60_000 && age < RECENT_AUTH_MS;
  });
}

export async function currentSessionRecentlyAuthenticated(
  db: DB,
): Promise<boolean> {
  const { data, error } = await db.auth.getClaims();
  return !error && !!data && isRecentAuthentication(data.claims.amr);
}

export const ANONYMOUS: Viewer = {
  userId: null,
  profile: null,
  residenceChain: [],
  homePath: null,
  isModerator: false,
  unreadNotifications: 0,
  needsOnboarding: false,
};

/** Cliente Supabase por request, reutilizado entre loaders. */
export function supabase(ev: RequestEventBase): DB {
  const cached = ev.sharedMap.get(SUPABASE_KEY) as DB | undefined;
  if (cached) return cached;
  const client = createServerSupabase(ev);
  ev.sharedMap.set(SUPABASE_KEY, client);
  return client;
}

/**
 * Resuelve el visitante una sola vez por request.
 *
 * Se memoiza la **promesa** y no el resultado. El layout y la página corren
 * sus `routeLoader$` en paralelo y cada uno llama a `getViewer`: cuando se
 * guardaba el resultado, todos llegaban antes de que el primero terminara,
 * encontraban la caché vacía y repetían `getUser()`, el perfil, el contador y
 * la cadena de residencia (dos o tres veces por request). Con la promesa en
 * `sharedMap`, el segundo llamado espera al primero.
 *
 * Si falla, se saca de la caché: una falla transitoria no condena al resto de
 * la request, que puede reintentar como antes.
 */
export function getViewer(ev: RequestEventBase): Promise<Viewer> {
  const cached = ev.sharedMap.get(VIEWER_KEY) as Promise<Viewer> | undefined;
  if (cached) return cached;

  const pending = resolveViewer(ev);
  ev.sharedMap.set(VIEWER_KEY, pending);
  pending.catch(() => {
    if (ev.sharedMap.get(VIEWER_KEY) === pending) {
      ev.sharedMap.delete(VIEWER_KEY);
    }
  });
  return pending;
}

/** Un POST nativo que cambia avisos no puede reutilizar el contador anterior. */
export function invalidateViewer(ev: RequestEventBase) {
  ev.sharedMap.delete(VIEWER_KEY);
}

async function resolveViewer(ev: RequestEventBase): Promise<Viewer> {
  // El preview público no reanuda ni valida sesiones: el Worker ya retiró
  // Cookie/Authorization y esta salida evita incluso una llamada anónima a
  // Supabase Auth. Las lecturas públicas posteriores conservan la publishable
  // key y las políticas RLS del rol anon.
  if (ev.env.get("AGORBIS_LAUNCH_MODE") === "public-read-only") {
    return ANONYMOUS;
  }

  const db = supabase(ev);
  // `getUser()` valida el JWT contra Supabase; `getSession()` sólo lee la cookie
  // y por lo tanto no sirve para decidir nada del lado del servidor.
  const { data: userData } = await db.auth.getUser();
  const user = userData.user;

  if (!user) return ANONYMOUS;

  // El perfil trae embebido el `path` de su comunidad, y la cadena de
  // residencia depende de ese `path`: se encadena al perfil sin esperar al
  // contador de no leídas ni a la visita, que corren en paralelo. Antes la
  // cadena arrancaba recién cuando terminaban las tres consultas.
  const profileAndChain = db
    .from("profiles")
    .select(
      "*, home_community:communities!profiles_home_community_id_fkey(path)",
    )
    .eq("id", user.id)
    .maybeSingle()
    .then(async (profileRes) => {
      // Un perfil ilegible deja a la persona sin residencia conocida: la UI
      // no debe afirmar nada sobre ella (D116), y el fallo queda en el log.
      if (profileRes.error) {
        logFailure({ scope: "session/perfil" }, profileRes.error);
      }
      // El embed se separa del perfil: `Viewer.profile` sigue siendo
      // exactamente una fila de `profiles` y ninguna vista recibe un campo de
      // más.
      const { home_community: homeCommunity, ...profileRow } =
        profileRes.data ?? { home_community: null };
      const profile = profileRes.data ? (profileRow as Profile) : null;
      const homePath: string | null = homeCommunity?.path ?? null;

      let residenceChain: CommunityRef[] = [];
      if (homePath) {
        const { data: chain } = await db
          .from("communities")
          .select("id, slug, name, emoji, level, path")
          .in("path", ancestorPaths(homePath))
          .order("level", { ascending: true });
        residenceChain = chain ?? [];
      }
      return { profile, homePath, residenceChain };
    });

  const [{ profile, homePath, residenceChain }, unreadRes] = await Promise.all([
    profileAndChain,
    db
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null),
    /**
     * La visita para métricas se registra una vez por hora y no en cada
     * request.
     *
     * `record_activation_visit` es idempotente —inserta con `on conflict do
     * nothing` y a lo sumo produce una fila por día— pero eso lo resuelve
     * *después* de ejecutar un INSERT y un SELECT. Corría en cada navegación
     * de cada sesión abierta, todo el día, para no cambiar nada el 99% de las
     * veces. Una hora es de sobra: lo que la métrica necesita saber es si la
     * persona entró hoy.
     */
    throttledByCookie(ev, VISIT_COOKIE, 3600)
      ? Promise.resolve(null)
      : db.rpc("record_activation_visit"),
  ]);

  return {
    userId: user.id,
    profile,
    residenceChain,
    homePath,
    isModerator: profile?.role === "moderator" || profile?.role === "admin",
    unreadNotifications: unreadRes.count ?? 0,
    needsOnboarding: !!profile && !profile.home_community_id,
  };
}

/**
 * Exige sesión. Redirige a `/ingresar` guardando a dónde quería ir el usuario.
 * `throw`ea, así que después de llamarla el flujo no continúa.
 */
export async function requireUser(
  ev: RequestEventCommon,
): Promise<Viewer & { userId: string }> {
  const viewer = await getViewer(ev);
  if (!viewer.userId) {
    // `returnPathFor` descarta `qaction` y los pasos del propio acceso: con la
    // query cruda, una acción rechazada por falta de sesión volvía a enviarse
    // al entrar, y cada vuelta anidaba otro `next` (la carrera anotada en D93
    // y D96).
    throw ev.redirect(302, withAuthNext("/ingresar", returnPathFor(ev.url)));
  }
  return viewer as Viewer & { userId: string };
}

/** Exige sesión *y* onboarding completo: sin residencia no se puede participar. */
export async function requireResident(
  ev: RequestEventCommon,
): Promise<Viewer & { userId: string }> {
  const viewer = await requireUser(ev);
  if (!viewer.profile?.home_community_id) {
    // Al elegir la residencia vuelve a donde estaba, no a su comunidad.
    throw ev.redirect(302, onboardingPath(returnPathFor(ev.url)));
  }
  return viewer;
}

export async function requireModerator(
  ev: RequestEventCommon,
): Promise<Viewer & { userId: string }> {
  const viewer = await requireUser(ev);
  if (!viewer.isModerator) {
    throw ev.error(
      403,
      translate(
        resolveLocale(ev.locale()),
        "Esta sección es sólo para el equipo de moderación.",
      ),
    );
  }

  // La autorización privilegiada depende del JWT de *esta sesión*. Que la
  // cuenta tenga un factor registrado no prueba que haya sido presentado al
  // iniciar la sesión actual. `getViewer()` ya validó ese JWT con `getUser()`;
  // ahora leemos su claim AAL mediante la API oficial de Supabase.
  const { data: assurance, error } =
    await supabase(ev).auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    logFailure(
      { scope: "auth/mfa-nivel-moderacion", userId: viewer.userId },
      error,
    );
    throw ev.error(
      503,
      translate(
        resolveLocale(ev.locale()),
        "No pudimos verificar la seguridad de tu sesión. Probá de nuevo.",
      ),
    );
  }
  if (!isCurrentAal2(assurance.currentLevel)) {
    throw ev.redirect(
      303,
      moderatorMfaUrl(`${ev.url.pathname}${ev.url.search}`),
    );
  }

  // AAL2 por sí solo no basta: un atacante con una cookie AAL1 podría llamar
  // el endpoint Auth de Supabase directamente y registrar su propio TOTP. La
  // base sólo acepta sesiones cuyo factor pasó por nuestro step-up de
  // contraseña y quedó aprobado para privilegios.
  const { data: privileged, error: privilegeError } = await supabase(ev).rpc(
    "is_moderator",
    { p_user: viewer.userId },
  );
  if (privilegeError) {
    logFailure(
      { scope: "auth/mfa-factor-moderacion", userId: viewer.userId },
      privilegeError,
    );
    throw ev.error(
      503,
      translate(
        resolveLocale(ev.locale()),
        "No pudimos verificar la seguridad de tu sesión. Probá de nuevo.",
      ),
    );
  }
  if (privileged !== true) {
    const target = moderatorMfaUrl(`${ev.url.pathname}${ev.url.search}`);
    throw ev.redirect(303, `${target}&approval=required`);
  }
  return viewer;
}

/** Espejo de `is_member` para decidir qué renderizar. La verdad está en RLS. */
export function viewerIsMember(viewer: Viewer, communityPath: string): boolean {
  return isMemberOf(viewer.homePath, communityPath);
}

export function roleLabel(role: UserRole): string | null {
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderación";
  return null;
}
