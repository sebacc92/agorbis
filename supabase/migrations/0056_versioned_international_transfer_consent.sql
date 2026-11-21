-- =============================================================================
-- Agorbis · 0056 · Consentimiento versionado para transferencias internacionales
-- -----------------------------------------------------------------------------
-- La lectura de Privacidad y el consentimiento especial son decisiones
-- distintas. El aviso tiene versión/hash propios y la única escritura posible
-- es una RPC ligada a auth.uid(); no se crea ninguna aceptación por backfill.
-- =============================================================================

begin;

-- Es una migración one-shot: ante una historia incompleta o una ejecución
-- fuera de orden, aborta toda la transacción en vez de fabricar continuidad.
do $migration_guard$
begin
  if (select count(*) from public.legal_document_versions where is_current) <> 3
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'privacy'
         and version = '2026-08-24.1'
         and is_current
     )
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'terms'
         and version = '2026-08-23'
         and is_current
     )
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'community_rules'
         and version = '2026-08-23'
         and is_current
     ) then
    raise exception 'AGORBIS_0056_LEGAL_HISTORY_PRECONDITION_FAILED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end;
$migration_guard$;

-- La explicación sobre consentimiento, retiro y el límite del primer request
-- cambia materialmente la Política, por lo que invalida su versión anterior.
update public.legal_document_versions
set is_current = false
where document_type = 'privacy'
  and is_current;

insert into public.legal_document_versions (
  document_type,
  version,
  content_hash,
  effective_at,
  minimum_age,
  is_current
) values (
  'privacy',
  '2026-08-24.2',
  'fb6baddcf3ee2df6f47bf51cfc60cf01516bb53e10c91843126e5f89cbc48caa',
  timestamptz '2026-08-24 00:00:00+00',
  0,
  true
);

-- El snapshot conserva el texto exacto mostrado. `check-legal.mjs` serializa
-- ese mismo objeto con JSON.stringify y verifica el SHA-256 antes de cada build.
create table public.international_transfer_notice_versions (
  version text primary key,
  content_hash text not null,
  content_snapshot jsonb not null,
  content_hash_algorithm text not null default 'sha256-json-stringify-v1',
  provider_register_version text not null,
  effective_at timestamptz not null,
  superseded_at timestamptz,
  is_current boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  constraint international_transfer_notice_version_chk
    check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  constraint international_transfer_notice_hash_chk
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint international_transfer_notice_snapshot_chk check (
    jsonb_typeof(content_snapshot) = 'object'
    and content_snapshot ? 'es'
    and content_snapshot ? 'en'
    and jsonb_typeof(content_snapshot -> 'es' -> 'sections') = 'array'
    and jsonb_typeof(content_snapshot -> 'en' -> 'sections') = 'array'
  ),
  constraint international_transfer_notice_hash_algorithm_chk
    check (content_hash_algorithm = 'sha256-json-stringify-v1'),
  constraint international_transfer_provider_register_version_chk
    check (provider_register_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  constraint international_transfer_notice_lifecycle_chk check (
    (is_current and superseded_at is null)
    or (
      not is_current
      and superseded_at is not null
      and superseded_at >= effective_at
    )
  ),
  constraint international_transfer_notice_version_hash_uniq
    unique (version, content_hash)
);

create unique index international_transfer_notice_current_idx
  on public.international_transfer_notice_versions ((is_current))
  where is_current;

-- Toda versión futura debe, en la misma transacción, retirar la vigente con
-- `is_current = false, superseded_at = <effective_at nueva>` antes de insertar
-- el reemplazo. Ese hito inicia el plazo de retención de cinco años.
insert into public.international_transfer_notice_versions (
  version,
  content_hash,
  content_snapshot,
  content_hash_algorithm,
  provider_register_version,
  effective_at,
  is_current
) values (
  '2026-08-24.1',
  '17777f9d3b5d35128fbc4a0ab3e5787eb26c7b161f089e0226ed9bd55ada81b5',
  $transfer_notice$
  {
    "es": {
      "title": "Aviso de transferencias internacionales",
      "summary": "Describe las transferencias internacionales necesarias para crear y operar una cuenta, sus destinatarios, riesgos, salvaguardas y cómo retirar el consentimiento.",
      "sections": [
        {
          "title": "Decisión que te pedimos",
          "paragraphs": [
            "Antes de enviar los datos de una nueva cuenta, Agorbis solicita una acción afirmativa separada, previa, expresa e informada. Este aviso no se combina con la aceptación de Términos, la lectura de Privacidad, la edad mínima ni las Normas comunitarias.",
            "El consentimiento alcanza solamente a las transferencias de cuenta que ocurren después de marcar la casilla. No pretende autorizar retroactivamente la entrega inicial de este sitio ni reemplaza el mecanismo separado que debe cubrir el acceso, la recuperación, la seguridad y el ejercicio de derechos."
          ]
        },
        {
          "title": "Destinatarios, datos y finalidades",
          "bullets": [
            "Supabase, Inc.: recibe correo, credenciales protegidas, identificadores de autenticación, perfil, residencia declarada, contenido, actividad, archivos y metadatos de seguridad para prestar base de datos, Auth y Storage. El proyecto principal está en AWS us-east-2, Ohio, Estados Unidos; servicios auxiliares y subencargados pueden operar en otros destinos publicados en el registro.",
            "Vercel Inc.: procesa solicitudes, cookies de sesión, dirección IP, características técnicas, formularios y registros operativos para ejecutar y entregar la aplicación. La ejecución principal está configurada en iad1, Washington D. C., Estados Unidos, y la entrega usa una red global.",
            "Plus Five Five, Inc., que opera como Resend: recibe el correo destinatario y el contenido y metadatos mínimos de confirmaciones, enlaces de acceso, recuperación y avisos de seguridad. Su tratamiento principal se realiza en Estados Unidos.",
            "Cloudflare, Inc.: recibe dirección IP, señales del navegador o dispositivo y el resultado del desafío estrictamente necesarios para distinguir personas de automatización abusiva mediante Turnstile. Usa una red global con tratamiento internacional."
          ]
        },
        {
          "title": "Destinos, riesgos y salvaguardas",
          "paragraphs": [
            "Estados Unidos no integra actualmente la lista de países con legislación adecuada reconocida por la AAIP. Los proveedores o sus subencargados también pueden tratar datos en los demás destinos identificados en el Registro de subencargados vigente.",
            "Las transferencias quedan expuestas a leyes extranjeras distintas de las argentinas, solicitudes válidas de autoridades extranjeras, transferencias ulteriores autorizadas y mayores dificultades prácticas para ejercer derechos. Los DPA, la minimización, los controles de acceso, el cifrado en tránsito, la retención limitada y las demás medidas publicadas reducen esos riesgos, pero no garantizan riesgo cero ni sustituyen por sí solos una base argentina válida."
          ]
        },
        {
          "title": "Obligatoriedad y consecuencias",
          "paragraphs": [
            "Podés negarte y seguir leyendo el contenido público sin cuenta. La infraestructura actual no permite crear ni mantener una cuenta sin Supabase, Vercel, Resend y Cloudflare, por lo que negarte impide el alta y las funciones autenticadas.",
            "No se venden datos personales, no se usan para publicidad y el consentimiento de este aviso no incluye Google, analítica, inteligencia artificial ni otro tratamiento opcional futuro. Cualquiera de esos cambios requiere una decisión separada o una nueva versión cuando corresponda."
          ]
        },
        {
          "title": "Retiro y derechos",
          "paragraphs": [
            "Podés retirar este consentimiento en cualquier momento desde la baja de cuenta o escribiendo al contacto del responsable. El retiro no tiene efecto retroactivo: detiene las transferencias futuras basadas en él y, como la cuenta no puede operar sin estos proveedores, inicia su desactivación y eliminación. Sólo se conserva lo exigido por ley o necesario para ejercer o defender derechos, con acceso restringido y por el plazo informado.",
            "Antes de la baja podés exportar tus datos. También podés ejercer gratuitamente acceso, rectificación, actualización, supresión y confidencialidad ante el responsable, y presentar un reclamo ante la Agencia de Acceso a la Información Pública."
          ]
        }
      ]
    },
    "en": {
      "title": "International transfer notice",
      "summary": "This notice describes the international transfers required to create and operate an account, their recipients, risks, safeguards, and how to withdraw consent.",
      "sections": [
        {
          "title": "The decision we request",
          "paragraphs": [
            "Before sending new-account data, Agorbis requests a separate, prior, express, and informed affirmative action. This notice is not combined with acceptance of the Terms, acknowledgement of Privacy, minimum age, or Community rules.",
            "Consent covers only account transfers that occur after you select the checkbox. It does not purport to retroactively authorize initial delivery of this website or replace the separate mechanism that must cover access, recovery, security, and exercise of rights."
          ]
        },
        {
          "title": "Recipients, data, and purposes",
          "bullets": [
            "Supabase, Inc. receives email, protected credentials, authentication identifiers, profile, declared residence, content, activity, files, and security metadata to provide its database, Auth, and Storage services. The primary project is in AWS us-east-2, Ohio, United States; auxiliary services and subprocessors may operate in other destinations published in the register.",
            "Vercel Inc. processes requests, session cookies, IP address, technical characteristics, forms, and operational logs to execute and deliver the application. Primary execution is configured in iad1, Washington, D.C., United States, and delivery uses a global network.",
            "Plus Five Five, Inc., doing business as Resend, receives the recipient email and the minimum content and metadata needed for confirmations, sign-in links, recovery, and security notices. Its primary processing takes place in the United States.",
            "Cloudflare, Inc. receives the IP address, browser or device signals, and challenge result strictly necessary to distinguish people from abusive automation through Turnstile. It uses a global network with international processing."
          ]
        },
        {
          "title": "Destinations, risks, and safeguards",
          "paragraphs": [
            "The United States is not currently on the AAIP list of countries recognized as having adequate legislation. Providers or their subprocessors may also process data in the other destinations identified in the current Subprocessor register.",
            "Transfers are exposed to foreign laws that differ from Argentine law, valid requests from foreign authorities, authorized onward transfers, and greater practical difficulty exercising rights. DPAs, minimization, access controls, encryption in transit, limited retention, and the other published measures reduce those risks but do not guarantee zero risk or by themselves replace a valid Argentine basis."
          ]
        },
        {
          "title": "Required nature and consequences",
          "paragraphs": [
            "You may refuse and continue reading public content without an account. The current infrastructure cannot create or maintain an account without Supabase, Vercel, Resend, and Cloudflare, so refusal prevents sign-up and authenticated features.",
            "Personal data is not sold or used for advertising. Consent to this notice does not include Google, analytics, artificial intelligence, or any future optional processing. Any such change requires a separate choice or a new version when applicable."
          ]
        },
        {
          "title": "Withdrawal and rights",
          "paragraphs": [
            "You may withdraw consent at any time through account deletion or by writing to the controller contact. Withdrawal has no retroactive effect: it stops future transfers based on consent and, because the account cannot operate without these providers, starts deactivation and deletion. Only information required by law or needed to exercise or defend rights is retained, with restricted access and for the disclosed period.",
            "You may export your data before deletion. You may also exercise access, correction, update, deletion, and confidentiality rights free of charge with the controller and lodge a complaint with Argentina's Agency for Access to Public Information."
          ]
        }
      ]
    }
  }
  $transfer_notice$::jsonb,
  'sha256-json-stringify-v1',
  '2026-08-24.1',
  timestamptz '2026-08-24 00:00:00+00',
  true
);

create table public.user_international_transfer_consents (
  user_id uuid not null references public.profiles (id) on delete cascade,
  notice_version text not null,
  notice_hash text not null,
  locale text not null,
  source text not null,
  accepted_at timestamptz not null default statement_timestamp(),
  primary key (user_id, notice_version),
  constraint user_transfer_consent_notice_fk
    foreign key (notice_version, notice_hash)
    references public.international_transfer_notice_versions (
      version,
      content_hash
    )
    on delete restrict,
  constraint user_transfer_consent_locale_chk check (locale in ('es', 'en')),
  constraint user_transfer_consent_source_chk
    check (source = 'account_gate')
);

create index user_transfer_consents_user_idx
  on public.user_international_transfer_consents (user_id, accepted_at desc);
create index user_transfer_consents_notice_idx
  on public.user_international_transfer_consents (
    notice_version,
    notice_hash,
    user_id
  );

alter table public.international_transfer_notice_versions enable row level security;
alter table public.user_international_transfer_consents enable row level security;

create policy international_transfer_notice_versions_select_all
  on public.international_transfer_notice_versions
  for select using (true);

create policy user_transfer_consents_select_own
  on public.user_international_transfer_consents
  for select to authenticated
  using (user_id = auth.uid());

create or replace function private.has_current_international_transfer_consent(
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and (
      select count(*) = 1
      from public.international_transfer_notice_versions n
      where n.is_current and n.effective_at <= now()
    )
    and exists (
      select 1
      from public.international_transfer_notice_versions n
      join public.user_international_transfer_consents c
        on c.user_id = p_user
       and c.notice_version = n.version
       and c.notice_hash = n.content_hash
      where n.is_current and n.effective_at <= now()
    );
$$;

create or replace function private.has_current_legal_acceptance(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and (
      select count(distinct d.document_type) = 3
      from public.legal_document_versions d
      where d.is_current and d.effective_at <= now()
    )
    and not exists (
      select 1
      from public.legal_document_versions d
      where d.is_current
        and d.effective_at <= now()
        and not exists (
          select 1
          from public.user_legal_acceptances a
          where a.user_id = p_user
            and a.document_type = d.document_type
            and a.version = d.version
            and (d.minimum_age = 0 or a.minimum_age_attested)
        )
    )
    and private.has_current_international_transfer_consent(p_user);
$$;

-- Los cambios visibles del perfil también son participación. La versión
-- anterior sólo aplicaba el gate al cambio de residencia y permitía editar
-- identidad pública/bio sin el consentimiento internacional vigente.
create or replace function private.guard_profile_system_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  -- Jobs con secret/service_role y operaciones SQL internas conservan el
  -- bypass necesario para alta, saneamiento de avatar, moderación y baja.
  if auth.role() = 'service_role' or v_actor is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'GEOUNITY_IMMUTABLE_PROFILE_FIELD'
      using errcode = 'insufficient_privilege';
  end if;

  if not private.session_is_moderator(v_actor)
     and (new.role is distinct from old.role
       or new.verification_level is distinct from old.verification_level) then
    raise exception 'GEOUNITY_IMMUTABLE_PROFILE_FIELD'
      using errcode = 'insufficient_privilege';
  end if;

  if new.residence_changed_at is distinct from old.residence_changed_at
     and new.home_community_id is not distinct from old.home_community_id then
    raise exception 'GEOUNITY_RESIDENCE_TIMESTAMP_MANAGED_BY_DB'
      using errcode = 'insufficient_privilege';
  end if;

  if new.username is distinct from old.username
     or new.display_name is distinct from old.display_name
     or new.avatar_url is distinct from old.avatar_url
     or new.bio is distinct from old.bio
     or new.home_community_id is distinct from old.home_community_id then
    perform private.assert_can_participate(v_actor);
  end if;
  return new;
end;
$$;

create function public.grant_current_international_transfer_consent(
  p_version text,
  p_expressly_accepted boolean,
  p_locale text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_notice public.international_transfer_notice_versions%rowtype;
  v_at timestamptz;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(p_expressly_accepted, false) then
    raise exception 'AGORBIS_INTERNATIONAL_TRANSFER_CONSENT_REQUIRED'
      using errcode = 'check_violation';
  end if;
  if p_locale is null or p_locale not in ('es', 'en') then
    raise exception 'AGORBIS_TRANSFER_CONSENT_LOCALE_INVALID'
      using errcode = 'check_violation';
  end if;
  select n.* into v_notice
  from public.international_transfer_notice_versions n
  where n.version = p_version
    and n.is_current
    and n.effective_at <= now();
  if not found then
    raise exception 'AGORBIS_TRANSFER_NOTICE_NOT_CURRENT'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.user_international_transfer_consents (
    user_id,
    notice_version,
    notice_hash,
    locale,
    source
  ) values (
    v_user,
    v_notice.version,
    v_notice.content_hash,
    p_locale,
    'account_gate'
  )
  on conflict (user_id, notice_version) do nothing;

  select c.accepted_at into v_at
  from public.user_international_transfer_consents c
  where c.user_id = v_user
    and c.notice_version = v_notice.version
    and c.notice_hash = v_notice.content_hash;
  if v_at is null then
    raise exception 'AGORBIS_TRANSFER_CONSENT_NOT_RECORDED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return v_at;
end;
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
        'accepted', a.user_id is not null
          and (d.minimum_age = 0 or a.minimum_age_attested),
        'accepted_at', a.accepted_at
      ) order by d.document_type)
      from public.legal_document_versions d
      left join public.user_legal_acceptances a
        on a.user_id = auth.uid()
       and a.document_type = d.document_type
       and a.version = d.version
      where d.is_current and d.effective_at <= now()
    ), '[]'::jsonb),
    'international_transfer_consent', (
      select jsonb_build_object(
        'version', n.version,
        'content_hash', n.content_hash,
        'content_hash_algorithm', n.content_hash_algorithm,
        'provider_register_version', n.provider_register_version,
        'effective_at', n.effective_at,
        'status', case when c.user_id is null then 'missing' else 'accepted' end,
        'accepted_at', c.accepted_at,
        'locale', c.locale,
        'source', c.source
      )
      from public.international_transfer_notice_versions n
      left join public.user_international_transfer_consents c
        on c.user_id = auth.uid()
       and c.notice_version = n.version
       and c.notice_hash = n.content_hash
      where n.is_current and n.effective_at <= now()
    )
  );
$$;

create function public.purge_expired_transfer_consents()
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

  delete from public.user_international_transfer_consents old
  using public.international_transfer_notice_versions notice
  where notice.version = old.notice_version
    and notice.content_hash = old.notice_hash
    and not notice.is_current
    and notice.superseded_at
      < statement_timestamp() - interval '1825 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

insert into public.data_retention_policies (
  dataset,
  retention_days,
  rationale,
  purge_on_account_deletion
) values (
  'user_international_transfer_consents',
  1825,
  'La evidencia de un aviso sustituido se elimina cinco años después de su sustitución; la vigente se conserva mientras siga vigente y todas se eliminan con la baja.',
  true
)
on conflict (dataset) do update set
  retention_days = excluded.retention_days,
  rationale = excluded.rationale,
  purge_on_account_deletion = excluded.purge_on_account_deletion,
  updated_at = now();

revoke all on function private.has_current_international_transfer_consent(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.grant_current_international_transfer_consent(
  text, boolean, text
) from public, anon, authenticated, service_role;
revoke all on function public.purge_expired_transfer_consents()
from public, anon, authenticated, service_role;

grant execute on function public.grant_current_international_transfer_consent(
  text, boolean, text
) to authenticated;
grant execute on function public.purge_expired_transfer_consents()
to service_role;

revoke all on public.international_transfer_notice_versions,
  public.user_international_transfer_consents
from public, anon, authenticated, service_role;
grant select on public.international_transfer_notice_versions
to anon, authenticated, service_role;
grant select on public.user_international_transfer_consents
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
