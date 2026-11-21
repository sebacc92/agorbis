-- 0072 · El primer acuse institucional debe detener el reloj sin ampliar permisos (D86).
-- La guarda anterior rechazaba también el UPDATE interno de 0026 y revertía
-- un evento autorizado por la RPC y por la guarda de organización de 0039.
begin;

create or replace function public.guard_claim_institutional_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- El evento institucional ya pasó su guarda. Sólo su escritura anidada y
  -- exacta puede detener el reloj; una edición manual conserva el rechazo.
  if pg_trigger_depth() > 1
     and old.first_response_at is null
     and new.first_response_at = transaction_timestamp()
     and (to_jsonb(new) - 'first_response_at')
         is not distinct from (to_jsonb(old) - 'first_response_at')
     and public.can_update_claim_as_org(auth.uid(), old.id)
     and exists (
       select 1 from public.claim_events e
       where e.claim_id = old.id
         and e.actor_id = auth.uid()
         and e.organization_id = old.responsible_organization_id
     ) then
    return new;
  end if;

  if not public.is_moderator(auth.uid())
     and old.author_id is distinct from auth.uid()
     and public.can_update_claim_as_org(auth.uid(), old.id)
     and (to_jsonb(new) - 'status' - 'support_count')
         is distinct from (to_jsonb(old) - 'status' - 'support_count') then
    raise exception 'La institución responsable sólo puede actualizar el estado del reclamo';
  end if;
  return new;
end;
$$;

commit;
