import type { RequestHandler } from "@qwik.dev/router";
import { safeInternalPath } from "~/lib/http";
import {
  localeTag,
  LOCALE_COOKIE,
  LOCALE_QUERY_PARAM,
  matchSupportedLocale,
  negotiateLocale,
} from "~/lib/i18n";

const ONE_YEAR = 60 * 60 * 24 * 365;

function addVary(headers: Headers, ...names: string[]) {
  const current = headers.get("Vary");
  if (current?.trim() === "*") return;
  const values = new Map<string, string>();
  for (const name of [...(current?.split(",") ?? []), ...names]) {
    const normalized = name.trim();
    if (normalized) values.set(normalized.toLowerCase(), normalized);
  }
  headers.set("Vary", [...values.values()].join(", "));
}

export const onRequest: RequestHandler = ({
  cookie,
  headers,
  locale,
  query,
  redirect,
  request,
  url,
}) => {
  const requestedValues = query.getAll(LOCALE_QUERY_PARAM);
  const requested = requestedValues
    .map((value) => matchSupportedLocale(value))
    .find((value) => value !== null);
  const selected = negotiateLocale({
    requested,
    stored: cookie.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });

  // Las respuestas SSR dependen de ambas preferencias. Se conserva cualquier
  // valor Vary previo y se evita duplicarlo con otra capitalización.
  addVary(headers, "Cookie", "Accept-Language");
  headers.set("Content-Language", localeTag(selected));

  if (requested) {
    cookie.set(LOCALE_COOKIE, selected, {
      path: "/",
      maxAge: ONE_YEAR,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
    });
  }

  if (
    requestedValues.length > 0 &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    // La preferencia queda en cookie; limpiar el parámetro evita URLs
    // duplicadas. También se limpian valores inválidos sin alterar la cookie.
    const destination = new URL(url);
    destination.searchParams.delete(LOCALE_QUERY_PARAM);
    headers.set("Cache-Control", "private, no-store");
    // `//evil.com/x?lang=en` daría `Location: //evil.com/x`; hoy lo corrige
    // el router, pero el mismo filtro que usa `next` no depende de eso.
    throw redirect(
      303,
      safeInternalPath(`${destination.pathname}${destination.search}`),
    );
  }

  locale(selected);
};
