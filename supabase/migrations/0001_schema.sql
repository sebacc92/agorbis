-- =============================================================================
-- Agorbis · 0001 · Esquema base
-- -----------------------------------------------------------------------------
-- Jerarquía de comunidades por *materialized path* (columna `path` con
-- segmentos separados por puntos, ej. `earth.south-america.argentina`).
-- Ver DECISIONS.md para el razonamiento frente a `ltree`.
-- =============================================================================

-- pgcrypto vive en el esquema `extensions` en Supabase (cloud y local). Se crea
-- ahí también en un Postgres pelado para que `extensions.crypt()` —que usa el
-- seed— resuelva igual en los tres entornos, sin depender del search_path.
-- El esquema ya existe en Supabase; el `if not exists` lo cubre en el resto.
-- (`gen_random_uuid()`, que se usa como DEFAULT, es de core desde PostgreSQL 13
-- y no depende de esta extensión.)
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;

-- -----------------------------------------------------------------------------
-- communities
-- -----------------------------------------------------------------------------
create table if not exists public.communities (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  level        smallint not null,
  parent_id    uuid references public.communities (id) on delete restrict,
  path         text not null unique,
  emoji        text,
  description  text,
  member_count int not null default 0,
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now(),

  constraint communities_level_range_chk check (level between 0 and 5),
  -- El nivel 0 (Tierra) es el único sin padre.
  constraint communities_root_chk check ((level = 0) = (parent_id is null)),
  -- Slug kebab-case: es el segmento que se concatena en `path`.
  constraint communities_slug_format_chk check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- `path` sólo puede contener slugs unidos por puntos: garantiza que `LIKE`
  -- por prefijo nunca reciba comodines (`%`, `_`) desde los datos.
  constraint communities_path_format_chk check (path ~ '^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$'),
  constraint communities_member_count_chk check (member_count >= 0)
);

-- Índice para consultas por prefijo (`path LIKE 'earth.south-america.%'`).
-- `text_pattern_ops` hace que el LIKE anclado use el índice sea cual sea el collation.
create index if not exists communities_path_prefix_idx
  on public.communities (path text_pattern_ops);
create index if not exists communities_parent_idx on public.communities (parent_id);
create index if not exists communities_level_idx on public.communities (level);
-- Búsqueda por nombre en el selector de ubicación del onboarding.
create index if not exists communities_name_trgm_idx on public.communities (lower(name) text_pattern_ops);

comment on column public.communities.path is
  'Materialized path, ej. earth.south-america.argentina.buenos-aires.mar-del-plata';
comment on column public.communities.level is
  '0=global, 1=continente, 2=país, 3=subdivisión, 4=ciudad, 5=barrio (reservado)';

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  username             text not null unique,
  display_name         text,
  avatar_url           text,
  bio                  text,
  home_community_id    uuid references public.communities (id) on delete set null,
  residence_changed_at timestamptz,
  verification_level   smallint not null default 0,
  role                 text not null default 'user',
  created_at           timestamptz not null default now(),

  constraint profiles_username_format_chk check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_role_chk check (role in ('user', 'moderator', 'admin')),
  constraint profiles_verification_chk check (verification_level between 0 and 2),
  constraint profiles_bio_len_chk check (bio is null or char_length(bio) <= 300),
  constraint profiles_display_name_len_chk check (display_name is null or char_length(display_name) <= 60)
);

create index if not exists profiles_home_community_idx on public.profiles (home_community_id);

-- -----------------------------------------------------------------------------
-- community_info · "la wiki de lo esencial": una entrada por categoría
-- -----------------------------------------------------------------------------
create table if not exists public.community_info (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  category     text not null,
  title        text not null,
  content      text not null,
  image_url    text,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),

  constraint community_info_category_chk check (
    category in ('historia', 'cultura', 'geografia', 'economia', 'gastronomia', 'simbolo', 'dato_curioso')
  ),
  constraint community_info_content_len_chk check (char_length(content) <= 1500),
  constraint community_info_title_len_chk check (char_length(title) between 1 and 120),
  constraint community_info_unique_category unique (community_id, category)
);

create index if not exists community_info_community_idx on public.community_info (community_id);

-- -----------------------------------------------------------------------------
-- follows
-- -----------------------------------------------------------------------------
create table if not exists public.follows (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  community_id uuid not null references public.communities (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, community_id)
);

create index if not exists follows_community_idx on public.follows (community_id);

-- -----------------------------------------------------------------------------
-- Encuestas
-- -----------------------------------------------------------------------------
create table if not exists public.polls (
  id                  uuid primary key default gen_random_uuid(),
  community_id        uuid not null references public.communities (id) on delete cascade,
  author_id           uuid references public.profiles (id) on delete set null,
  question            text not null,
  description         text,
  type                text not null,
  closes_at           timestamptz,
  results_visibility  text not null default 'after_vote',
  status              text not null default 'active',
  created_at          timestamptz not null default now(),

  constraint polls_question_len_chk check (char_length(question) between 3 and 300),
  constraint polls_description_len_chk check (description is null or char_length(description) <= 1000),
  constraint polls_type_chk check (type in ('single', 'multiple', 'binary')),
  constraint polls_results_visibility_chk check (results_visibility in ('always', 'after_vote', 'after_close')),
  constraint polls_status_chk check (status in ('active', 'closed', 'removed')),
  -- Permite el FK compuesto desde poll_votes, que mantiene `poll_type` sincronizado.
  constraint polls_id_type_key unique (id, type)
);

create index if not exists polls_community_created_idx
  on public.polls (community_id, created_at desc, id desc);

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls (id) on delete cascade,
  label    text not null,
  sort_order smallint not null default 0,

  constraint poll_options_label_len_chk check (char_length(label) between 1 and 120),
  -- Permite el FK compuesto desde poll_votes: la opción debe ser de esa misma encuesta.
  constraint poll_options_poll_id_key unique (poll_id, id)
);

create index if not exists poll_options_poll_idx on public.poll_options (poll_id, sort_order);

create table if not exists public.poll_votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null,
  option_id  uuid not null,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- Denormalizado desde polls.type mediante FK compuesto: permite el índice único
  -- parcial de abajo, que hace imposible (a nivel motor, sin carreras) emitir dos
  -- votos en una encuesta `single`/`binary`.
  poll_type  text not null,
  created_at timestamptz not null default now(),

  constraint poll_votes_poll_fk foreign key (poll_id, poll_type)
    references public.polls (id, type) on update cascade on delete cascade,
  -- Garantiza que la opción pertenezca a la encuesta votada.
  constraint poll_votes_option_fk foreign key (poll_id, option_id)
    references public.poll_options (poll_id, id) on delete cascade,
  constraint poll_votes_unique_option unique (poll_id, user_id, option_id)
);

-- Un voto por usuario por encuesta cuando el tipo no es `multiple`.
create unique index if not exists poll_votes_one_per_user_idx
  on public.poll_votes (poll_id, user_id)
  where poll_type <> 'multiple';

create index if not exists poll_votes_option_idx on public.poll_votes (option_id);
create index if not exists poll_votes_user_idx on public.poll_votes (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Debates (la grilla)
-- -----------------------------------------------------------------------------
create table if not exists public.debates (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  title        text not null,
  body         text not null,
  author_id    uuid references public.profiles (id) on delete set null,
  status       text not null default 'open',
  created_at   timestamptz not null default now(),

  constraint debates_title_len_chk check (char_length(title) between 3 and 200),
  constraint debates_body_len_chk check (char_length(body) between 1 and 4000),
  constraint debates_status_chk check (status in ('open', 'closed', 'removed'))
);

create index if not exists debates_community_created_idx
  on public.debates (community_id, created_at desc, id desc);

create table if not exists public.debate_comments (
  id                  uuid primary key default gen_random_uuid(),
  debate_id           uuid not null references public.debates (id) on delete cascade,
  -- Hijo directo de la comunidad del debate: la "columna" de la grilla.
  column_community_id uuid not null references public.communities (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  body                text not null,
  score               int not null default 0,
  status              text not null default 'visible',
  created_at          timestamptz not null default now(),

  constraint debate_comments_body_len_chk check (char_length(body) between 1 and 1000),
  constraint debate_comments_status_chk check (status in ('visible', 'removed'))
);

create index if not exists debate_comments_column_idx
  on public.debate_comments (debate_id, column_community_id, score desc, created_at desc);
create index if not exists debate_comments_user_idx
  on public.debate_comments (user_id, created_at desc);

create table if not exists public.comment_votes (
  comment_id uuid not null references public.debate_comments (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  value      smallint not null,
  created_at timestamptz not null default now(),

  primary key (comment_id, user_id),
  constraint comment_votes_value_chk check (value in (-1, 1))
);

create index if not exists comment_votes_user_idx on public.comment_votes (user_id);

-- -----------------------------------------------------------------------------
-- Reclamos
-- -----------------------------------------------------------------------------
create table if not exists public.claims (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid not null references public.communities (id) on delete cascade,
  author_id     uuid references public.profiles (id) on delete set null,
  title         text not null,
  description   text not null,
  category      text not null,
  image_url     text,
  status        text not null default 'open',
  support_count int not null default 0,
  created_at    timestamptz not null default now(),

  constraint claims_title_len_chk check (char_length(title) between 3 and 150),
  constraint claims_description_len_chk check (char_length(description) between 1 and 2000),
  constraint claims_category_chk check (
    category in ('infraestructura', 'servicios', 'seguridad', 'salud',
                 'educacion', 'ambiente', 'transporte', 'otro')
  ),
  constraint claims_status_chk check (status in ('open', 'acknowledged', 'resolved', 'removed')),
  constraint claims_support_count_chk check (support_count >= 0)
);

create index if not exists claims_community_created_idx
  on public.claims (community_id, created_at desc, id desc);
create index if not exists claims_community_support_idx
  on public.claims (community_id, support_count desc, created_at desc);

create table if not exists public.claim_supports (
  claim_id   uuid not null references public.claims (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (claim_id, user_id)
);

create index if not exists claim_supports_user_idx on public.claim_supports (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Proyectos
-- -----------------------------------------------------------------------------
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  community_id     uuid not null references public.communities (id) on delete cascade,
  author_id        uuid references public.profiles (id) on delete set null,
  title            text not null,
  summary          text not null,
  plan             text not null,
  budget_amount    numeric(14, 2),
  currency         text not null default 'ARS',
  resources_needed text,
  time_estimate    text,
  status           text not null default 'proposal',
  pledged_total    numeric(14, 2) not null default 0,
  created_at       timestamptz not null default now(),

  constraint projects_title_len_chk check (char_length(title) between 3 and 150),
  constraint projects_summary_len_chk check (char_length(summary) between 1 and 300),
  constraint projects_plan_len_chk check (char_length(plan) between 1 and 5000),
  constraint projects_resources_len_chk check (resources_needed is null or char_length(resources_needed) <= 1000),
  constraint projects_time_estimate_len_chk check (time_estimate is null or char_length(time_estimate) <= 120),
  constraint projects_currency_chk check (currency ~ '^[A-Z]{3}$'),
  constraint projects_budget_chk check (budget_amount is null or budget_amount > 0),
  constraint projects_status_chk check (
    status in ('proposal', 'funding', 'in_progress', 'completed', 'removed')
  ),
  constraint projects_pledged_total_chk check (pledged_total >= 0)
);

create index if not exists projects_community_created_idx
  on public.projects (community_id, created_at desc, id desc);

-- Compromisos de aporte. NO hay dinero real involucrado en el MVP.
create table if not exists public.project_pledges (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     numeric(14, 2) not null,
  message    text,
  created_at timestamptz not null default now(),

  constraint project_pledges_amount_chk check (amount > 0),
  constraint project_pledges_message_len_chk check (message is null or char_length(message) <= 280),
  -- Un compromiso vigente por usuario y proyecto (se puede actualizar el monto).
  constraint project_pledges_unique_user unique (project_id, user_id)
);

create index if not exists project_pledges_project_idx
  on public.project_pledges (project_id, created_at desc);
create index if not exists project_pledges_user_idx
  on public.project_pledges (user_id, created_at desc);

create table if not exists public.project_comments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  parent_id  uuid references public.project_comments (id) on delete cascade,
  status     text not null default 'visible',
  created_at timestamptz not null default now(),

  constraint project_comments_body_len_chk check (char_length(body) between 1 and 1000),
  constraint project_comments_status_chk check (status in ('visible', 'removed'))
);

create index if not exists project_comments_project_idx
  on public.project_comments (project_id, created_at asc);

-- -----------------------------------------------------------------------------
-- Moderación
-- -----------------------------------------------------------------------------
create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  reason      text not null,
  status      text not null default 'pending',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint reports_target_type_chk check (
    target_type in ('debate_comment', 'claim', 'project', 'poll', 'debate')
  ),
  constraint reports_reason_len_chk check (char_length(reason) between 3 and 500),
  constraint reports_status_chk check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  -- Un reporte por usuario y objeto: evita el spam de reportes duplicados.
  constraint reports_unique_reporter unique (reporter_id, target_type, target_id)
);

create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
create index if not exists reports_target_idx on public.reports (target_type, target_id);
