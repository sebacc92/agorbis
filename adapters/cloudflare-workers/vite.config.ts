import { cloudflarePagesAdapter as cloudflareWorkersAdapter } from "@qwik.dev/router/adapters/cloudflare-pages/vite";
import { extendConfig } from "@qwik.dev/router/vite";
import type { OutputAsset, OutputChunk } from "rolldown";
import type { Plugin } from "vite";
import baseConfig from "../../vite.config.ts";
import {
  isQwikRouterUserResponseModule,
  sanitizePinnedQwikServerLogs,
} from "./qwik-log-sanitizer";

const SHARED_CACHE_PATTERNS = [
  /\bcaches\s*\.\s*open\s*\(/,
  /\bcache\s*\.\s*put\s*\(/,
];

function rejectSharedCacheInServerBundle(): Plugin {
  return {
    name: "agorbis-no-shared-worker-cache",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "ssr") return;
      for (const output of Object.values(bundle) as (
        OutputAsset | OutputChunk
      )[]) {
        if (output.type !== "chunk") continue;
        if (
          SHARED_CACHE_PATTERNS.some((pattern) => pattern.test(output.code))
        ) {
          this.error(
            `El bundle SSR ${output.fileName} volvió a incluir Cache API compartida.`,
          );
        }
      }
    },
  };
}

function sanitizeQwikServerLogging(): Plugin {
  let transformed = false;
  return {
    name: "agorbis-sanitize-qwik-server-logging",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      if (!isQwikRouterUserResponseModule(id)) return;
      if (transformed) {
        this.error("El módulo server de Qwik Router fue transformado más de una vez.");
      }
      transformed = true;
      try {
        return { code: sanitizePinnedQwikServerLogs(code), map: null };
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }
    },
    buildEnd(error) {
      if (!error && !transformed) {
        this.error(
          "El build no encontró el módulo pineado de Qwik Router para sanear sus logs.",
        );
      }
    },
  };
}

/**
 * Qwik Router beta.40 publica el adapter de Workers con el nombre histórico
 * `cloudflare-pages`. El artefacto que genera es, sin embargo, un Module Worker
 * estándar y Wrangler lo carga desde `dist/_worker.js`.
 */
export default extendConfig(baseConfig, () => {
  return {
    build: {
      ssr: true,
      rolldownOptions: {
        input: ["src/entry.cloudflare-workers.tsx"],
      },
    },
    plugins: [
      cloudflareWorkersAdapter(),
      sanitizeQwikServerLogging(),
      rejectSharedCacheInServerBundle(),
    ],
  };
});
