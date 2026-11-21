import type { RequestEventLoader } from "@qwik.dev/router";
import { MAX_DEBATE_COLUMNS } from "./constants";
import { compareNames } from "./community";
import { resolveLocale } from "./i18n";
import { logFailure } from "./log";
import { requestIdOf } from "./request-id";
import { supabase } from "./session";

export async function loadDebateColumns(
  ev: RequestEventLoader,
  communityId: string,
) {
  try {
    const { data, count, error } = await supabase(ev)
      .from("communities")
      .select("id, name, emoji", { count: "exact" })
      .eq("parent_id", communityId)
      .order("name", { ascending: true })
      .limit(MAX_DEBATE_COLUMNS);
    if (error) throw error;
    const columns = [...(data ?? [])].sort((a, b) =>
      compareNames(a.name, b.name, resolveLocale(ev.locale())),
    );
    return {
      columns,
      childCount: count ?? columns.length,
      columnsFailed: false,
    };
  } catch (error) {
    logFailure(
      { scope: "debate-form/columnas", requestId: requestIdOf(ev) },
      error,
    );
    return {
      columns: [] as { id: string; name: string; emoji: string | null }[],
      childCount: 0,
      columnsFailed: true,
    };
  }
}
