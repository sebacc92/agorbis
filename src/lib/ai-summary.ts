import type { ContentType, Tables } from "./database.types.helpers";
import type { Locale } from "./i18n";
import type { DB } from "./supabase";

export const AI_SUMMARY_PROMPT_VERSION = 1;

export interface AiSummaryView {
  summary: string;
  keyPoints: string[];
  generatedAt: string;
  model: string;
}

export interface AiSummaryCacheEntry extends AiSummaryView {
  includesPollResults: boolean;
}

export function aiSummaryView(entry: AiSummaryCacheEntry): AiSummaryView {
  return {
    summary: entry.summary,
    keyPoints: entry.keyPoints,
    generatedAt: entry.generatedAt,
    model: entry.model,
  };
}

interface InstitutionalResponseSource {
  type: string;
  body: string;
}

export type AiSummarySource =
  | {
      type: "poll";
      question: string;
      description: string | null;
      options: string[];
    }
  | {
      type: "debate";
      title: string;
      body: string;
      status: string;
      comments: { column: string | null; body: string }[];
      institutionalResponses: InstitutionalResponseSource[];
      attachedSources: {
        title: string;
        publisher: string | null;
        publishedAt: string | null;
        verified: boolean;
      }[];
    }
  | {
      type: "claim";
      title: string;
      description: string;
      category: string;
      status: string;
      location: string | null;
      events: {
        type: string;
        title: string;
        body: string | null;
        status: string | null;
        date: string;
      }[];
      institutionalResponses: InstitutionalResponseSource[];
    }
  | {
      type: "project";
      title: string;
      summary: string;
      plan: string;
      status: string;
      budget: { amount: number; currency: string } | null;
      resourcesNeeded: string | null;
      timeEstimate: string | null;
      milestones: {
        title: string;
        description: string | null;
        status: string;
        targetDate: string | null;
      }[];
      tasks: {
        title: string;
        description: string | null;
        skillsNeeded: string | null;
        status: string;
        dueDate: string | null;
      }[];
      questionsAndAnswers: { kind: "question" | "reply"; body: string }[];
      institutionalResponses: InstitutionalResponseSource[];
    };

type PollSource = Extract<AiSummarySource, { type: "poll" }>;
type DebateSource = Extract<AiSummarySource, { type: "debate" }>;
type ClaimSource = Extract<AiSummarySource, { type: "claim" }>;
type ProjectSource = Extract<AiSummarySource, { type: "project" }>;

function stringArray(value: Tables<"ai_summaries">["key_points"]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** El hash se calcula sobre exactamente los fragmentos ya limitados. */
function clip(value: string, maxLength: number): string {
  const codePoints = Array.from(value);
  return codePoints.length <= maxLength
    ? value
    : codePoints.slice(0, maxLength).join("");
}

async function collectPollSource(
  db: DB,
  contentId: string,
): Promise<PollSource | null> {
  const [pollResult, optionsResult] = await Promise.all([
    db
      .from("polls")
      .select("question, description")
      .eq("id", contentId)
      .maybeSingle(),
    db
      .from("poll_options")
      .select("id, label, sort_order")
      .eq("poll_id", contentId)
      .order("sort_order")
      .order("id")
      .limit(10),
  ]);
  if (pollResult.error || optionsResult.error) {
    throw new Error("No se pudo leer la fuente de la encuesta.");
  }
  if (!pollResult.data) return null;
  return {
    type: "poll",
    question: clip(pollResult.data.question, 500),
    description: pollResult.data.description
      ? clip(pollResult.data.description, 2_000)
      : null,
    options: (optionsResult.data ?? []).map((option) =>
      clip(option.label, 300),
    ),
  };
}

export function selectDiverseDebateComments(
  rows: readonly { columnId: string; body: string }[],
  columnNames: ReadonlyMap<string, string>,
  limit = 12,
): DebateSource["comments"] {
  const byColumn = new Map<string, string[]>();
  for (const row of rows) {
    const group = byColumn.get(row.columnId) ?? [];
    group.push(row.body);
    byColumn.set(row.columnId, group);
  }

  const selected: DebateSource["comments"] = [];
  let round = 0;
  while (selected.length < limit) {
    let foundInRound = false;
    for (const [columnId, comments] of byColumn) {
      const body = comments[round];
      if (body === undefined) continue;
      foundInRound = true;
      selected.push({
        column: columnNames.get(columnId) ?? null,
        body: clip(body, 800),
      });
      if (selected.length === limit) break;
    }
    if (!foundInRound) break;
    round += 1;
  }
  return selected;
}

async function collectDebateSource(
  db: DB,
  contentId: string,
): Promise<DebateSource | null> {
  const [debateResult, commentsResult, responsesResult, sourcesResult] =
    await Promise.all([
      db
        .from("debates")
        .select("title, body, status")
        .eq("id", contentId)
        .maybeSingle(),
      db
        .from("debate_comments")
        .select("id, body, score, created_at, column_community_id")
        .eq("debate_id", contentId)
        .eq("status", "visible")
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .limit(400),
      db
        .from("institutional_responses")
        .select("id, response_type, body, created_at")
        .eq("content_type", "debate")
        .eq("content_id", contentId)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(6),
      db
        .from("content_sources")
        .select("id, title, publisher, published_at, verified_at, created_at")
        .eq("content_type", "debate")
        .eq("content_id", contentId)
        .order("created_at", { ascending: false })
        .order("id")
        .limit(8),
    ]);
  if (
    debateResult.error ||
    commentsResult.error ||
    responsesResult.error ||
    sourcesResult.error
  ) {
    throw new Error("No se pudo leer la fuente del debate.");
  }
  if (!debateResult.data) return null;

  const comments = commentsResult.data ?? [];
  const columnIds = [
    ...new Set(comments.map((comment) => comment.column_community_id)),
  ];
  const columnNames = new Map<string, string>();
  if (columnIds.length > 0) {
    const columnsResult = await db
      .from("communities")
      .select("id, name")
      .in("id", columnIds);
    if (columnsResult.error) {
      throw new Error("No se pudieron leer las columnas del debate.");
    }
    for (const column of columnsResult.data ?? []) {
      columnNames.set(column.id, column.name);
    }
  }

  return {
    type: "debate",
    title: clip(debateResult.data.title, 300),
    body: clip(debateResult.data.body, 4_000),
    status: debateResult.data.status,
    // Round-robin: cada columna aporta una voz antes de repetir columna.
    comments: selectDiverseDebateComments(
      comments.map((comment) => ({
        columnId: comment.column_community_id,
        body: comment.body,
      })),
      columnNames,
    ),
    institutionalResponses: (responsesResult.data ?? []).map((response) => ({
      type: response.response_type,
      body: clip(response.body, 1_200),
    })),
    attachedSources: (sourcesResult.data ?? []).map((source) => ({
      title: clip(source.title, 250),
      publisher: source.publisher ? clip(source.publisher, 200) : null,
      publishedAt: source.published_at,
      verified: source.verified_at !== null,
    })),
  };
}

async function collectClaimSource(
  db: DB,
  contentId: string,
): Promise<ClaimSource | null> {
  const [claimResult, eventsResult, responsesResult] = await Promise.all([
    db
      .from("claims")
      .select("title, description, category, status, location_text")
      .eq("id", contentId)
      .maybeSingle(),
    db
      .from("claim_events")
      .select("id, event_type, title, body, status, event_date, created_at")
      .eq("claim_id", contentId)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .limit(12),
    db
      .from("institutional_responses")
      .select("id, response_type, body, created_at")
      .eq("content_type", "claim")
      .eq("content_id", contentId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(6),
  ]);
  if (claimResult.error || eventsResult.error || responsesResult.error) {
    throw new Error("No se pudo leer la fuente del reclamo.");
  }
  const data = claimResult.data;
  if (!data) return null;
  return {
    type: "claim",
    title: clip(data.title, 250),
    description: clip(data.description, 2_000),
    category: data.category,
    status: data.status,
    location: data.location_text ? clip(data.location_text, 300) : null,
    events: (eventsResult.data ?? []).map((event) => ({
      type: event.event_type,
      title: clip(event.title, 250),
      body: event.body ? clip(event.body, 1_200) : null,
      status: event.status,
      date: event.event_date,
    })),
    institutionalResponses: (responsesResult.data ?? []).map((response) => ({
      type: response.response_type,
      body: clip(response.body, 1_200),
    })),
  };
}

async function collectProjectSource(
  db: DB,
  contentId: string,
): Promise<ProjectSource | null> {
  const [
    projectResult,
    milestonesResult,
    tasksResult,
    commentsResult,
    responsesResult,
  ] = await Promise.all([
    db
      .from("projects")
      .select(
        "title, summary, plan, status, budget_amount, currency, resources_needed, time_estimate",
      )
      .eq("id", contentId)
      .maybeSingle(),
    db
      .from("project_milestones")
      .select("id, title, description, status, target_date, sort_order")
      .eq("project_id", contentId)
      .order("sort_order")
      .order("id")
      .limit(12),
    db
      .from("project_tasks")
      .select(
        "id, title, description, skills_needed, status, due_date, created_at",
      )
      .eq("project_id", contentId)
      .order("created_at")
      .order("id")
      .limit(20),
    db
      .from("project_comments")
      .select("id, body, parent_id, created_at")
      .eq("project_id", contentId)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(16),
    db
      .from("institutional_responses")
      .select("id, response_type, body, created_at")
      .eq("content_type", "project")
      .eq("content_id", contentId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(6),
  ]);
  if (
    projectResult.error ||
    milestonesResult.error ||
    tasksResult.error ||
    commentsResult.error ||
    responsesResult.error
  ) {
    throw new Error("No se pudo leer la fuente del proyecto.");
  }
  const data = projectResult.data;
  if (!data) return null;
  return {
    type: "project",
    title: clip(data.title, 250),
    summary: clip(data.summary, 500),
    plan: clip(data.plan, 5_000),
    status: data.status,
    budget:
      data.budget_amount === null
        ? null
        : { amount: Number(data.budget_amount), currency: data.currency },
    resourcesNeeded: data.resources_needed
      ? clip(data.resources_needed, 1_000)
      : null,
    timeEstimate: data.time_estimate ? clip(data.time_estimate, 200) : null,
    milestones: (milestonesResult.data ?? []).map((milestone) => ({
      title: clip(milestone.title, 250),
      description: milestone.description
        ? clip(milestone.description, 1_000)
        : null,
      status: milestone.status,
      targetDate: milestone.target_date,
    })),
    tasks: (tasksResult.data ?? []).map((task) => ({
      title: clip(task.title, 250),
      description: task.description ? clip(task.description, 800) : null,
      skillsNeeded: task.skills_needed ? clip(task.skills_needed, 500) : null,
      status: task.status,
      dueDate: task.due_date,
    })),
    questionsAndAnswers: [...(commentsResult.data ?? [])]
      .reverse()
      .map((comment) => ({
        kind: comment.parent_id ? ("reply" as const) : ("question" as const),
        body: clip(comment.body, 800),
      })),
    institutionalResponses: (responsesResult.data ?? []).map((response) => ({
      type: response.response_type,
      body: clip(response.body, 1_200),
    })),
  };
}

/**
 * Reúne una fuente pequeña y explícita para cada publicación. Las encuestas no
 * consultan votos, estadísticas ni resultados bajo ninguna circunstancia.
 */
export async function collectAiSummarySource(
  db: DB,
  contentType: ContentType,
  contentId: string,
): Promise<AiSummarySource | null> {
  if (contentType === "poll") return collectPollSource(db, contentId);
  if (contentType === "debate") return collectDebateSource(db, contentId);
  if (contentType === "claim") return collectClaimSource(db, contentId);
  return collectProjectSource(db, contentId);
}

/**
 * SHA-256 hexadecimal mediante Web Crypto (Edge-safe). La versión del prompt
 * integra la identidad para invalidar toda salida creada con instrucciones
 * anteriores aunque las fuentes ciudadanas sigan iguales.
 */
export async function hashAiSummarySource(
  source: AiSummarySource,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ promptVersion: AI_SUMMARY_PROMPT_VERSION, source }),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Carga exclusivamente publicación, fuente, versión e idioma exactos. Si
 * cambia una fuente, la tarjeta deja de mostrar el resumen viejo.
 */
/**
 * La generación automática queda fuera del lanzamiento (`.env.example`): sin
 * estas dos variables la acción contestaba 503 recién después del clic. El
 * loader lo averigua antes y la tarjeta no ofrece lo que no va a pasar (D74).
 */
export function isAiSummaryConfigured(env: {
  get(key: string): string | undefined;
}): boolean {
  return (
    !!env.get("OPENAI_API_KEY")?.trim() &&
    !!env.get("OPENAI_SUMMARY_MODEL")?.trim()
  );
}

export async function loadAiSummary(
  sourceDb: DB,
  cacheDb: DB,
  contentType: ContentType,
  contentId: string,
  locale: Locale,
): Promise<AiSummaryView | null> {
  try {
    // `sourceDb` conserva la sesión/RLS. Sólo después de obtener y hashear esa
    // fuente visible se consulta con `cacheDb` (service_role) la fila exacta.
    const source = await collectAiSummarySource(
      sourceDb,
      contentType,
      contentId,
    );
    if (!source) return null;
    const cached = await loadAiSummaryByHash(
      cacheDb,
      contentType,
      contentId,
      locale,
      await hashAiSummarySource(source),
    );
    if (!cached) return null;

    if (cached.includesPollResults) {
      // `cacheDb` usa service_role y saltea RLS: la barrera de resultados debe
      // evaluarse explícitamente con la sesión real y fallar cerrada.
      if (contentType !== "poll") return null;
      const { data: canSeeResults, error } = await sourceDb.rpc(
        "can_see_poll_results",
        { p_poll: contentId },
      );
      if (error || canSeeResults !== true) return null;
    }
    return aiSummaryView(cached);
  } catch {
    // Mejora progresiva: una falla de cache no bloquea la publicación.
    return null;
  }
}

export async function loadAiSummaryByHash(
  db: DB,
  contentType: ContentType,
  contentId: string,
  locale: Locale,
  sourceHash: string,
): Promise<AiSummaryCacheEntry | null> {
  const { data } = await db
    .from("ai_summaries")
    .select("summary, key_points, generated_at, model, includes_poll_results")
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .eq("locale", locale)
    .eq("source_hash", sourceHash)
    .eq("prompt_version", AI_SUMMARY_PROMPT_VERSION)
    .maybeSingle();

  if (!data) return null;
  return {
    summary: data.summary,
    keyPoints: stringArray(data.key_points),
    generatedAt: data.generated_at,
    model: data.model,
    includesPollResults: data.includes_poll_results,
  };
}
