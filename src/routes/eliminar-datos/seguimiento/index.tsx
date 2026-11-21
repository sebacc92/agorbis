import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  z,
  zod$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import { Alert, Card, Field, Input, SubmitButton } from "~/components/ui";
import {
  DELETION_REQUEST_STATUSES,
  DELETION_RESOLUTIONS,
  lookupDeletionReceipt,
  RECEIPT_UNAVAILABLE,
} from "~/lib/deletion-requests";
import { formatInstant } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import { useLocaleLoader } from "../../layout";

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
  ev.headers.set("Referrer-Policy", "no-referrer");
  ev.headers.set("X-Robots-Tag", "noindex, nofollow");
};

export const useDeletionReceipt = routeAction$(
  async (data, ev) => {
    const receipt = await lookupDeletionReceipt(ev, data);
    if (!receipt) return ev.fail(400, { message: RECEIPT_UNAVAILABLE });
    return { receipt };
  },
  zod$({ reference: z.string().max(64), access_code: z.string().max(128) }),
);

export default component$(() => {
  const action = useDeletionReceipt();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const receipt = action.value?.receipt;
  return (
    <article class="container-reading py-8 sm:py-12">
      <Link
        href="/eliminar-datos/"
        class="inline-flex min-h-11 items-center text-brand underline"
      >
        {translate(locale, "Eliminar cuenta y datos")}
      </Link>
      <h1 class="mt-3 text-3xl font-semibold">
        {translate(locale, "Consultar una solicitud de eliminación")}
      </h1>
      <p class="mt-3 leading-7 text-ink-muted">
        {translate(
          locale,
          "Ingresá la referencia y el código que recibiste en el hilo de correo. Este recibo no muestra datos de una cuenta ni documentos de identidad.",
        )}
      </p>
      <Card class="mt-6 p-6">
        <Form action={action} class="space-y-5">
          <Field
            name="reference"
            label={translate(locale, "Referencia de solicitud")}
          >
            <Input
              name="reference"
              required
              maxLength={64}
              autoComplete="off"
              spellcheck={false}
            />
          </Field>
          <Field
            name="access_code"
            label={translate(locale, "Código privado de consulta")}
          >
            <Input
              name="access_code"
              type="password"
              required
              maxLength={128}
              autoComplete="off"
              spellcheck={false}
            />
          </Field>
          <p class="text-sm text-ink-muted">
            {translate(
              locale,
              "No compartas el código ni lo agregues a un enlace. Si venció o lo perdiste, pedí uno nuevo respondiendo al mismo hilo de correo.",
            )}
          </p>
          <SubmitButton pending={action.isRunning}>
            {translate(locale, "Consultar recibo")}
          </SubmitButton>
        </Form>
      </Card>
      {action.value?.message && (
        <Alert class="mt-5">{translate(locale, action.value.message)}</Alert>
      )}
      {receipt && (
        <Card class="mt-6 p-6">
          <h2 class="text-xl font-semibold">
            {translate(locale, DELETION_REQUEST_STATUSES[receipt.status])}
          </h2>
          <dl class="mt-4 space-y-3 text-sm">
            <div>
              <dt class="font-semibold">
                {translate(locale, "Referencia de solicitud")}
              </dt>
              <dd class="break-all font-mono">{receipt.reference}</dd>
            </div>
            <div>
              <dt class="font-semibold">{translate(locale, "Recibida")}</dt>
              <dd>{formatInstant(receipt.received_at, locale, timeZone)}</dd>
            </div>
            <div>
              <dt class="font-semibold">
                {translate(locale, "Última actualización")}
              </dt>
              <dd>{formatInstant(receipt.updated_at, locale, timeZone)}</dd>
            </div>
            {receipt.resolution_code && (
              <div>
                <dt class="font-semibold">
                  {translate(locale, "Motivo de cierre")}
                </dt>
                <dd>
                  {translate(
                    locale,
                    DELETION_RESOLUTIONS[receipt.resolution_code],
                  )}
                </dd>
              </div>
            )}
          </dl>
          <p class="mt-4 border-t border-subtle pt-4 text-sm leading-6 text-ink-muted">
            {translate(
              locale,
              "Resuelta o rechazada indica que se cerró la gestión manual y se registró una respuesta por correo. No acredita por sí solo el borrado completo de la cuenta, publicaciones ni copias de proveedores. Consultá el alcance en esa respuesta.",
            )}
          </p>
        </Card>
      )}
    </article>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Consultar una solicitud de eliminación")} · Agorbis`,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
