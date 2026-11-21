import { component$ } from "@qwik.dev/core";
import {
  Form,
  routeAction$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import { AuthShell } from "~/components/layout/AuthShell";
import { Alert, ButtonLink, Card, SubmitButton } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { safeInternalPath } from "~/lib/http";
import { onboardingPath, withAuthNext } from "~/lib/auth-navigation";
import { translate, useLocale } from "~/lib/i18n";
import { hasCurrentLegalAcceptance } from "~/lib/legal";
import { logFailure } from "~/lib/log";
import { createServerSupabase } from "~/lib/supabase";
import { useLocaleLoader } from "../../layout";

const EMAIL_CONFIRMATION_TYPES = [
  "signup",
  "recovery",
  "magiclink",
  "email_change",
] as const;
type EmailConfirmationType = (typeof EMAIL_CONFIRMATION_TYPES)[number];

const FLOW_COPY: Record<
  EmailConfirmationType,
  { title: string; subtitle: string; button: string }
> = {
  signup: {
    title: "Confirmá tu correo",
    subtitle: "Un clic más y tu cuenta queda activa.",
    button: "Confirmar correo",
  },
  recovery: {
    title: "Confirmá la recuperación",
    subtitle: "Después vas a poder elegir una contraseña nueva.",
    button: "Continuar para cambiar contraseña",
  },
  magiclink: {
    title: "Confirmá el acceso",
    subtitle: "Este enlace inicia una sesión en tu cuenta de Agorbis.",
    button: "Entrar a Agorbis",
  },
  email_change: {
    title: "Confirmá el cambio de correo",
    subtitle:
      "El correo de tu cuenta sólo cambia después de esta confirmación explícita.",
    button: "Confirmar cambio de correo",
  },
};

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
  // `same-origin` y no `no-referrer`: esta página aloja el POST que consume el
  // `token_hash`, y bajo `no-referrer` una navegación POST sale con
  // `Origin: null`, que el chequeo CSRF del router rechaza. Sin JavaScript,
  // confirmar el correo daba 403 (D89 corrigió lo mismo en reenviar). El hash
  // igual no sale a terceros: ningún destino externo recibe el Referer.
  ev.headers.set("Referrer-Policy", "same-origin");
  ev.headers.set("X-Robots-Tag", "noindex, nofollow");
};

function emailConfirmationType(
  value: string | null,
): EmailConfirmationType | null {
  return (
    EMAIL_CONFIRMATION_TYPES.find((candidate) => candidate === value) ?? null
  );
}

function plausibleTokenHash(value: string | null): value is string {
  return (
    !!value &&
    value.length >= 16 &&
    value.length <= 2048 &&
    /^[A-Za-z0-9._~-]+$/.test(value)
  );
}

export const useConfirmEmail = routeAction$(
  async (data, ev) => {
    const db = createServerSupabase(ev);
    const { data: verified, error } = await db.auth.verifyOtp({
      token_hash: data.token_hash,
      type: data.type,
    });

    if (error) {
      logFailure({ scope: "auth/confirm", flow: data.type }, error);
      return ev.fail(400, {
        message:
          "El enlace no es válido, ya fue usado o venció. Pedí uno nuevo.",
      });
    }

    // Con double-confirm, GoTrue responde 200 sin usuario ni sesión cuando
    // acepta la primera de las dos direcciones. No es un token inválido: ya
    // quedó consumido y falta el mensaje enviado a la otra casilla. Quitamos
    // además el hash de la URL para que no permanezca en el historial.
    if (data.type === "email_change" && !verified.user) {
      throw ev.redirect(303, "/auth/confirm?email_change=pending");
    }

    if (!verified.user) {
      return ev.fail(400, {
        message:
          "El enlace no es válido, ya fue usado o venció. Pedí uno nuevo.",
      });
    }

    // Recuperar el acceso nunca depende de aceptar una versión legal: primero
    // se devuelve el control de la cuenta y el gate de participación sigue
    // aplicándose en el resto de la aplicación.
    if (data.type === "recovery") {
      throw ev.redirect(303, "/perfil/contrasena?recovery=1");
    }

    // Con double-confirm el mismo flujo puede ejecutarse una vez desde cada
    // dirección. Ningún GET consume el token y cada confirmación vuelve a una
    // ruta privada inocua, tenga o no pendiente la segunda mitad del cambio.
    if (data.type === "email_change") {
      throw ev.redirect(303, "/perfil");
    }

    const requestedNext = safeInternalPath(
      data.next,
      data.type === "signup" ? "/onboarding" : "/",
    );

    if (!(await hasCurrentLegalAcceptance(db))) {
      const consent = new URL("/consentimiento", ev.url.origin);
      consent.searchParams.set("next", requestedNext);
      throw ev.redirect(303, `${consent.pathname}${consent.search}`);
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("home_community_id")
      .eq("id", verified.user.id)
      .maybeSingle();
    if (profileError) {
      logFailure(
        { scope: "auth/confirm-profile", userId: verified.user.id },
        profileError,
      );
    }

    throw ev.redirect(
      303,
      profile?.home_community_id
        ? requestedNext
        : onboardingPath(requestedNext),
    );
  },
  zod$({
    token_hash: z
      .string()
      .min(16)
      .max(2048)
      .regex(/^[A-Za-z0-9._~-]+$/),
    type: z.enum(EMAIL_CONFIRMATION_TYPES),
    next: z.string().max(2048).optional(),
  }),
);

export default component$(() => {
  const locale = useLocale();
  const location = useLocation();
  const confirmation = useConfirmEmail();
  const flow = emailConfirmationType(location.url.searchParams.get("type"));
  const tokenHash = location.url.searchParams.get("token_hash");
  const emailChangePending =
    location.url.searchParams.get("email_change") === "pending";
  const next = safeInternalPath(location.url.searchParams.get("next"), "/");
  const validRequest = !!flow && plausibleTokenHash(tokenHash);
  const copy = flow ? FLOW_COPY[flow] : null;

  return (
    <AuthShell
      progress={flow === "signup" && !emailChangePending ? 1 : undefined}
      title={
        emailChangePending
          ? "Primera dirección confirmada"
          : (copy?.title ?? "Enlace no válido")
      }
      subtitle={
        emailChangePending
          ? "El cambio se completa recién al confirmar el otro correo."
          : (copy?.subtitle ??
            "Revisá el correo original o pedí un enlace nuevo.")
      }
    >
      <Card class="space-y-5 p-6 sm:p-8">
        {confirmation.value?.message && (
          <Alert>{translate(locale, confirmation.value.message)}</Alert>
        )}

        {emailChangePending ? (
          <>
            <Alert tone="success">
              {translate(
                locale,
                "Confirmamos una de las dos direcciones. Abrí ahora el mensaje que enviamos a la otra para completar el cambio.",
              )}
            </Alert>
            <ButtonLink
              href="/ingresar"
              variant="secondary"
              size="lg"
              class="w-full"
            >
              {translate(locale, "Volver a ingresar")}
            </ButtonLink>
          </>
        ) : validRequest && flow && tokenHash && copy ? (
          <>
            {/* Título y subtítulo ya explican el paso; el botón alcanza. */}
            <Form action={confirmation} class="space-y-3">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={flow} />
              <input type="hidden" name="next" value={next} />
              <SubmitButton
                size="lg"
                class="w-full"
                pending={confirmation.isRunning}
              >
                {translate(locale, copy.button)}
              </SubmitButton>
            </Form>
            {confirmation.value?.message && flow !== "email_change" && (
              <ButtonLink
                href={
                  flow === "recovery"
                    ? "/recuperar"
                    : flow === "signup"
                      ? withAuthNext("/reenviar-confirmacion", next)
                      : withAuthNext("/ingresar", next)
                }
                variant="secondary"
                size="lg"
                class="w-full"
              >
                {translate(locale, "Pedir un enlace nuevo")}
              </ButtonLink>
            )}
          </>
        ) : (
          <>
            <Alert>
              {translate(
                locale,
                "El enlace está incompleto o no es válido. Pedí uno nuevo.",
              )}
            </Alert>
            <ButtonLink
              href="/ingresar"
              variant="secondary"
              size="lg"
              class="w-full"
            >
              {translate(locale, "Volver a ingresar")}
            </ButtonLink>
          </>
        )}
      </Card>
    </AuthShell>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Confirmar acceso")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
