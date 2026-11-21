-- Seguimiento manual de solicitudes recibidas en el correo de privacidad.
-- No crea trabajos de baja, elimina cuentas ni amplía la saga 0044.
begin;

create table private.data_deletion_requests (
  reference uuid primary key default gen_random_uuid(),
  status text not null default 'received'
    check (status in ('received', 'verifying', 'in_review', 'resolved', 'rejected')),
  scope text not null check (scope in ('account', 'specific_data')),
  contact_email text,
  inbox_reference text,
  verification_method text check (verification_method in ('account_email', 'alternative')),
  verification_note text,
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  resolution_code text check (resolution_code in (
    'handled', 'partially_handled', 'unable_to_verify', 'out_of_scope', 'withdrawn'
  )),
  response_sent_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  access_hash text not null check (access_hash ~ '^[a-f0-9]{64}$'),
  access_expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  constraint deletion_request_contact_length check (
    contact_email is null or (length(contact_email) between 3 and 254 and contact_email !~ '[[:cntrl:]]')
  ),
  constraint deletion_request_inbox_length check (
    inbox_reference is null or (length(inbox_reference) between 1 and 200 and inbox_reference !~ '[[:cntrl:]]')
  ),
  constraint deletion_request_verification_length check (
    verification_note is null or length(btrim(verification_note)) between 10 and 500
  ),
  constraint deletion_request_verification_state check (
    (verified_at is null) = (verification_method is null)
    and (status not in ('in_review', 'resolved') or verified_at is not null)
  ),
  constraint deletion_request_closure_state check (
    (status in ('resolved', 'rejected')) = (closed_at is not null)
    and (closed_at is null) = (response_sent_at is null)
    and (closed_at is null) = (resolution_code is null)
    and (status <> 'resolved' or resolution_code in ('handled', 'partially_handled'))
    and (status <> 'rejected' or resolution_code in ('unable_to_verify', 'out_of_scope', 'withdrawn'))
    and (closed_at is null or (contact_email is null and inbox_reference is null and verification_note is null))
  )
);
create index data_deletion_requests_queue_idx
  on private.data_deletion_requests (received_at desc, reference desc);
alter table private.data_deletion_requests enable row level security;
revoke all on private.data_deletion_requests from public, anon, authenticated, service_role;

-- Clave diaria HMAC derivada en el servidor del IP confiable; nunca se guarda IP.
create table private.data_deletion_lookup_windows (
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  hits integer not null check (hits between 1 and 20),
  primary key (source_hash, window_started_at)
);
create index data_deletion_lookup_expiry_idx
  on private.data_deletion_lookup_windows (window_started_at);
alter table private.data_deletion_lookup_windows enable row level security;
revoke all on private.data_deletion_lookup_windows from public, anon, authenticated, service_role;

create function public.list_data_deletion_requests(p_filter text default 'open', p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'AGORBIS_DELETION_REQUEST_ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if p_filter is null or p_filter not in ('open', 'all', 'resolved', 'rejected')
     or p_page is null or p_page not between 1 and 500 then
    raise exception 'AGORBIS_DELETION_REQUEST_INVALID' using errcode = 'check_violation';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) - 'access_hash' order by r.received_at desc, r.reference desc), '[]'::jsonb)
    into v_result
  from (
    select d.* from private.data_deletion_requests d
    where p_filter = 'all'
      or (p_filter = 'open' and d.status in ('received', 'verifying', 'in_review'))
      or d.status = p_filter
    order by d.received_at desc, d.reference desc
    limit 20 offset (p_page - 1) * 20
  ) r;
  return v_result;
end;
$$;

create function public.create_data_deletion_request(
  p_contact_email text, p_scope text, p_inbox_reference text, p_access_hash text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_request private.data_deletion_requests%rowtype;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'AGORBIS_DELETION_REQUEST_ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if p_contact_email is null or length(btrim(p_contact_email)) not between 3 and 254
    or p_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_scope is null or p_scope not in ('account', 'specific_data')
    or p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$'
    or p_inbox_reference is null or length(btrim(p_inbox_reference)) not between 1 and 200 then
    raise exception 'AGORBIS_DELETION_REQUEST_INVALID' using errcode = 'check_violation';
  end if;
  perform private.consume_window_limit('deletion-request-create', auth.uid(), 30, interval '1 hour');
  insert into private.data_deletion_requests (contact_email, scope, inbox_reference, access_hash, created_by)
  values (lower(btrim(p_contact_email)), p_scope, btrim(p_inbox_reference), p_access_hash, auth.uid())
  returning * into v_request;
  return jsonb_build_object('reference', v_request.reference, 'access_expires_at', v_request.access_expires_at);
end;
$$;

create function public.update_data_deletion_request(
  p_reference uuid, p_revision integer, p_status text,
  p_verification_method text default null, p_verification_note text default null,
  p_resolution_code text default null, p_response_sent boolean default false
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_request private.data_deletion_requests%rowtype; v_terminal boolean;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'AGORBIS_DELETION_REQUEST_ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  select * into v_request from private.data_deletion_requests
    where reference = p_reference for update;
  if not found or v_request.revision is distinct from p_revision
    or v_request.status in ('resolved', 'rejected') then
    raise exception 'AGORBIS_DELETION_REQUEST_STALE' using errcode = 'check_violation';
  end if;
  if p_status is null or not (
    (v_request.status = 'received' and p_status in ('verifying', 'in_review', 'rejected'))
    or (v_request.status = 'verifying' and p_status in ('in_review', 'rejected'))
    or (v_request.status = 'in_review' and p_status in ('resolved', 'rejected'))
  ) then
    raise exception 'AGORBIS_DELETION_REQUEST_TRANSITION' using errcode = 'check_violation';
  end if;
  if p_status = 'in_review' and (
    p_verification_method is null or p_verification_method not in ('account_email', 'alternative')
    or p_verification_note is null or length(btrim(p_verification_note)) not between 10 and 500
  ) then
    raise exception 'AGORBIS_DELETION_REQUEST_IDENTITY_REQUIRED' using errcode = 'check_violation';
  end if;
  v_terminal := p_status in ('resolved', 'rejected');
  if v_terminal and (not coalesce(p_response_sent, false) or p_resolution_code is null
    or (p_status = 'resolved' and p_resolution_code not in ('handled', 'partially_handled'))
    or (p_status = 'rejected' and p_resolution_code not in ('unable_to_verify', 'out_of_scope', 'withdrawn'))) then
    raise exception 'AGORBIS_DELETION_REQUEST_RESPONSE_REQUIRED' using errcode = 'check_violation';
  end if;
  perform private.consume_window_limit('deletion-request-update', auth.uid(), 60, interval '1 hour');
  update private.data_deletion_requests set
    status = p_status,
    verification_method = case when p_status = 'in_review' then p_verification_method else verification_method end,
    verification_note = case when v_terminal then null when p_status = 'in_review' then btrim(p_verification_note) else verification_note end,
    verified_at = case when p_status = 'in_review' then clock_timestamp() else verified_at end,
    verified_by = case when p_status = 'in_review' then auth.uid() else verified_by end,
    resolution_code = case when v_terminal then p_resolution_code else null end,
    response_sent_at = case when v_terminal then clock_timestamp() else null end,
    closed_at = case when v_terminal then clock_timestamp() else null end,
    closed_by = case when v_terminal then auth.uid() else null end,
    contact_email = case when v_terminal then null else contact_email end,
    inbox_reference = case when v_terminal then null else inbox_reference end,
    revision = revision + 1, updated_at = clock_timestamp()
  where reference = p_reference;
  return true;
end;
$$;

create function public.reissue_data_deletion_receipt(p_reference uuid, p_revision integer, p_access_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_request private.data_deletion_requests%rowtype;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'AGORBIS_DELETION_REQUEST_ADMIN_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'AGORBIS_DELETION_REQUEST_INVALID' using errcode = 'check_violation';
  end if;
  perform private.consume_window_limit('deletion-request-reissue', auth.uid(), 30, interval '1 hour');
  update private.data_deletion_requests set access_hash = p_access_hash,
    access_expires_at = clock_timestamp() + interval '30 days',
    revision = revision + 1, updated_at = clock_timestamp()
    where reference = p_reference and revision = p_revision returning * into v_request;
  if not found then
    raise exception 'AGORBIS_DELETION_REQUEST_STALE' using errcode = 'check_violation';
  end if;
  return jsonb_build_object('reference', v_request.reference, 'access_expires_at', v_request.access_expires_at);
end;
$$;

-- Sólo el Worker puede consultar: evita saltarse el límite cambiando su clave.
-- No lee auth.users/profiles y una referencia incorrecta no revela una cuenta.
create function public.read_data_deletion_receipt(p_reference uuid, p_access_hash text, p_source_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_window timestamptz := date_bin(interval '10 minutes', clock_timestamp(), timestamptz '2000-01-01');
  v_hits integer; v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_DELETION_RECEIPT_SERVER_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$'
    or p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$' or p_reference is null then
    return null;
  end if;
  delete from private.data_deletion_lookup_windows where window_started_at < clock_timestamp() - interval '1 day';
  insert into private.data_deletion_lookup_windows (source_hash, window_started_at, hits)
    values (p_source_hash, v_window, 1)
  on conflict (source_hash, window_started_at) do update
    set hits = private.data_deletion_lookup_windows.hits + 1
    where private.data_deletion_lookup_windows.hits < 20
  returning hits into v_hits;
  if v_hits is null then return null; end if;
  select jsonb_build_object(
    'reference', r.reference, 'status', r.status, 'received_at', r.received_at,
    'updated_at', r.updated_at, 'closed_at', r.closed_at, 'resolution_code', r.resolution_code
  ) into v_result from private.data_deletion_requests r
    where r.reference = p_reference and r.access_hash = p_access_hash
      and r.access_expires_at > clock_timestamp();
  return v_result;
end;
$$;

revoke all on function public.list_data_deletion_requests(text, integer),
  public.create_data_deletion_request(text, text, text, text),
  public.update_data_deletion_request(uuid, integer, text, text, text, text, boolean),
  public.reissue_data_deletion_receipt(uuid, integer, text),
  public.read_data_deletion_receipt(uuid, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.list_data_deletion_requests(text, integer),
  public.create_data_deletion_request(text, text, text, text),
  public.update_data_deletion_request(uuid, integer, text, text, text, text, boolean),
  public.reissue_data_deletion_receipt(uuid, integer, text) to authenticated;
grant execute on function public.read_data_deletion_receipt(uuid, text, text) to service_role;

comment on table private.data_deletion_requests is
  'Seguimiento manual; cerrar registra respuesta, no acredita borrado total. Contacto y notas se minimizan al cierre; no guardar documentos, credenciales ni cuerpos de correo.';
comment on table private.data_deletion_lookup_windows is
  'Límite del recibo anónimo, HMAC diario sin IP. Ventanas mayores a un día se eliminan al consultar.';
commit;
