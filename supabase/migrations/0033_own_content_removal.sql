-- =============================================================================
-- Agorbis · 0033 · Baja segura de contenido propio
-- =============================================================================
-- Una fila pasa a ser invisible apenas toma `status = 'removed'`. Por eso un
-- UPDATE directo bajo RLS no puede completar la transición: la policy SELECT
-- rechaza la fila nueva aunque la policy UPDATE autorice al autor. Esta RPC
-- conserva el contenido removido fuera de las lecturas públicas y ejecuta una
-- única transición, limitada al autor autenticado.

begin;

create or replace function public.remove_own_content(
  p_type text,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rows integer := 0;
begin
  if v_user is null then
    raise exception 'Necesitás una cuenta para dar de baja contenido';
  end if;

  case p_type
    when 'poll' then
      update public.polls
      set status = 'removed'
      where id = p_id and author_id = v_user and status <> 'removed';
    when 'debate' then
      update public.debates
      set status = 'removed'
      where id = p_id and author_id = v_user and status <> 'removed';
    when 'claim' then
      update public.claims
      set status = 'removed'
      where id = p_id and author_id = v_user and status <> 'removed';
    when 'project' then
      update public.projects
      set status = 'removed'
      where id = p_id and author_id = v_user and status <> 'removed';
    else
      raise exception 'Tipo de contenido desconocido: %', p_type;
  end case;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.remove_own_content(text, uuid) from public;
grant execute on function public.remove_own_content(text, uuid) to authenticated;

commit;
