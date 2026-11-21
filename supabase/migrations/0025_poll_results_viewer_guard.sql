-- =============================================================================
-- Agorbis · 0025 · Visibilidad de resultados ligada a la sesión
-- -----------------------------------------------------------------------------
-- La función histórica aceptaba `p_user` con default `auth.uid()` y estaba
-- concedida al navegador. Eso permitía preguntar por el estado de voto de otro
-- UUID. Se conserva la variante de dos argumentos sólo para backend/funciones
-- internas y se expone una variante de un argumento que siempre usa auth.uid().
-- =============================================================================

begin;

-- `create or replace` no puede quitarle el default a un parámetro existente
-- ("cannot remove parameter defaults from existing function"), y 0002 creó esta
-- función con `p_user uuid default auth.uid()`. Sin este drop, la migración
-- falla en cualquier base donde 0002 ya corrió — es decir, en todas.
--
-- El drop es seguro: los cuerpos `language sql` se guardan como texto y no
-- registran dependencia, así que las funciones de 0011 que la invocan con un
-- solo argumento siguen resolviendo contra la variante que se crea más abajo,
-- dentro de esta misma transacción.
drop function if exists public.can_see_poll_results(uuid, uuid);

create or replace function public.can_see_poll_results(
  p_poll uuid,
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p.results_visibility
    when 'always' then true
    when 'after_close' then
      p.status = 'closed' or (p.closes_at is not null and p.closes_at <= now())
    when 'after_vote' then
      p.status = 'closed'
      or (p.closes_at is not null and p.closes_at <= now())
      or (p_user is not null and exists (
            select 1 from public.poll_votes v
            where v.poll_id = p.id and v.user_id = p_user
          ))
    else false
  end
  from public.polls p
  where p.id = p_poll;
$$;

revoke all on function public.can_see_poll_results(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.can_see_poll_results(uuid, uuid)
  to service_role;

create or replace function public.can_see_poll_results(p_poll uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.can_see_poll_results(p_poll, auth.uid()),
    false
  );
$$;

revoke all on function public.can_see_poll_results(uuid)
  from public;
grant execute on function public.can_see_poll_results(uuid)
  to anon, authenticated, service_role;

comment on function public.can_see_poll_results(uuid) is
  'Comprueba la visibilidad de resultados exclusivamente para auth.uid(); es la única variante pública.';
comment on function public.can_see_poll_results(uuid, uuid) is
  'Variante interna para backend confiable; nunca debe concederse a anon/authenticated.';

commit;
