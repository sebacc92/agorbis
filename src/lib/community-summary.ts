import { formatNumber } from "./format";
import { translate, type Locale } from "./i18n";

export interface CommunitySummary {
  communityName: string;
  communityUrl: string;
  memberCount?: number;
  resolvedClaimsCount: number;
  openClaimsCount: number;
  participationCount: number;
}

/** Una misma vista previa y mensaje para copiar o abrir en WhatsApp. */
export function communitySummaryText(
  locale: Locale,
  data: CommunitySummary,
): string {
  const lines = [
    translate(locale, "📢 Resumen de {{community}}", {
      community: data.communityName,
    }),
  ];
  if (data.memberCount !== undefined) {
    lines.push(
      translate(locale, "🙋 Personas miembro: {{count}}", {
        count: formatNumber(data.memberCount, locale),
      }),
    );
  }
  lines.push(
    translate(locale, "🏆 Reclamos resueltos: {{count}}", {
      count: formatNumber(data.resolvedClaimsCount, locale),
    }),
    translate(locale, "📣 Reclamos abiertos: {{count}}", {
      count: formatNumber(data.openClaimsCount, locale),
    }),
    translate(locale, "🗳️ Encuestas, debates y proyectos: {{count}}", {
      count: formatNumber(data.participationCount, locale),
    }),
    "",
    translate(locale, "Conocé la comunidad y participá:"),
    data.communityUrl,
  );
  return lines.join("\n");
}
