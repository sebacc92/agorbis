/**
 * Pruebas de la lógica cívica pura: reloj de respuesta de reclamos (D58),
 * fases y rendición del presupuesto (D59).
 *
 * Son funciones sin base de datos ni framework, pero deciden qué ve la gente:
 * si un reclamo figura como silenciado, si una votación está abierta, si un
 * proyecto quedó sin rendir. El comportamiento contra PostgreSQL ya se validó
 * aparte; esto cubre el espejo que corre en el cliente, que es el que puede
 * divergir de la base sin que nadie se entere.
 *
 * Se transpilan en memoria, igual que `test-i18n.mjs`, para no depender de que
 * la versión de Node cargue TypeScript.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const load = async (path, replacements = []) => {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
  );
};

const budget = await load("../src/lib/budget.ts");
// `claim-escalation` importa `translate` sólo para las etiquetas; acá se
// prueban las funciones de cálculo, así que se sustituye por un stub.
const escalation = await load("../src/lib/claim-escalation.ts", [
  [
    /import \{[^}]*\} from "\.\/i18n";/,
    'const DEFAULT_LOCALE = "es"; const translate = (_l, s) => s;',
  ],
]);

// ---------------------------------------------------------------------------
// Reloj de respuesta de un reclamo (D58)
// ---------------------------------------------------------------------------
const now = new Date("2026-03-01T12:00:00Z");
const claim = (over = {}) => ({
  response_due_at: "2026-03-10T12:00:00Z",
  first_response_at: null,
  escalated_at: null,
  status: "open",
  ...over,
});

assert.equal(escalation.responseClock(claim(), now).state, "waiting");
assert.equal(escalation.responseClock(claim(), now).days, 9);

assert.equal(
  escalation.responseClock(
    claim({ response_due_at: "2026-02-20T12:00:00Z" }),
    now,
  ).state,
  "overdue",
);
assert.equal(
  escalation.responseClock(
    claim({ response_due_at: "2026-02-20T12:00:00Z" }),
    now,
  ).days,
  9,
);

// Un acuse institucional detiene el reloj para siempre, aunque esté vencido.
assert.equal(
  escalation.responseClock(
    claim({
      response_due_at: "2026-01-01T12:00:00Z",
      first_response_at: "2026-01-05T12:00:00Z",
    }),
    now,
  ).state,
  "answered",
);

// Escalado gana sobre vencido.
assert.equal(
  escalation.responseClock(
    claim({
      response_due_at: "2026-01-01T12:00:00Z",
      escalated_at: "2026-02-24T12:00:00Z",
    }),
    now,
  ).state,
  "escalated",
);

// Un reclamo cerrado ya no espera nada: no se le muestra reloj.
for (const status of ["resolved", "rejected", "removed", "acknowledged"]) {
  assert.equal(
    escalation.responseClock(claim({ status }), now).state,
    "none",
    status,
  );
}

// Sin ventana configurada para ese nivel, no hay reloj.
assert.equal(
  escalation.responseClock(claim({ response_due_at: null }), now).state,
  "none",
);

// ---------------------------------------------------------------------------
// Umbral de escalamiento: tiene que dar lo mismo que `claim_escalation_threshold`
// en 0026 — greatest(3, least(50, ceil(member_count * 0.01)))
// ---------------------------------------------------------------------------
const sqlThreshold = (n) => Math.max(3, Math.min(50, Math.ceil(n * 0.01)));
for (const members of [
  0, 1, 99, 100, 250, 300, 301, 4999, 5000, 5001, 1_000_000,
]) {
  assert.equal(
    escalation.escalationThreshold(members),
    sqlThreshold(members),
    `umbral para ${members} miembros`,
  );
}
assert.equal(escalation.escalationThreshold(0), 3, "piso");
assert.equal(escalation.escalationThreshold(1_000_000), 50, "techo");

// ---------------------------------------------------------------------------
// Fases del presupuesto (D59): derivadas de fechas, sin estado que mover
// ---------------------------------------------------------------------------
const round = {
  proposals_close_at: "2026-04-01T00:00:00Z",
  voting_opens_at: "2026-04-05T00:00:00Z",
  voting_closes_at: "2026-04-20T00:00:00Z",
  report_due_at: "2026-06-01T00:00:00Z",
};
const at = (iso) => budget.budgetPhase(round, new Date(iso));

assert.equal(at("2026-03-20T00:00:00Z"), "intake");
assert.equal(at("2026-04-03T00:00:00Z"), "review");
assert.equal(at("2026-04-10T00:00:00Z"), "voting");
assert.equal(at("2026-05-01T00:00:00Z"), "closed");
// Los bordes: el instante exacto pertenece a la fase siguiente.
assert.equal(at("2026-04-01T00:00:00Z"), "review", "cierre de admisión");
assert.equal(at("2026-04-05T00:00:00Z"), "voting", "apertura del voto");
assert.equal(at("2026-04-20T00:00:00Z"), "closed", "cierre del voto");

// Una fecha ilegible hacía fallar las tres comparaciones (`t < NaN` es
// siempre `false`) y la ronda caía hasta "closed": resultado en firme a
// partir de un dato roto. Corta antes, en la fase que no decide nada.
for (const campo of [
  "proposals_close_at",
  "voting_opens_at",
  "voting_closes_at",
]) {
  assert.equal(
    budget.budgetPhase(
      { ...round, [campo]: "no es una fecha" },
      new Date("2026-05-01T00:00:00Z"),
    ),
    "review",
    `${campo} ilegible no puede dar una ronda cerrada`,
  );
}

// ---------------------------------------------------------------------------
// Rendición: espejo del reloj del reclamo
// ---------------------------------------------------------------------------
assert.equal(
  budget.reportState(
    true,
    round.report_due_at,
    new Date("2026-07-01T00:00:00Z"),
  ).state,
  "reported",
  "rendido gana aunque esté vencido",
);

// Sin fecha legible no hay incumplimiento que declarar: marcaba "overdue" con
// `NaN` días, que la vista pintaba como "hace NaN días".
{
  const rota = budget.reportState(false, "no es una fecha", new Date());
  assert.equal(rota.state, "pending");
  assert.equal(rota.days, 0);
  assert.ok(Number.isFinite(rota.days));
}
assert.equal(
  budget.reportState(
    false,
    round.report_due_at,
    new Date("2026-05-01T00:00:00Z"),
  ).state,
  "pending",
);
assert.equal(
  budget.reportState(
    false,
    round.report_due_at,
    new Date("2026-06-11T00:00:00Z"),
  ).state,
  "overdue",
);
assert.equal(
  budget.reportState(
    false,
    round.report_due_at,
    new Date("2026-06-11T00:00:00Z"),
  ).days,
  10,
);

// ---------------------------------------------------------------------------
// Fichas restantes
// ---------------------------------------------------------------------------
assert.equal(budget.tokensLeft(10, {}), 10);
assert.equal(budget.tokensLeft(10, { a: 4, b: 3 }), 3);
assert.equal(budget.tokensLeft(10, { a: 4, b: 9 }), 0, "nunca negativo");

// ---------------------------------------------------------------------------
// `datetime-local` → ISO, que es como el formulario de alta guarda el calendario
// ---------------------------------------------------------------------------
// El input manda hora local sin zona ("2026-04-01T09:30"). `new Date` la
// interpreta como local y `toISOString` la lleva a UTC: al volver a mostrarla
// en el mismo navegador se lee igual que se escribió.
const typed = "2026-04-01T09:30";
const stored = new Date(typed).toISOString();
const shownBack = new Date(stored);
assert.equal(shownBack.getFullYear(), 2026);
assert.equal(shownBack.getMonth(), 3);
assert.equal(shownBack.getDate(), 1);
assert.equal(shownBack.getHours(), 9, "la hora vuelve como se tecleó");
assert.equal(shownBack.getMinutes(), 30);

// Los presets de cierre tienen que respetar ese mismo contrato. `toISOString()`
// devuelve UTC, así que usarlo tal cual metía en el campo un reloj que no era
// el de quien lo miraba: tres horas de más en Buenos Aires y el día cambiado
// en Auckland.
const isoInDays = (days, now = Date.now()) => {
  const at = new Date(now + days * 86400_000);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
for (const days of [7, 30, 90]) {
  const value = isoInDays(days, now.getTime());
  // Releer el valor como hora local tiene que devolver el mismo instante que
  // se quiso expresar, con cualquier huso del proceso.
  const reparsed = new Date(value);
  const expected = new Date(now.getTime() + days * 86400_000);
  assert.equal(
    Math.round((reparsed.getTime() - expected.getTime()) / 60_000),
    0,
    `el preset de ${days} días tiene que caer en el instante correcto (TZ=${process.env.TZ ?? "local"})`,
  );
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
}
// Una fecha vacía o inválida tiene que ser detectable: el alta la rechaza.
assert.ok(Number.isNaN(new Date("").getTime()));
assert.ok(Number.isNaN(new Date("no es una fecha").getTime()));

// Y si una llega igual a la vista, el formato no puede tumbar la página:
// `Intl.RelativeTimeFormat.format()` lanza `RangeError` con un valor no finito.
const format = await load("../src/lib/format.ts", [
  [
    /import \{[^}]*\} from "\.\/i18n";/,
    'const DEFAULT_LOCALE = "es"; const localeTag = () => "es-AR"; const translate = (_l, s) => s;',
  ],
]);
assert.equal(format.timeAgo("", "es", now), "recién");
assert.equal(format.timeAgo("no es una fecha", "es", now), "recién");
assert.equal(
  format.timeAgo("2026-03-01T11:59:30Z", "es", now),
  "recién",
  "menos de un minuto sigue siendo «recién»",
);
// Con `numeric: "auto"` los días cercanos son "ayer"/"anteayer"; más atrás
// vuelve el número.
assert.equal(format.timeAgo("2026-02-28T12:00:00Z", "es", now), "ayer");
assert.match(format.timeAgo("2026-02-24T12:00:00Z", "es", now), /5/);

// `timeAgo` degradaba pero sus tres vecinas no, y `RelativeTime` llama a
// `timeAgo` y a `formatDate` sobre la misma fecha: la tarjeta se caía igual.
for (const invalid of ["", "no es una fecha", "2026-13-45T99:99:99Z"]) {
  assert.doesNotThrow(
    () => format.formatDate(invalid, "es"),
    `formatDate no puede lanzar con ${JSON.stringify(invalid)}`,
  );
  assert.equal(format.formatDate(invalid, "es"), "fecha desconocida");
}
assert.match(format.formatDate("2026-03-01T12:00:00Z", "es"), /2026/);

// Ninguna comparación con NaN es verdadera, así que el `ms <= 0` no cortaba y
// la encuesta anunciaba "Cierra en NaN días".
assert.equal(format.countdown("no es una fecha", "es", now), null);
assert.equal(format.countdown(null, "es", now), null);
assert.equal(format.countdown("2026-02-01T12:00:00Z", "es", now), null);
// El stub de `translate` devuelve la plantilla sin interpolar, así que se
// afirma sobre la plantilla elegida y no sobre el número ya sustituido.
assert.equal(
  format.countdown("2026-03-04T12:00:00Z", "es", now),
  "Cierra en {{count}} días",
);
assert.equal(
  format.countdown("2026-03-02T12:00:00Z", "es", now),
  "Cierra en 1 día",
);

// Sin fecha de cierre la encuesta sigue abierta; con una fecha ilegible se
// cierra, que es el error recuperable de los dos.
assert.equal(format.isClosed(null, "active", now), false);
assert.equal(format.isClosed("2026-04-01T12:00:00Z", "active", now), false);
assert.equal(format.isClosed("2026-02-01T12:00:00Z", "active", now), true);
assert.equal(
  format.isClosed("no es una fecha", "active", now),
  true,
  "una fecha de cierre ilegible no puede dejar la encuesta abierta para siempre",
);
assert.equal(format.isClosed(null, "closed", now), true);

// ---------------------------------------------------------------------------
// Privacidad de resultados finales y tallies agregados (0047)
// ---------------------------------------------------------------------------
const liveResultsSource = readFileSync(
  new URL("../src/components/polls/LiveResults.tsx", import.meta.url),
  "utf8",
);
const privacyMigration = readFileSync(
  new URL(
    "../supabase/migrations/0047_private_poll_ballots.sql",
    import.meta.url,
  ),
  "utf8",
);

assert.doesNotMatch(liveResultsSource, /poll_vote_events|postgres_changes/);
assert.doesNotMatch(
  liveResultsSource,
  /setInterval|useVisibleTask|fetchResults|server\$/,
);
assert.match(privacyMigration, /create table private\.poll_option_tallies/);
assert.match(privacyMigration, /check \(results_visibility = 'after_close'\)/);
assert.match(
  privacyMigration,
  /coalesce\(max\(t\.participants\), 0\)[\s\S]*>= 5/,
);

console.log(
  "✓ lógica cívica · reloj, fases, rendición, calendario y privacidad de encuestas",
);
