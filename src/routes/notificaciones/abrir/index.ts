import type { RequestHandler } from "@qwik.dev/router";
import { isUuid, safeInternalPath } from "~/lib/http";
import { requireUser, supabase } from "~/lib/session";

/**
 * Los GET nunca cambian estado. Esto también hace inocuos los enlaces viejos y
 * los scanners que todavía visiten esta ruta desde un correo o un historial.
 */
export const onGet: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
  throw ev.redirect(303, "/notificaciones");
};

/**
 * Abre una notificación y la marca leída mediante un formulario POST.
 *
 * Sigue funcionando sin JavaScript y espera la escritura antes de redirigir,
 * pero un prefetch, un scanner o una navegación cross-site ya no puede marcar
 * nada por accidente. Qwik Router rechaza además los POST de formulario cuyo
 * `Origin` no coincide con el del sitio.
 */
export const onPost: RequestHandler = async (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
  const viewer = await requireUser(ev);
  const db = supabase(ev);
  let form: FormData;
  try {
    form = await ev.request.formData();
  } catch {
    throw ev.error(400, "La solicitud no es válida.");
  }
  const rawId = form.get("id");
  const id = typeof rawId === "string" ? rawId : "";
  if (!isUuid(id)) {
    throw ev.error(400, "La notificación indicada no es válida.");
  }

  const { data: notification, error: notificationError } = await db
    .from("notifications")
    .select("id, href, read_at")
    .eq("id", id)
    // Redundante con RLS, pero deja explícito que nadie marca lo ajeno.
    .eq("recipient_id", viewer.userId)
    .maybeSingle();

  if (notificationError || !notification) {
    throw ev.redirect(302, "/notificaciones");
  }

  if (!notification.read_at) {
    const { error: readError } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notification.id)
      .eq("recipient_id", viewer.userId);
    if (readError) throw ev.redirect(302, "/notificaciones");
  }

  // `href` lo escribe el servidor al crear la notificación, pero se valida
  // igual: una redirección abierta convertiría la campana en un trampolín.
  const target = safeInternalPath(notification.href, "/notificaciones");

  throw ev.redirect(303, target);
};
