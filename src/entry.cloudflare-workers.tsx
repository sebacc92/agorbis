/*
 * Entrada de producción para Cloudflare Workers. El router conserva el SSR de
 * Qwik y el wrapper agrega exclusivamente los controles propios del runtime:
 * host canónico, límite temprano del body y despacho de Cron Triggers.
 */
import {
  createAgorbisCloudflareWorker,
  type CloudflareWorkerEnv,
  type CloudflareWorkerExecutionContext,
} from "./lib/cloudflare-worker-runtime";
import { createQwikCloudflareWorkerRouter } from "./lib/qwik-cloudflare-worker-router";
import render from "./entry.ssr";

const qwikFetch = createQwikCloudflareWorkerRouter({ render });
const worker = createAgorbisCloudflareWorker(
  (
    request: Request,
    env: CloudflareWorkerEnv,
    ctx: CloudflareWorkerExecutionContext,
  ) => qwikFetch(request, env, ctx),
);

export const fetch = worker.fetch;
export const scheduled = worker.scheduled;
