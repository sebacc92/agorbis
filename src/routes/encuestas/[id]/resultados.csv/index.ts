import type { RequestHandler } from "@qwik.dev/router";
import { resolveLocale, translate } from "~/lib/i18n";
import { csvRow, summarizeText } from "~/lib/text";
import { supabase } from "~/lib/session";
import { isUuid } from "~/lib/http";

/**
 * Resultados de una encuesta en CSV.
 *
 * Una plataforma cívica que pide participación y después no deja llevarse los
 * números obliga a transcribirlos a mano para cualquier informe, nota o
 * presentación. Es el formato que abre cualquier planilla sin instalar nada.
 *
 * **La visibilidad no se decide acá.** Se consulta `poll_results`, que es la
 * misma función que alimenta la pantalla: sólo devuelve datos después del
 * cierre y con al menos cinco participantes. Por eso usa el cliente con sesión
 * y rechaza la descarga completa mientras el agregado siga protegido.
 */
export const onGet: RequestHandler = async (ev) => {
  const locale = resolveLocale(ev.locale());
  const db = supabase(ev);
  const pollId = ev.params.id;
  if (!isUuid(pollId)) {
    throw ev.error(404, translate(locale, "No encontramos esa encuesta."));
  }

  const { data: poll, error: pollError } = await db
    .from("polls")
    .select("id, question, status, closes_at, created_at")
    .eq("id", pollId)
    .maybeSingle();

  if (pollError) {
    throw ev.error(500, translate(locale, "No pudimos generar el archivo."));
  }
  if (!poll) {
    throw ev.error(404, translate(locale, "No encontramos esa encuesta."));
  }

  const [{ data: rows }, { data: stats }] = await Promise.all([
    db.rpc("poll_results", { p_poll: pollId }),
    db.rpc("poll_stats", { p_poll: pollId }),
  ]);

  const results = rows ?? [];
  const pollStats = stats?.[0];
  if (!pollStats?.can_see) {
    throw ev.error(
      403,
      translate(
        locale,
        "Los resultados y el CSV se publican sólo al cierre y con al menos 5 participantes.",
      ),
    );
  }
  const totalVotes = pollStats.total_votes ?? 0;

  // Cabecera en el idioma de quien descarga: el archivo se abre en una
  // planilla, lejos de la app, y una columna "votes" en una interfaz en
  // español no se entiende sola.
  let csv = csvRow([
    translate(locale, "Opción"),
    translate(locale, "Votos"),
    translate(locale, "Porcentaje"),
  ]);

  for (const row of results) {
    const votes = Number(row.votes ?? 0);
    csv += csvRow([
      row.label,
      votes,
      // Con dos decimales y punto: es un CSV, no una vista. El separador
      // decimal local lo aplica la planilla al importarlo.
      totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(2) : "0.00",
    ]);
  }

  // Una fila final con el total evita que quien abra el archivo tenga que
  // sumar la columna para saber sobre cuántos votos se calcularon los
  // porcentajes.
  csv += csvRow([translate(locale, "Total"), totalVotes, "100.00"]);

  // El nombre sale de la pregunta para que veinte descargas no sean veinte
  // `resultados.csv` en la carpeta. Se limita a caracteres seguros: el resto
  // rompe el header en algunos navegadores.
  const slug =
    summarizeText(poll.question, 60)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "encuesta";

  ev.headers.set("Content-Type", "text/csv; charset=utf-8");
  ev.headers.set(
    "Content-Disposition",
    `attachment; filename="${slug}-${poll.id.slice(0, 8)}.csv"`,
  );
  // Aun siendo finales, no se guardan copias en caches compartidas: una baja
  // moderada de la encuesta debe reflejarse de inmediato.
  ev.headers.set("Cache-Control", "private, no-store");
  // El archivo lo abre una planilla; que no se interprete como otra cosa.
  ev.headers.set("X-Content-Type-Options", "nosniff");

  // BOM: sin él, Excel en Windows lee el UTF-8 como Latin-1 y cualquier
  // opción con tilde o ñ aparece rota. Va como escape y no como carácter
  // literal, que es invisible en el editor y el lint lo rechaza por eso mismo.
  ev.send(200, `\uFEFF${csv}`);
};
