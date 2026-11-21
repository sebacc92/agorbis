import { component$ } from "@qwik.dev/core";
import { Link, type DocumentHead } from "@qwik.dev/router";
import { ButtonLink, Card } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { useLocale, translate } from "~/lib/i18n";
import { LEGAL_CONTACT_EMAIL, LEGAL_ROUTES } from "~/lib/legal";
import { useLocaleLoader } from "../layout";

/** Instrucciones públicas: leerlas y solicitar ayuda no requiere una sesión. */
export default component$(() => {
  const locale = useLocale();
  const subject = translate(
    locale,
    "Solicitud de eliminación de cuenta o datos de Agorbis",
  );
  const contactHref = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  return (
    <article class="container-reading py-8 sm:py-12">
      <p class="text-sm font-semibold text-brand">{APP_NAME}</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-ink-strong sm:text-4xl">
        {translate(locale, "Eliminar tu cuenta y tus datos")}
      </h1>
      <p class="mt-4 text-lg leading-7 text-ink-muted">
        {translate(
          locale,
          "Podés eliminar tu cuenta desde el perfil o solicitar el borrado por correo. Estas instrucciones también se aplican si ingresaste con Facebook o Google.",
        )}
      </p>
      <p class="mt-3 text-sm leading-6 text-ink-muted">
        {translate(
          locale,
          "No necesitás iniciar sesión para leer esta página ni para enviar una solicitud por correo.",
        )}
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/perfil/eliminar" size="lg">
          {translate(locale, "Ir a eliminar mi cuenta")}
        </ButtonLink>
        <a
          href={contactHref}
          class="inline-flex min-h-12 items-center justify-center rounded-2xl border border-control bg-surface px-5 text-sm font-semibold text-ink-strong hover:bg-muted"
        >
          {translate(locale, "Solicitar el borrado por correo")}
        </a>
      </div>

      <div class="mt-8 space-y-5">
        <Card class="p-6 sm:p-8">
          <h2 class="text-xl font-semibold text-ink-strong">
            {translate(locale, "Seguimiento de una solicitud por correo")}
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink">
            {translate(
              locale,
              "Una solicitud registrada tiene una referencia y un código privado para consultar su estado sin ingresar. Si todavía no los recibiste, pedilos respondiendo al mismo hilo de correo.",
            )}
          </p>
          <p class="mt-3 text-sm leading-6 text-ink-muted">
            {translate(
              locale,
              "El recibo no muestra datos de la cuenta. El cierre de la gestión manual no garantiza por sí solo un borrado completo; el alcance se comunica en la respuesta por correo.",
            )}
          </p>
          <ButtonLink
            href="/eliminar-datos/seguimiento/"
            variant="secondary"
            class="mt-4"
          >
            {translate(locale, "Consultar recibo")}
          </ButtonLink>
        </Card>
        <Card class="p-6 sm:p-8">
          <h2 class="text-xl font-semibold text-ink-strong">
            {translate(locale, "Desde tu cuenta de Agorbis")}
          </h2>
          <ol class="mt-4 list-decimal space-y-4 pl-5 text-sm leading-6 text-ink">
            <li>
              <Link
                href="/ingresar?next=%2Fperfil%2Feliminar"
                class="font-semibold text-brand underline underline-offset-4"
              >
                {translate(locale, "Ingresá a Agorbis")}
              </Link>{" "}
              {translate(locale, "con el método que usás habitualmente.")}
            </li>
            <li>
              {translate(
                locale,
                "Desde tu perfil, abrí la opción de borrar tu cuenta. Si querés conservar una copia, descargá tus datos antes de continuar.",
              )}{" "}
              <a
                href="/perfil/datos"
                class="font-semibold text-brand underline underline-offset-4"
              >
                {translate(locale, "Descargar mis datos")}
              </a>
            </li>
            <li>
              {translate(
                locale,
                "Leé qué se elimina y qué puede permanecer publicado. Escribí el texto de confirmación que aparece en pantalla y, si se solicita, volvé a identificarte.",
              )}
            </li>
            <li>
              {translate(
                locale,
                "Confirmá con el botón «Borrar mi cuenta para siempre». Esta acción elimina tu acceso a la cuenta; exportá antes cualquier información que quieras conservar.",
              )}
            </li>
          </ol>
          <p class="mt-5 border-t border-subtle pt-4 text-sm leading-6 text-ink-muted">
            {translate(
              locale,
              "Si no podés ingresar o la función no está disponible, podés solicitar el borrado por correo siguiendo las instrucciones de abajo.",
            )}
          </p>
        </Card>

        <Card class="p-6 sm:p-8">
          <h2 class="text-xl font-semibold text-ink-strong">
            {translate(locale, "Solicitar el borrado sin ingresar")}
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink">
            {translate(locale, "Escribí al contacto de privacidad de Agorbis:")}
          </p>
          <a
            href={contactHref}
            class="mt-2 inline-flex min-h-11 max-w-full items-center break-all font-semibold text-brand underline underline-offset-4"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          <p class="mt-3 text-sm leading-6 text-ink-muted">
            {translate(locale, "Asunto sugerido:")}{" "}
            <strong class="text-ink">{subject}</strong>
          </p>
          <ul class="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-ink">
            <li>
              {translate(
                locale,
                "Indicá el correo o nombre de usuario asociado a tu cuenta. Si ingresaste con Facebook, mencioná ese método de acceso.",
              )}
            </li>
            <li>
              {translate(
                locale,
                "Aclará el alcance de tu solicitud: eliminar la cuenta completa o borrar datos concretos. Si se trata de publicaciones, incluí sus enlaces para poder identificarlas.",
              )}
            </li>
            <li>
              {translate(
                locale,
                "Siempre que puedas, escribí desde el correo asociado a tu cuenta. Si ya no tenés acceso, indicalo para que podamos acordar otra forma de verificar la solicitud.",
              )}
            </li>
          </ul>
          <p class="mt-5 rounded-xl bg-muted p-4 text-sm leading-6 text-ink">
            {translate(
              locale,
              "No envíes contraseñas, códigos de acceso ni tokens de Facebook. Podemos pedir una verificación proporcional de identidad antes de borrar información de una cuenta.",
            )}
          </p>
        </Card>

        <Card class="p-6 sm:p-8">
          <h2 class="text-xl font-semibold text-ink-strong">
            {translate(locale, "Si usaste Facebook para ingresar")}
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink">
            {translate(
              locale,
              "Podés solicitar la eliminación de tu cuenta de Agorbis y de los datos asociados al acceso con Facebook mediante cualquiera de los dos caminos de esta página.",
            )}
          </p>
          <p class="mt-3 text-sm leading-6 text-ink">
            {translate(
              locale,
              "Quitar Agorbis de las aplicaciones conectadas en Facebook no elimina por sí solo tu cuenta ni los datos que Agorbis conserva. Para solicitar ese borrado, usá la opción del perfil o escribí al contacto de privacidad.",
            )}
          </p>
        </Card>

        <Card class="p-6 sm:p-8">
          <h2 class="text-xl font-semibold text-ink-strong">
            {translate(locale, "Alcance y respuesta a tu solicitud")}
          </h2>
          <p class="mt-3 text-sm leading-6 text-ink">
            {translate(
              locale,
              "Algunas publicaciones pueden seguir visibles sin la vinculación a tu perfil. Si contienen datos personales que querés suprimir, indicá sus enlaces en la solicitud.",
            )}
          </p>
          <p class="mt-3 text-sm leading-6 text-ink">
            {translate(
              locale,
              "La baja de la cuenta no implica una eliminación inmediata y completa de todas las publicaciones, datos derivados o copias conservadas por proveedores. El alcance, las limitaciones de conservación y los plazos de respuesta a solicitudes se describen en la Política de privacidad.",
            )}
          </p>
          <Link
            href={LEGAL_ROUTES.privacy}
            class="mt-4 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-4"
          >
            {translate(locale, "Leer la Política de privacidad")}
          </Link>
        </Card>
      </div>
    </article>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Eliminar tu cuenta y tus datos")} · ${APP_NAME}`,
  meta: [
    {
      name: "description",
      content: translate(
        resolveValue(useLocaleLoader),
        "Instrucciones para eliminar tu cuenta de Agorbis o solicitar el borrado de tus datos, incluido el acceso con Facebook.",
      ),
    },
  ],
});
