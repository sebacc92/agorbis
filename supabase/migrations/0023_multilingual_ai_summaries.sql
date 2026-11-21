-- =============================================================================
-- Agorbis · 0023 · Resúmenes de IA por idioma
-- -----------------------------------------------------------------------------
-- El contenido comunitario conserva siempre su idioma original. Cada resumen
-- generado se cachea por publicación e idioma de interfaz, para que cambiar el
-- idioma nunca sobrescriba ni reutilice una salida en otro idioma.
-- =============================================================================

begin;

create table public.ai_summaries (
  content_type         text not null,
  content_id           uuid not null,
  locale               text not null,
  summary              text not null,
  key_points           jsonb not null default '[]'::jsonb,
  source_hash          text not null,
  prompt_version       integer not null default 1,
  model                text not null,
  -- Sin default deliberadamente: el generador debe declarar si la salida usa
  -- resultados. Un default false convertiría una omisión en una fuga fail-open.
  includes_poll_results boolean not null,
  generated_at         timestamptz not null default now(),

  primary key (content_type, content_id, locale),
  constraint ai_summaries_type_chk
    check (content_type in ('poll', 'debate', 'claim', 'project')),
  constraint ai_summaries_locale_chk
    check (locale ~ '^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$'),
  constraint ai_summaries_summary_chk
    check (char_length(summary) between 1 and 5000),
  constraint ai_summaries_key_points_chk
    check (jsonb_typeof(key_points) = 'array'),
  constraint ai_summaries_source_hash_chk
    check (char_length(source_hash) between 16 and 128),
  constraint ai_summaries_prompt_version_chk
    check (prompt_version > 0),
  constraint ai_summaries_poll_results_chk
    check (not includes_poll_results or content_type = 'poll')
);

create index ai_summaries_generated_at_idx
  on public.ai_summaries (generated_at desc);

create trigger ai_summaries_guard_target
  before insert or update on public.ai_summaries
  for each row execute function public.guard_polymorphic_content();

alter table public.ai_summaries enable row level security;

-- La cache completa es server-only. El backend primero reúne la fuente con el
-- cliente de sesión (RLS), calcula su hash exacto y recién entonces consulta la
-- fila mediante service_role. No exponer SELECT evita que un cliente enumere
-- versiones históricas luego de una edición o moderación.
revoke all on public.ai_summaries from public, anon, authenticated;
grant select on public.ai_summaries to service_role;

comment on table public.ai_summaries is
  'Cache server-only de resúmenes generados, separado por publicación e idioma seleccionado.';
comment on column public.ai_summaries.source_hash is
  'Hash de las fuentes usadas; permite detectar y regenerar una síntesis obsoleta.';
comment on column public.ai_summaries.includes_poll_results is
  'True si la salida revela agregados; obliga al backend a validar can_see_poll_results antes de generarla o devolverla.';

commit;
