begin;

revoke select, usage
on sequence public.activation_events_id_seq
from anon;

revoke select, usage
on sequence public.moderation_audit_log_id_seq
from anon, authenticated, service_role;

commit;
