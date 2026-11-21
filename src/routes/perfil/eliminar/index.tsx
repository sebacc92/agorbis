import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  z,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Alert,
  Card,
  Field,
  Input,
  PasswordInput,
  SubmitButton,
} from "~/components/ui";
import { accountDeletionConfirmation } from "~/lib/account-deletion";
import { APP_NAME } from "~/lib/constants";
import { useLocale, translate } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { isCurrentAal2, moderatorMfaUrl, verifiedTotpFactors } from "~/lib/mfa";
import {
  currentSessionRecentlyAuthenticated,
  requireUser,
  supabase,
} from "~/lib/session";
import { createAdminSupabase } from "~/lib/supabase";
import { verifyPasswordCredential } from "~/lib/protected-auth";
import { useLocaleLoader } from "~/routes/layout";

export const useAccount = routeLoader$(async (ev) => {
  const viewer = await requireUser(ev);
  const db = supabase(ev);
  const [auth, recentlyAuthenticated] = await Promise.all([
    db.auth.getUser(),
    currentSessionRecentlyAuthenticated(db),
  ]);
  return {
    confirmation: accountDeletionConfirmation(
      viewer.profile?.username,
      auth.data.user?.email,
    ),
    recentlyAuthenticated,
  };
});

/**
 * Borrar la cuenta.
 *
 * **Qué pasa con cada cosa lo decide el esquema, no esta action.** Los
 * `author_id` de encuestas, debates, reclamos y proyectos son
 * `on delete set null`: esas publicaciones sobreviven sin autor, que es lo que
 * la interfaz ya muestra como "Cuenta eliminada". Votos, comentarios, apoyos,
 * aportes, follows y reportes son `on delete cascade` y desaparecen.
 *
 * Es la separación correcta y no una casualidad: una encuesta en la que
 * votaron otras cincuenta personas no es sólo de quien la abrió, y borrarla
 * les sacaría a ellas su participación. La identidad sí es de una sola
 * persona y se va entera.
 *
 * Lo único que no cubre la cascada es Storage, que vive fuera de Postgres y
 * hay que limpiar a mano.
 */
export const useDeleteAccount = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const username = viewer.profile?.username ?? "";

    const db = supabase(ev);
    const { data: authData, error: authError } = await db.auth.getUser();
    const user = authData.user;
    if (authError || !user) {
      return ev.fail(401, {
        message: "Tu sesión ya no es válida. Volvé a ingresar.",
      });
    }

    // Copiar un texto propio es la confirmación: un botón de "sí" se toca por
    // inercia, y esto no tiene vuelta atrás. El correo mantiene accesible la
    // baja incluso si una cuenta excepcional perdió su fila de perfil.
    const expectedConfirmation = accountDeletionConfirmation(
      username,
      user.email,
    );
    if (data.confirmacion.trim() !== expectedConfirmation) {
      return ev.fail(400, {
        message: "Escribí exactamente el texto indicado para confirmar.",
      });
    }

    // No normalizar credenciales: un espacio puede ser parte de la contraseña.
    const currentPassword = data.current_password;
    if (currentPassword) {
      if (!user.email) {
        return ev.fail(400, {
          message:
            "Esta cuenta no tiene correo para verificar la contraseña. Volvé a identificarte y repetí la baja sin completar ese campo.",
        });
      }
      // Verificar en un cliente sin cookies conserva el AAL2 de la sesión real
      // y evita que el step-up de contraseña la rebaje accidentalmente a AAL1.
      const sameUser = await verifyPasswordCredential(ev, {
        email: user.email,
        password: currentPassword,
        expectedUserId: viewer.userId,
      });
      if (!sameUser) {
        return ev.fail(400, {
          message: "La contraseña actual no coincide.",
        });
      }
    } else if (!(await currentSessionRecentlyAuthenticated(db))) {
      return ev.fail(400, {
        message:
          "Para borrar la cuenta tenés que identificarte de nuevo. Escribí tu contraseña o volvé a ingresar.",
      });
    }

    const [factorsResult, assuranceResult] = await Promise.all([
      db.auth.mfa.listFactors(),
      db.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsResult.error || assuranceResult.error) {
      logFailure(
        { scope: "cuenta/mfa", userId: viewer.userId },
        factorsResult.error ?? assuranceResult.error,
      );
      return ev.fail(503, {
        message:
          "No pudimos verificar la seguridad de tu sesión. No se inició la baja.",
      });
    }
    if (verifiedTotpFactors(factorsResult.data.all).length > 0) {
      if (!isCurrentAal2(assuranceResult.data.currentLevel)) {
        throw ev.redirect(303, moderatorMfaUrl("/perfil/eliminar"));
      }
      const { data: approved, error: approvalError } = await db.rpc(
        "current_session_uses_approved_factor",
      );
      if (approvalError || approved !== true) {
        if (approvalError) {
          logFailure(
            { scope: "cuenta/factor-aprobado", userId: viewer.userId },
            approvalError,
          );
        }
        throw ev.redirect(
          303,
          `${moderatorMfaUrl("/perfil/eliminar")}&approval=required`,
        );
      }
    }

    // Auth, Postgres y Storage no comparten transacción. La outbox congela
    // nuevas mutaciones y conserva el inventario que el cron puede reintentar.
    const admin = createAdminSupabase(ev);
    const { data: prepared, error: prepareError } = await admin.rpc(
      "prepare_account_deletion",
      { p_user: viewer.userId },
    );
    if (prepareError || prepared !== true) {
      if (prepareError) {
        logFailure(
          { scope: "cuenta/preparar", userId: viewer.userId },
          prepareError,
        );
      }
      return ev.fail(503, {
        message:
          "No pudimos iniciar una baja segura. Tu cuenta sigue activa y no se borró nada; probá de nuevo.",
      });
    }

    const { error: deletionError } = await admin.auth.admin.deleteUser(
      viewer.userId,
    );
    const { data: authMarked, error: markError } = await admin.rpc(
      "mark_account_auth_deleted",
      { p_user: viewer.userId },
    );
    if (deletionError && !markError && authMarked !== true) {
      const { error: cancelError } = await admin.rpc(
        "cancel_account_deletion",
        { p_user: viewer.userId },
      );
      logFailure(
        { scope: "cuenta/borrado", userId: viewer.userId },
        deletionError,
      );
      if (cancelError) {
        logFailure(
          { scope: "cuenta/cancelar", userId: viewer.userId },
          cancelError,
        );
      }
      return ev.fail(500, {
        message:
          "No pudimos borrar la cuenta. Tu cuenta sigue activa; escribinos si vuelve a pasar.",
      });
    }
    const authDeletionConfirmed = !deletionError || authMarked === true;
    if (!authDeletionConfirmed) {
      logFailure(
        { scope: "cuenta/borrado-confirmacion", userId: viewer.userId },
        deletionError ?? markError ?? new Error("Auth no confirmó la baja"),
      );
      return ev.fail(503, {
        message:
          "La solicitud quedó registrada, pero no pudimos confirmar todavía la baja. No repitas cambios en la cuenta; probá ingresar de nuevo en unos minutos o escribinos.",
      });
    }
    if (markError || authMarked !== true || deletionError) {
      // La API de Auth confirmó el borrado o la propia base confirmó que el
      // usuario ya no existe. El worker también detecta ese estado aunque esta
      // marca auxiliar haya fallado y puede completar la limpieza.
      logFailure(
        { scope: "cuenta/borrado-marca", userId: viewer.userId },
        markError ?? deletionError ?? new Error("No se pudo sellar la outbox"),
      );
    }

    // El cron espera al menos quince minutos antes de limpiar. Esa ventana es
    // deliberada: una request a Storage que empezó antes de la baja puede
    // terminar después de deleteUser(), y la outbox debe poder recogerla.

    // La sesión quedó apuntando a un usuario que ya no existe: se cierra para
    // que el navegador no siga mandando un token muerto en cada request.
    await db.auth.signOut();
    throw ev.redirect(302, "/?cuenta=eliminada");
  },
  zod$({
    confirmacion: z.string().min(1),
    current_password: z.string().max(1024).optional(),
  }),
);

export default component$(() => {
  const account = useAccount();
  const remove = useDeleteAccount();
  const locale = useLocale();

  return (
    <div class="container-reading py-8 sm:py-12">
      <header class="mb-6">
        <Link
          href="/perfil"
          class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          ← {translate(locale, "Volver a mi perfil")}
        </Link>
        <p class="mt-2 text-sm font-semibold text-danger">
          {translate(locale, "Acción irreversible")}
        </p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">
          {translate(locale, "Borrar mi cuenta")}
        </h1>
      </header>

      <Alert tone="warn" class="mb-5">
        {translate(
          locale,
          "Borrar la cuenta es también la forma de retirar tu consentimiento para nuevas transferencias internacionales asociadas a ella. El retiro no afecta la licitud de las transferencias realizadas mientras el consentimiento estaba vigente.",
        )}
      </Alert>

      {/* Antes de pedir nada se dice exactamente qué sobrevive y qué no. Es la
          diferencia entre una decisión informada y un arrepentimiento. */}
      <Card class="p-6 sm:p-8">
        <h2 class="font-semibold text-ink-strong">
          {translate(locale, "Qué se borra")}
        </h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>{translate(locale, "Tu nombre, tu foto y tu bio.")}</li>
          <li>
            {translate(
              locale,
              "La constancia de que votaste (lo que votaste ya está sumado al total y no se puede identificar), tus comentarios, apoyos y aportes comprometidos.",
            )}
          </li>
          <li>
            {translate(
              locale,
              "Tu residencia, las comunidades que seguís y tus notificaciones.",
            )}
          </li>
        </ul>

        <h2 class="mt-5 font-semibold text-ink-strong">
          {translate(locale, "Qué queda publicado, sin tu nombre")}
        </h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>
            {translate(
              locale,
              "Las encuestas, debates, reclamos y proyectos que abriste, con su autor en blanco.",
            )}
          </li>
          <li>
            {translate(
              locale,
              "Las fotos de los reclamos que publicaste, junto con el reclamo.",
            )}
          </li>
        </ul>
        <p class="mt-2 text-sm text-ink-muted">
          {translate(
            locale,
            "No es un descuido: en esas publicaciones participó otra gente. Borrar una encuesta en la que votaron cincuenta personas les sacaría a ellas su participación, no sólo la tuya.",
          )}
        </p>

        <p class="mt-5 text-sm">
          <a
            href="/perfil/datos"
            class="font-medium text-brand hover:underline"
          >
            {translate(locale, "Descargá tus datos antes de seguir")}
          </a>{" "}
          <span class="text-ink-muted">
            {translate(locale, "— después de borrar no se pueden recuperar.")}
          </span>
        </p>
      </Card>

      <Card class="mt-5 border-danger-500/30 p-6 sm:p-8">
        {remove.value?.message && (
          <Alert class="mb-4">{translate(locale, remove.value.message)}</Alert>
        )}

        {/* La baja también se lleva lo personal guardado en este navegador
            (borradores, reacciones, búsquedas, guardados): la cuenta deja de
            existir y nada de eso puede quedar para quien use el dispositivo
            después. Se limpia al confirmar, antes de enviar, porque si la
            baja sale bien el servidor redirige y esta página no vuelve a
            correr. Si el servidor la rechaza (contraseña, MFA) se pierden
            sólo esas comodidades locales, nunca la cuenta. Con el texto de
            confirmación mal escrito no se toca nada. */}
        <Form action={remove} class="space-y-4">
          <Field
            name="confirmacion"
            label="Escribí el texto indicado para confirmar"
            hint={translate(locale, "Escribí exactamente: {{value}}", {
              value: account.value.confirmation,
            })}
            required
          >
            <Input
              name="confirmacion"
              required
              autocomplete="off"
              spellcheck={false}
              placeholder={account.value.confirmation}
            />
          </Field>

          <Field
            name="current_password"
            label="Contraseña actual"
            hint={
              account.value.recentlyAuthenticated
                ? "Opcional: te identificaste hace menos de 15 minutos."
                : "Necesaria si tu cuenta tiene contraseña."
            }
          >
            <PasswordInput
              name="current_password"
              autocomplete="current-password"
            />
          </Field>

          {!account.value.recentlyAuthenticated && (
            <p class="text-sm text-ink-muted">
              {translate(locale, "Si entrás sin contraseña,")}{" "}
              <Link
                href="/ingresar?next=%2Fperfil%2Feliminar"
                class="font-medium text-brand hover:underline"
              >
                {translate(locale, "volvé a identificarte")}
              </Link>{" "}
              {translate(locale, "y regresá a esta pantalla.")}
            </p>
          )}

          <SubmitButton variant="danger" pending={remove.isRunning}>
            {translate(locale, "Borrar mi cuenta para siempre")}
          </SubmitButton>
        </Form>
      </Card>

      <p class="mt-6 text-sm text-ink-muted">
        <Link
          href="/perfil"
          class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
        >
          {translate(locale, "Volver a mi perfil")}
        </Link>
      </p>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Borrar mi cuenta")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
