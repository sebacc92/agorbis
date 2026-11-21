import type { RequestHandler } from "@qwik.dev/router";
import { ensureRequestId } from "~/lib/request-id";

/** Correlación segura para soporte, logs de plataforma y monitores externos. */
export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("X-Request-ID", ensureRequestId(ev));
};
