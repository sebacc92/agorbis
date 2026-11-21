-- =============================================================================
-- ESTADO: RECHAZADO · NO APLICAR (ver D73 en DECISIONS.md)
-- -----------------------------------------------------------------------------
-- Este borrador desactivaba el gate legal en la base y hacía que
-- my_legal_status() devolviera accepted:true / accepted_at:now() para personas
-- que nunca aceptaron nada: fabricaría constancias de consentimiento (Ley
-- 25.326, D70, D72). Se conserva sólo como registro histórico de la propuesta
-- "Fase 1". La app volvió a exigir la aceptación versionada.
-- =============================================================================

-- 0068_phase1_simplify_participation.sql
-- Fase 1: Desbloqueo de participación cívica sin fricción burocrática/legal temprana.
-- Se simplifican las verificaciones duras de aceptación documental para que cualquier
-- usuario autenticado pueda participar de inmediato.
-- La arquitectura de retención y auditoría formal queda preservada para Fase 2.

create or replace function private.has_current_legal_acceptance(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null;
$$;

create or replace function private.has_current_international_transfer_consent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null;
$$;

create or replace function private.assert_can_participate(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if private.account_deletion_is_pending(p_user) then
    raise exception 'AGORBIS_ACCOUNT_DELETION_PENDING'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if private.active_suspension(p_user) then
    raise exception 'GEOUNITY_ACCOUNT_SUSPENDED'
      using errcode = 'insufficient_privilege';
  end if;
  -- En Fase 1 no bloqueamos la participación por aceptación de documentos legales.
end;
$$;

create or replace function public.can_participate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and not private.account_deletion_is_pending(auth.uid())
    and not private.active_suspension(auth.uid());
$$;

create or replace function public.my_legal_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_participate', public.can_participate(),
    'is_suspended', private.active_suspension(auth.uid()),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', d.document_type,
        'version', d.version,
        'effective_at', d.effective_at,
        'minimum_age', d.minimum_age,
        'accepted', true,
        'accepted_at', now()
      ) order by d.document_type)
      from public.legal_document_versions d
      where d.is_current and d.effective_at <= now()
    ), '[]'::jsonb),
    'international_transfer_consent', jsonb_build_object(
      'version', 'phase1-simplified',
      'status', 'accepted',
      'acceptedAt', now()
    )
  );
$$;
