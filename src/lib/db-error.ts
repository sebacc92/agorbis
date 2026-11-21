/**
 * Clasificación de errores de PostgREST por SQLSTATE.
 *
 * Los rechazos de la base se venían reconociendo con expresiones regulares
 * sobre `error.message`: `/row-level security|policy/i` estaba en diez lugares.
 * El texto de un error de Postgres lo genera el servidor según su
 * `lc_messages`, y cambia entre versiones. Con la base en un locale que no sea
 * inglés, "new row violates row-level security policy for table …" pasa a ser
 * otra frase y las diez comprobaciones fallan a la vez — sin romperse: cada
 * una cae en su mensaje genérico ("No pudimos registrar tu apoyo") y la
 * persona pierde la única pista de por qué no la dejan participar.
 *
 * El SQLSTATE es parte del contrato de Postgres, no se traduce y no cambia.
 * Ya se usaba así para el 23505 de los `insert` duplicados; esto lleva el
 * mismo criterio al resto.
 *
 * No cubre los errores que emitimos nosotros con `raise exception` desde una
 * migración: ésos siguen reconociéndose por su texto, que es nuestro. Ver
 * `isQuotaError` en `quota.ts`.
 */

/** Lo mínimo que exponen tanto `PostgrestError` como un `AuthError`. */
export interface DbErrorLike {
  message?: string;
  code?: string;
}

/**
 * `insufficient_privilege`. Es lo que devuelve Postgres cuando una fila no
 * pasa el `using`/`with check` de una policy de RLS, que en esta app siempre
 * significa lo mismo: quien lo intentó no reside en esa comunidad.
 */
export const RLS_VIOLATION = "42501";

/** `unique_violation`: la fila ya existía. Un doble click, no un error. */
export const UNIQUE_VIOLATION = "23505";

/** `check_violation`: incluye los `raise … using errcode = 'check_violation'`. */
export const CHECK_VIOLATION = "23514";

/** `foreign_key_violation`: apunta a una fila que no existe o ya se borró. */
export const FOREIGN_KEY_VIOLATION = "23503";

/**
 * `program_limit_exceeded`: nuestros topes de pendientes y de envíos por
 * ventana (`consume_window_limit`, `reserve_claim_upload`, solicitudes).
 */
export const PROGRAM_LIMIT_EXCEEDED = "54000";

/**
 * ¿RLS rechazó esta escritura?
 *
 * Una policy que combina varias condiciones en un solo `with check` devuelve
 * este código para cualquiera de ellas: el código dice que la base dijo que
 * no, no cuál de los requisitos faltó. Cuando esa diferencia importa, hay que
 * preguntarle a la base aparte —ver `debateDenialReason` en
 * `content-actions.ts`.
 */
export function isRlsViolation(error: DbErrorLike | null | undefined): boolean {
  return error?.code === RLS_VIOLATION && !participationBlockMessage(error);
}

/**
 * Centinelas del gate de participación (`private.assert_can_participate`).
 *
 * Comparten el SQLSTATE 42501 con RLS, así que sin esta distinción la UI
 * acusaba a la persona de no residir en la comunidad cuando lo que faltaba
 * era aceptar los documentos vigentes, o la cuenta estaba suspendida o en
 * baja. El texto es nuestro (lo emite una migración), no prosa de Postgres.
 */
const PARTICIPATION_BLOCKS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /GEOUNITY_LEGAL_ACCEPTANCE_REQUIRED|AGORBIS_INTERNATIONAL_TRANSFER_CONSENT_REQUIRED/,
    "Para participar, revisá y aceptá los documentos vigentes en /consentimiento.",
  ],
  [
    /GEOUNITY_ACCOUNT_SUSPENDED/,
    "Tu cuenta está suspendida. Podés seguir leyendo y apelar desde tu perfil.",
  ],
  [
    /AGORBIS_ACCOUNT_DELETION_PENDING/,
    "Tu cuenta tiene una baja en curso, así que ya no puede participar.",
  ],
];

/**
 * Topes que emiten nuestras migraciones con `program_limit_exceeded`.
 *
 * Caían en el genérico de cada acción ("Probá de nuevo"), y ante un tope
 * reintentar no sirve: hay que esperar a que se libere la ventana o a que
 * moderación resuelva lo pendiente. Los números son los de la base (0039,
 * 0041); si cambian ahí, cambian acá.
 */
const LIMIT_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /GEOUNITY_TOO_MANY_PENDING_UPLOADS/,
    "Ya tenés 12 fotos esperando publicarse. Se liberan solas en un día: publicá el reclamo con las que ya subiste o volvé más tarde.",
  ],
  [
    /GEOUNITY_TOO_MANY_PENDING_REQUESTS/,
    "Ya tenés 3 solicitudes esperando revisión. Esperá a que moderación las resuelva antes de enviar otra.",
  ],
  [
    /GEOUNITY_RATE_LIMIT:claim-uploads-hour/,
    "Alcanzaste el máximo de 20 fotos por hora. Volvé a intentarlo más tarde.",
  ],
  [
    /GEOUNITY_RATE_LIMIT:(?:community|organization)_requests-day/,
    "Alcanzaste el máximo de 3 solicitudes por día. Volvé a intentarlo mañana.",
  ],
  [
    /GEOUNITY_RATE_LIMIT/,
    "Alcanzaste el máximo de envíos por ahora. Volvé a intentarlo más tarde.",
  ],
];

/** Mensaje para la persona cuando la base rechazó por un tope propio. */
export function limitMessage(
  error: DbErrorLike | null | undefined,
): string | null {
  const message = error?.message ?? "";
  for (const [pattern, text] of LIMIT_MESSAGES) {
    if (pattern.test(message)) return text;
  }
  return null;
}

/**
 * Textos propios de las RPC de moderación (0020, 0039). Son nuestros, no prosa
 * de Postgres, así que se reconocen por su texto y se devuelven con una forma
 * fija que el catálogo inglés conoce. Las variantes con un valor interpolado
 * ("de nivel 3", "dentro de Córdoba") se reducen a la frase sin el valor.
 */
const MODERATION_RAISES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /El nivel solicitado requiere una comunidad superior de nivel/,
    "El nivel solicitado requiere una comunidad superior de otro nivel. Revisá la comunidad superior elegida.",
  ],
  [
    /Ya existe una comunidad con ese nombre dentro de/,
    "Ya existe una comunidad con ese nombre dentro de la comunidad superior elegida.",
  ],
  [
    /Elegí una comunidad superior válida/,
    "Elegí una comunidad superior válida.",
  ],
  [
    /Solicitud inexistente o ya resuelta/,
    "La solicitud ya no existe o ya fue resuelta.",
  ],
  [/La cuenta ya está suspendida/, "La cuenta ya está suspendida."],
  [/No podés suspender esa cuenta/, "No podés suspender esa cuenta."],
  [/La cuenta no existe/, "La cuenta no existe."],
  [
    /El fin de la suspensión debe ser futuro/,
    "El fin de la suspensión debe ser una fecha futura.",
  ],
  [/La suspensión necesita un motivo/, "La suspensión necesita un motivo."],
  [
    /GEOUNITY_MODERATION_HIERARCHY/,
    "Esa cuenta tiene un rol igual o superior al tuyo: no podés moderarla.",
  ],
];

/**
 * Rechazos propios de las RPC de acuerdos (0074, D118). Mensajes estables
 * `AGORBIS_AGREEMENT_*`; el genérico de la acción no alcanza porque ante casi
 * todos reintentar no sirve. La elegibilidad y la duración las avisa el
 * formulario antes de enviar; si igual llegan, caen al genérico.
 */
const AGREEMENT_RAISES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /AGORBIS_AGREEMENT_ALREADY_ADHERED/,
    "Esa comunidad ya adhirió este acuerdo.",
  ],
  [
    /AGORBIS_AGREEMENT_PROPOSER_CANNOT_ADHERE/,
    "Quien propone no adhiere su propia propuesta: hace falta otra residente.",
  ],
  [
    /AGORBIS_AGREEMENT_NOT_A_MEMBER/,
    "Sólo una residente de una comunidad nombrada puede adherir.",
  ],
  [
    /AGORBIS_AGREEMENT_LAPSED/,
    "Pasaron 30 días sin la última adhesión: la propuesta venció.",
  ],
  [
    /AGORBIS_AGREEMENT_NOT_PROPOSED/,
    "Esta propuesta ya no está abierta a adhesiones.",
  ],
  [
    /AGORBIS_AGREEMENT_NOT_PROPOSER/,
    "Sólo quien propuso el acuerdo puede retirarlo.",
  ],
  [
    /AGORBIS_AGREEMENT_TOO_MANY_PENDING/,
    "Ya tenés tres propuestas esperando adhesión. Esperá a que alguna se abra, venza o retirala.",
  ],
  [
    /AGORBIS_AGREEMENT_RESIDENCE_REQUIRED/,
    "Para proponer un acuerdo primero elegí dónde vivís.",
  ],
  [/AGORBIS_AGREEMENT_NOT_FOUND/, "El acuerdo no existe o fue eliminado."],
  [
    /AGORBIS_AGREEMENT_MODERATOR_REQUIRED/,
    "Sólo moderación puede dar de baja o restaurar un acuerdo.",
  ],
  [
    /AGORBIS_AGREEMENT_UNKNOWN_COMMUNITY/,
    "Una de las comunidades elegidas ya no existe. Quitala y volvé a elegir.",
  ],
];

/** Motivo concreto de un rechazo de acuerdos, si la base lo dijo. */
export function agreementRaiseMessage(
  error: DbErrorLike | null | undefined,
): string | null {
  const message = error?.message ?? "";
  for (const [pattern, text] of AGREEMENT_RAISES) {
    if (pattern.test(message)) return text;
  }
  return null;
}

/** Motivo concreto de un rechazo de moderación, si la base lo dijo. */
export function moderationRaiseMessage(
  error: DbErrorLike | null | undefined,
): string | null {
  const message = error?.message ?? "";
  for (const [pattern, text] of MODERATION_RAISES) {
    if (pattern.test(message)) return text;
  }
  return null;
}

/** Mensaje para la persona cuando el gate de participación rechazó la acción. */
export function participationBlockMessage(
  error: DbErrorLike | null | undefined,
): string | null {
  const message = error?.message ?? "";
  for (const [pattern, text] of PARTICIPATION_BLOCKS) {
    if (pattern.test(message)) return text;
  }
  return null;
}

/**
 * Estado y mensaje para `ev.fail` cuando una escritura falló.
 *
 * Si el rechazo vino del gate de participación, se devuelve 403 con el motivo
 * real; si fue un tope propio, 429 con el límite que se alcanzó; si no, 400
 * con el mensaje genérico de la acción. El genérico suele decir "Probá de
 * nuevo", y ante el gate o un tope reintentar nunca sirve: la persona tiene
 * que pasar por /consentimiento, apelar la suspensión, asumir la baja o
 * esperar la ventana. Acepta `null` porque varias acciones fallan también
 * cuando la base no devolvió la fila (`error || !row`), sin error de por medio.
 */
export function writeFailure(
  error: DbErrorLike | null | undefined,
  fallback: string,
): { status: 400 | 403 | 429; message: string } {
  const blocked = participationBlockMessage(error);
  if (blocked) return { status: 403, message: blocked };
  const limited = limitMessage(error);
  if (limited) return { status: 429, message: limited };
  return { status: 400, message: fallback };
}

/** ¿Ya existía la fila? Un `insert` repetido no siempre es un fallo. */
export function isUniqueViolation(
  error: DbErrorLike | null | undefined,
): boolean {
  return error?.code === UNIQUE_VIOLATION;
}
