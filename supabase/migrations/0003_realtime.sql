-- =============================================================================
-- Agorbis · 0003 · Canal de Realtime para resultados en vivo
-- -----------------------------------------------------------------------------
-- `poll_votes` no se puede exponer a Realtime: revelaría quién votó qué. En su
-- lugar publicamos una tabla-señal sin identidad ni opción. El cliente escucha
-- los INSERT sobre ella y vuelve a pedir los agregados por RPC (`poll_results`),
-- que ya aplica la regla de `results_visibility`.
-- =============================================================================

create table if not exists public.poll_vote_events (
  id         bigint generated always as identity primary key,
  poll_id    uuid not null references public.polls (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists poll_vote_events_poll_idx
  on public.poll_vote_events (poll_id, id desc);

comment on table public.poll_vote_events is
  'Señal pública "hubo un voto en la encuesta X". Sin user_id ni option_id: preserva el secreto del voto.';

create or replace function public.emit_poll_vote_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.poll_vote_events (poll_id) values (new.poll_id);
  return null;
end;
$$;

drop trigger if exists poll_votes_emit_event on public.poll_votes;
create trigger poll_votes_emit_event
  after insert on public.poll_votes
  for each row execute function public.emit_poll_vote_event();

-- Publicación de Realtime. `supabase_realtime` ya existe en un proyecto Supabase;
-- el bloque la crea si se corre el esquema sobre un Postgres pelado.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'poll_vote_events'
  ) then
    alter publication supabase_realtime add table public.poll_vote_events;
  end if;
end;
$$;
