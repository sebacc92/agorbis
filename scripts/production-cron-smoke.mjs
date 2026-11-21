import { runProductionCronSmoke } from "./production-smoke-policy.mjs";

try {
  const result = await runProductionCronSmoke({
    cronSecret: process.env.CRON_SECRET,
    confirmation: process.env.AGORBIS_PRODUCTION_CRON_SMOKE_CONFIRM,
  });
  console.log(
    `Smoke manual de handlers cron en Cloudflare Workers: PASS (${result.completed.length} controles).`,
  );
  for (const completed of result.completed) console.log(`  ✓ ${completed}`);
} catch (error) {
  console.error("Smoke manual de handlers cron en Cloudflare Workers: FAIL");
  console.error(
    `  ✗ ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
