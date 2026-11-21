-- =============================================================================
-- Agorbis · 0050 · Retención de cuentas OAuth sin consentimiento
-- -----------------------------------------------------------------------------
-- /authorize no pasa por el middleware CAPTCHA de GoTrue y puede crear una
-- cuenta aunque el flujo no termine en el gate legal de Agorbis. Se eliminan
-- sólo cuentas sociales realmente abandonadas: sin aceptación, actividad,
-- MFA ni ingreso reciente. El cron llama esta RPC con service_role.
-- =============================================================================

insert into public.data_retention_policies (
  dataset,
  retention_days,
  rationale,
  purge_on_account_deletion
) values (
  'oauth_accounts_without_consent',
  30,
  'Cuentas sociales sin aceptación ni actividad, creadas por un OAuth que no se completó.',
  true
)
on conflict (dataset) do update
set retention_days = excluded.retention_days,
    rationale = excluded.rationale,
    purge_on_account_deletion = excluded.purge_on_account_deletion,
    updated_at = statement_timestamp();

-- `record_activation_visit()` se ejecuta al cargar la primera página con
-- sesión, incluida la pantalla de consentimiento. `visit` y `return_week` son
-- telemetría automática: no demuestran que la persona haya aceptado ni usado
-- una función cívica y, por lo tanto, no deben inmortalizar un OAuth huérfano.
-- La lista es negativa para que cualquier evento nuevo sea considerado real
-- por defecto hasta que otra migración lo clasifique explícitamente.
create or replace function private.account_has_real_activity(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = p_user and (
        p.home_community_id is not null
        or p.residence_changed_at is not null
        or p.avatar_url is not null
        or p.bio is not null
        or p.verification_level <> 0
        or p.role <> 'user'
      )
    )
    or exists (select 1 from public.follows x where x.user_id = p_user)
    or exists (select 1 from public.community_visibility x where x.user_id = p_user)
    or exists (select 1 from public.poll_participation_receipts x where x.user_id = p_user)
    or exists (select 1 from public.budget_participation_receipts x where x.user_id = p_user)
    or exists (select 1 from public.comment_votes x where x.user_id = p_user)
    or exists (select 1 from public.claim_supports x where x.user_id = p_user)
    or exists (select 1 from public.project_pledges x where x.user_id = p_user)
    or exists (select 1 from public.claim_uploads x where x.owner_id = p_user)
    or exists (
      select 1 from storage.objects x
      where x.owner = p_user or x.owner_id = p_user::text
    )
    or exists (select 1 from public.debate_comments x where x.user_id = p_user)
    or exists (select 1 from public.project_comments x where x.user_id = p_user)
    or exists (select 1 from public.project_contributions x where x.user_id = p_user)
    or exists (select 1 from public.organization_members x where x.user_id = p_user)
    or exists (select 1 from public.community_requests x where x.user_id = p_user)
    or exists (select 1 from public.organization_requests x where x.user_id = p_user)
    or exists (select 1 from public.notifications x where x.recipient_id = p_user)
    or exists (select 1 from public.reports x where x.reporter_id = p_user)
    or exists (
      select 1 from public.activation_events x
      where x.user_id = p_user
        and x.event not in ('signup', 'visit', 'return_week')
    )
    or exists (select 1 from public.ai_summary_generation_events x where x.requested_by = p_user)
    or exists (select 1 from public.ai_summary_generation_jobs x where x.requested_by = p_user)
    or exists (select 1 from public.polls x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.debates x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.claims x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.projects x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.community_info x where x.updated_by = p_user)
    or exists (select 1 from public.community_budgets x where x.created_by = p_user)
    or exists (select 1 from public.budget_proposals x where x.admitted_by = p_user)
    or exists (select 1 from public.budget_reports x where x.author_id = p_user)
    or exists (select 1 from public.claim_events x where x.actor_id = p_user)
    or exists (select 1 from public.content_sources x where x.added_by = p_user)
    or exists (select 1 from public.content_relations x where x.created_by = p_user)
    or exists (select 1 from public.institutional_responses x where x.author_id = p_user)
    or exists (select 1 from public.notifications x where x.actor_id = p_user)
    or exists (select 1 from public.organizations x where x.verified_by = p_user)
    or exists (select 1 from public.organization_members x where x.added_by = p_user)
    or exists (select 1 from public.community_requests x where x.reviewed_by = p_user)
    or exists (select 1 from public.organization_requests x where x.reviewed_by = p_user)
    or exists (select 1 from public.project_tasks x where x.assigned_user_id = p_user)
    or exists (select 1 from public.reports x where x.resolved_by = p_user)
    or exists (
      select 1 from public.user_suspensions x
      where x.user_id = p_user or x.created_by = p_user or x.lifted_by = p_user
    )
    or exists (
      select 1 from public.moderation_appeals x
      where x.appellant_id = p_user or x.reviewed_by = p_user
    )
    or exists (select 1 from public.moderation_audit_log x where x.moderator_id = p_user);
$$;

create or replace function public.purge_abandoned_oauth_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_deleted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  with candidates as (
    select u.id
    from auth.users u
    where u.created_at < statement_timestamp() - interval '30 days'
      and coalesce(u.last_sign_in_at, u.created_at)
        < statement_timestamp() - interval '30 days'
      and u.deleted_at is null
      and u.invited_at is null
      and not coalesce(u.is_anonymous, false)
      and exists (
        select 1
        from auth.identities i
        where i.user_id = u.id
          and i.provider <> 'email'
      )
      -- Una identidad social vinculada no convierte una cuenta que también
      -- tiene contraseña/email en un alta OAuth abandonada. Esas cuentas
      -- pueden llevar tiempo sin actividad y aun así conservar un método de
      -- acceso deliberadamente configurado por la persona.
      and not exists (
        select 1
        from auth.identities i
        where i.user_id = u.id
          and i.provider = 'email'
      )
      and not exists (
        select 1
        from public.user_legal_acceptances a
        where a.user_id = u.id
      )
      and not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = u.id
          and f.status = 'verified'
      )
      and not private.account_has_real_activity(u.id)
      -- Un refresh token activo no necesariamente mueve `last_sign_in_at`.
      -- Una visita reciente demuestra que la sesión sigue en uso, aunque esa
      -- telemetría no sea actividad cívica ni deba conservar la cuenta para
      -- siempre. Las visitas viejas sí vencen con la misma ventana de 30 días.
      and not exists (
        select 1
        from public.activation_events e
        where e.user_id = u.id
          and e.event in ('visit', 'return_week')
          and e.created_at >= statement_timestamp() - interval '30 days'
      )
    order by u.created_at, u.id
    limit 1000
  ), deleted as (
    delete from auth.users u
    using candidates c
    where u.id = c.id
    returning u.id
  )
  select count(*)::integer into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke all on function public.purge_abandoned_oauth_accounts()
from public, anon, authenticated, service_role;
grant execute on function public.purge_abandoned_oauth_accounts()
to service_role;
