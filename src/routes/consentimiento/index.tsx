import { component$, useSignal } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import { LegalConsentFields } from "~/components/auth/LegalConsentFields";
import { AuthShell } from "~/components/layout/AuthShell";
import { Alert, Badge, Card, SubmitButton } from "~/components/ui";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { safeInternalPath } from "~/lib/http";
import { onboardingPath } from "~/lib/auth-navigation";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import {
  COMMUNITY_RULES_VERSION,
  INTERNATIONAL_TRANSFER_NOTICE_VERSION,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "~/lib/legal";
import { logFailure } from "~/lib/log";
import { requireUser, supabase } from "~/lib/session";
import { useLocaleLoader } from "../layout";

interface LegalDocumentStatus {
  type: string;
  version: string;
  effective_at: string;
  minimum_age: number;
  accepted: boolean;
  accepted_at: string | null;
}

interface LegalStatus {
  canParticipate: boolean;
  isSuspended: boolean;
  documents: LegalDocumentStatus[];
  internationalTransferConsent: {
    version: string;
    status: "accepted" | "missing";
    acceptedAt: string | null;
  } | null;
}

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
};

function parseLegalStatus(value: unknown): LegalStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      canParticipate: false,
      isSuspended: false,
      documents: [],
      internationalTransferConsent: null,
    };
  }
  const record = value as Record<string, unknown>;
  const rawDocuments = Array.isArray(record.documents) ? record.documents : [];
  const documents = rawDocuments.flatMap((document) => {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      return [];
    }
    const row = document as Record<string, unknown>;
    if (typeof row.type !== "string" || typeof row.version !== "string") {
      return [];
    }
    return [
      {
        type: row.type,
        version: row.version,
        effective_at:
          typeof row.effective_at === "string" ? row.effective_at : "",
        minimum_age: typeof row.minimum_age === "number" ? row.minimum_age : 0,
        accepted: row.accepted === true,
        accepted_at:
          typeof row.accepted_at === "string" ? row.accepted_at : null,
      },
    ];
  });
  const rawTransfer = record.international_transfer_consent;
  const internationalTransferConsent =
    rawTransfer &&
    typeof rawTransfer === "object" &&
    !Array.isArray(rawTransfer) &&
    typeof (rawTransfer as Record<string, unknown>).version === "string" &&
    ((rawTransfer as Record<string, unknown>).status === "accepted" ||
      (rawTransfer as Record<string, unknown>).status === "missing")
      ? {
          version: (rawTransfer as Record<string, unknown>).version as string,
          status: (rawTransfer as Record<string, unknown>).status as
            "accepted" | "missing",
          acceptedAt:
            typeof (rawTransfer as Record<string, unknown>).accepted_at ===
            "string"
              ? ((rawTransfer as Record<string, unknown>).accepted_at as string)
              : null,
        }
      : null;
  return {
    canParticipate: record.can_participate === true,
    isSuspended: record.is_suspended === true,
    documents,
    internationalTransferConsent,
  };
}

export const useLegalStatus = routeLoader$(
  async (ev) => {
    const viewer = await requireUser(ev);
    const { data, error } = await supabase(ev).rpc("my_legal_status");
    if (error) {
      logFailure({ scope: "consentimiento/estado" }, error);
      throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
    }
    const next = safeInternalPath(ev.url.searchParams.get("next"), "/inicio");
    const isNewAccount = !viewer.profile?.home_community_id;
    return {
      ...parseLegalStatus(data),
      isNewAccount,
      continueTo: isNewAccount ? onboardingPath(next) : next,
    };
  },
  { search: ["next"] },
);

export const useAcceptLegal = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);
    const { error } = await db.rpc("accept_current_legal", {
      p_minimum_age_attested: true,
    });
    if (error) {
      logFailure({ scope: "consentimiento/documentos" }, error);
      return ev.fail(400, {
        message:
          "No pudimos registrar tu aceptación. Probá de nuevo en un momento.",
      });
    }
    const { error: transferError } = await db.rpc(
      "grant_current_international_transfer_consent",
      {
        p_expressly_accepted: data.international_transfers_consented === "si",
        p_locale: resolveLocale(ev.locale()),
        p_version: INTERNATIONAL_TRANSFER_NOTICE_VERSION,
      },
    );
    if (transferError) {
      logFailure({ scope: "consentimiento/transferencias" }, transferError);
      return ev.fail(400, {
        message:
          "No pudimos registrar el consentimiento de transferencias internacionales. Probá de nuevo en un momento.",
      });
    }
    const next = safeInternalPath(data.next, "/inicio");
    throw ev.redirect(
      303,
      viewer.profile?.home_community_id ? next : onboardingPath(next),
    );
  },
  // D108: las mismas dos casillas que el registro (LegalConsentFields). La
  // casilla unificada completa los cuatro campos de documentos y edad; las
  // RPC registran cada documento y el aviso con su versión, igual que antes.
  zod$(
    z
      .object({
        legal_consent: z.string().optional(),
        age_confirmed: z.string().optional(),
        terms_accepted: z.string().optional(),
        privacy_acknowledged: z.string().optional(),
        community_rules_accepted: z.string().optional(),
        international_transfers_consented: z
          .string()
          .optional()
          .refine((value) => value === "si", {
            message:
              "Tenés que aceptar expresamente las transferencias internacionales para mantener una cuenta.",
          }),
        next: z.string().optional(),
      })
      .superRefine((data, ctx) => {
        // Sin JS los campos derivados llegan vacíos: alcanza la casilla
        // unificada, igual que en /registro.
        const accepted =
          data.legal_consent === "si" ||
          (data.age_confirmed === "si" &&
            data.terms_accepted === "si" &&
            data.privacy_acknowledged === "si" &&
            data.community_rules_accepted === "si");
        if (!accepted) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            // LegalConsentFields completa `{{count}}` con MINIMUM_ACCOUNT_AGE.
            message:
              "Confirmá que tenés {{count}} años o más y aceptá los Términos, Normas y Política de privacidad.",
            path: ["legal_consent"],
          });
        }
      }),
  ),
);

const DOCUMENTS = [
  {
    type: "terms",
    label: "Términos",
    version: TERMS_VERSION,
  },
  {
    type: "privacy",
    label: "Política de privacidad",
    version: PRIVACY_VERSION,
  },
  {
    type: "community_rules",
    label: "Normas comunitarias",
    version: COMMUNITY_RULES_VERSION,
  },
] as const;

export default component$(() => {
  const status = useLegalStatus();
  const accept = useAcceptLegal();
  const locale = useLocale();
  const location = useLocation();
  const transferConsent = useSignal(false);
  const next = status.value.continueTo;
  const documentsAccepted = DOCUMENTS.every((document) =>
    status.value.documents.some(
      (configured) =>
        configured.type === document.type &&
        configured.version === document.version &&
        configured.accepted,
    ),
  );
  const transferAccepted =
    status.value.internationalTransferConsent?.version ===
      INTERNATIONAL_TRANSFER_NOTICE_VERSION &&
    status.value.internationalTransferConsent.status === "accepted";
  // Una suspensión hace que `can_participate` sea false aunque los acuerdos
  // estén al día; no hay que pedir que se acepten una y otra vez.
  const complete =
    (documentsAccepted && transferAccepted) || status.value.canParticipate;

  return (
    <AuthShell
      progress={status.value.isNewAccount ? 2 : undefined}
      title="Acuerdos de la comunidad"
      subtitle={
        status.value.isNewAccount
          ? "Ya los marcaste al crear la cuenta; ahora que confirmaste tu correo quedan registrados con tu sesión, que es la constancia que vale. Después elegís tu comunidad."
          : "Para publicar, votar o apoyar necesitamos registrar estas versiones."
      }
    >
      {!status.value.isNewAccount && (
        <Link
          href="/perfil"
          class="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          ← {translate(locale, "Volver a mi perfil")}
        </Link>
      )}

      {location.url.searchParams.get("auth_error") === "1" && (
        <Alert class="mb-5">
          {translate(
            locale,
            "No pudimos registrar tu aceptación automáticamente. Revisá los documentos y volvé a confirmar.",
          )}
        </Alert>
      )}

      {status.value.isSuspended && (
        <Alert tone="warn" class="mb-5">
          {translate(locale, "Tu cuenta tiene una suspensión activa.")}{" "}
          <Link href="/perfil/apelacion" class="font-semibold underline">
            {translate(locale, "Ver la medida o apelar")}
          </Link>
        </Alert>
      )}

      {complete ? (
        <Alert tone="success">
          {translate(locale, "Tus acuerdos vigentes ya están registrados.")}{" "}
          <Link href={next} class="font-semibold underline">
            {translate(locale, "Continuar")}
          </Link>
        </Alert>
      ) : (
        <Card class="p-6 sm:p-8">
          {accept.value?.message && (
            <Alert class="mb-5">
              {translate(locale, accept.value.message)}
            </Alert>
          )}

          {/* Navegación de documento: la redirección al paso siguiente la encadena
              el navegador. Con SPA, un router trabado tras redirigir dejaba el
              botón del paso siguiente girando (D115, D121). */}
          <Form action={accept} reloadDocument class="space-y-5">
            <input type="hidden" name="next" value={next} />
            <LegalConsentFields
              prefix="consentimiento"
              transferConsent={transferConsent}
              errors={accept.value?.fieldErrors}
            />
            <SubmitButton size="lg" class="w-full" pending={accept.isRunning}>
              {translate(locale, "Aceptar y continuar")}
            </SubmitButton>
          </Form>

          {/* Las versiones quedan a la vista: es lo que se registra. */}
          <ul
            class="mt-6 flex flex-wrap gap-2 border-t border-subtle pt-5 text-xs text-ink-muted"
            aria-label={translate(locale, "Versiones vigentes")}
          >
            {DOCUMENTS.map((document) => {
              const configured = status.value.documents.find(
                (item) => item.type === document.type,
              );
              return (
                <li key={document.type}>
                  <Badge tone={configured?.accepted ? "success" : "neutral"}>
                    {translate(locale, document.label)}{" "}
                    {configured?.version ?? document.version}
                  </Badge>
                </li>
              );
            })}
            <li>
              <Badge tone={transferAccepted ? "success" : "neutral"}>
                {translate(locale, "Transferencias")}{" "}
                {INTERNATIONAL_TRANSFER_NOTICE_VERSION}
              </Badge>
            </li>
          </ul>
        </Card>
      )}

      <p class="mt-5 text-sm leading-relaxed text-ink-muted">
        {translate(
          locale,
          "Si no estás de acuerdo, podés descargar tus datos. Para retirar el consentimiento de transferencias y cerrar la cuenta, iniciá la eliminación desde tu perfil.",
        )}{" "}
        <Link
          href="/perfil/eliminar?retiro=transferencias"
          class="font-medium text-brand hover:underline"
        >
          {translate(locale, "Retirar consentimiento y borrar mi cuenta")}
        </Link>
      </p>
    </AuthShell>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Acuerdos de la comunidad")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
