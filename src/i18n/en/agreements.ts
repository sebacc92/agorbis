import type { Messages } from "../types";

/** Acuerdos entre comunidades (D118). El texto del acuerdo no se traduce (D56). */
export const enAgreements: Messages = {
  // Inicio (src/routes/inicio/index.tsx); "Acuerdo" vive más abajo
  acuerdos: "agreements",
  "comunidad adhirió": "community endorsed",
  "comunidades adhirieron": "communities endorsed",

  "No pudimos cargar los acuerdos de esta comunidad. Recargá la página para volver a intentarlo.":
    "We couldn't load this community's agreements. Reload the page to try again.",
  "No pudimos cargar las opciones de voto. Recargá la página para volver a intentarlo.":
    "We couldn't load the voting options. Reload the page to try again.",
  "No adhirió": "Did not endorse",
  // "Sí" y "No" de los botones de voto ya viven en polls.ts
  "No pudimos registrar la acción. Probá de nuevo.":
    "We couldn't complete that. Please try again.",
  "Tu voto quedó registrado.": "Your vote was recorded.",
  "Tu comunidad adhirió. Lo que sigue lo dice el estado de arriba.":
    "Your community endorsed it. What happens next is in the status above.",
  "La propuesta quedó retirada.": "The proposal was withdrawn.",
  "Tu propuesta ya está publicada. Ahora hace falta que una residente de cada comunidad nombrada, y otra de la tuya, adhiera: compartila con quienes puedan hacerlo.":
    "Your proposal is published. Now a resident of each named community, and another one from yours, needs to endorse it: share it with people who can.",
  "Para adherir o votar hace falta elegir dónde vivís.":
    "To endorse or vote you first need to choose where you live.",
  "Elegir dónde vivo": "Choose where I live",
  "Una de las comunidades elegidas ya no existe. Quitala y volvé a elegir.":
    "One of the chosen communities no longer exists. Remove it and choose again.",
  "No se pudo buscar entre todas las comunidades del país. Probá de nuevo.":
    "Could not search all the communities in the country. Try again.",
  "Hay más comunidades en el país de las que se muestran. Escribí al menos {{min}} letras para buscar entre todas.":
    "The country has more communities than the ones shown. Type at least {{min}} letters to search all of them.",

  // Estados derivados (src/lib/agreements.ts)
  "Propuesto, esperando adhesión": "Proposed, awaiting endorsement",
  "En votación hasta el {{date}}": "Voting until {{date}}",
  "En votación": "Voting",
  Rechazado: "Rejected",
  "Sin quórum": "No quorum",
  "Sin adhesión": "Not endorsed",
  Retirado: "Withdrawn",
  "Dado de baja por moderación": "Removed by moderation",
  "Este acuerdo está dado de baja por moderación. Sólo moderación lo ve; restaurarlo desde la cola lo devuelve a su estado anterior, con sus rondas.":
    "This agreement was removed by moderation. Only moderators can see it; restoring it from the queue returns it to its previous state, rounds included.",
  Aprobó: "Approved",
  Rechazó: "Rejected",
  "{{count}} participantes": "{{count}} participants",
  "Sin quórum: menos de cinco participantes":
    "No quorum: fewer than five participants",

  // Elegibilidad (aviso previo; la base repite la regla)
  "Un acuerdo reúne de una a cinco comunidades, contando la tuya.":
    "An agreement brings together one to five communities, including yours.",
  "Sólo participan comunidades de provincia para abajo: el país, los continentes y la Tierra no.":
    "Only communities from province level down can take part: not the country, continents or Earth.",
  "Todas las comunidades tienen que ser del mismo país.":
    "All communities must be in the same country.",
  "Una comunidad no puede participar junto con otra que la contiene: sus residentes votarían dos veces.":
    "A community cannot take part alongside one that contains it: its residents would vote twice.",

  // Rechazos de la base (src/lib/db-error.ts)
  "Esa comunidad ya adhirió este acuerdo.":
    "That community has already endorsed this agreement.",
  "Quien propone no adhiere su propia propuesta: hace falta otra residente.":
    "The proposer cannot endorse their own proposal: another resident is needed.",
  "Sólo una residente de una comunidad nombrada puede adherir.":
    "Only a resident of a named community can endorse.",
  "Esta propuesta ya no está abierta a adhesiones.":
    "This proposal is no longer open to endorsements.",
  "Pasaron 30 días sin la última adhesión: la propuesta venció.":
    "Thirty days passed without the last endorsement: the proposal lapsed.",
  "Sólo quien propuso el acuerdo puede retirarlo.":
    "Only the person who proposed the agreement can withdraw it.",
  "Ya tenés tres propuestas esperando adhesión. Esperá a que alguna se abra, venza o retirala.":
    "You already have three proposals awaiting endorsement. Wait for one to open or lapse, or withdraw one.",
  "Para proponer un acuerdo primero elegí dónde vivís.":
    "To propose an agreement, first choose where you live.",
  "El acuerdo no existe o fue eliminado.":
    "The agreement does not exist or was removed.",

  // Página /acuerdos/[id]
  "No encontramos ese acuerdo.": "We couldn't find that agreement.",
  Acuerdo: "Agreement",
  Propuesto: "Proposed",
  "El compromiso": "The commitment",
  "Comunidad que decide": "Community that decides",
  "Comunidades que deciden": "Communities that decide",
  "Un acuerdo interno: lo vota la propia comunidad y queda registrado como compromiso.":
    "An internal agreement: the community itself votes on it and it is recorded as a commitment.",
  "Cada comunidad vota por separado. El acuerdo existe sólo si todas lo aprueban, con cinco participantes o más en cada una.":
    "Each community votes separately. The agreement exists only if all of them approve it, with five or more participants in each.",
  Adhirió: "Endorsed",
  "Esperando adhesión": "Awaiting endorsement",
  "Los resultados se muestran por comunidad y no se suman: cada una decidió por sí misma.":
    "Results are shown per community and are not added up: each one decided for itself.",
  "¿Aprobás este acuerdo por {{community}}?":
    "Do you approve this agreement for {{community}}?",
  "Tu voto es secreto y no se puede cambiar. Los resultados se ven al cierre, con cinco participantes o más.":
    "Your vote is secret and cannot be changed. Results are shown at close, with five or more participants.",
  "Tu elección no quedó guardada, así que no podemos mostrarla ni cambiarla.":
    "Your choice was not stored, so we cannot show it or change it.",
  "¿Que {{community}} vote este acuerdo?":
    "Should {{community}} vote on this agreement?",
  "Adherir no aprueba nada: pide que tu comunidad lo vote. La votación se abre cuando todas las comunidades nombradas adhirieron.":
    "Endorsing approves nothing: it asks your community to vote. Voting opens once every named community has endorsed.",
  "Adherir por {{community}}": "Endorse for {{community}}",
  "Tu propuesta": "Your proposal",
  "Esperando que adhiera: {{communities}}. Si pasan 30 días, la propuesta vence sola.":
    "Awaiting endorsement from: {{communities}}. After 30 days the proposal lapses on its own.",
  "Podés retirarla mientras no se abra.":
    "You can withdraw it until voting opens.",
  "Retirar la propuesta": "Withdraw the proposal",
  "Para adherir o votar hace falta una cuenta y vivir en una de las comunidades que deciden.":
    "To endorse or vote you need an account and to live in one of the deciding communities.",
  "Tu comunidad no participa en este acuerdo. Podés leerlo y seguir lo que decidan.":
    "Your community is not part of this agreement. You can read it and follow what they decide.",
  "Acuerdo propuesto desde {{community}} en Agorbis.":
    "Agreement proposed from {{community}} on Agorbis.",
  "No pudimos registrar la adhesión. Probá de nuevo.":
    "We couldn't record the endorsement. Try again.",
  "No pudimos retirar la propuesta. Probá de nuevo.":
    "We couldn't withdraw the proposal. Try again.",
  "Ya votaste en este acuerdo. Tu elección no quedó guardada, así que no podemos mostrarla ni cambiarla.":
    "You already voted on this agreement. Your choice was not stored, so we cannot show it or change it.",
  "Esta votación ya cerró.": "This vote has already closed.",
  "Sólo pueden votar quienes viven en una comunidad participante.":
    "Only people who live in a participating community can vote.",

  // Sección en la pestaña Encuestas y formulario de propuesta
  "Compromisos que {{community}} vota por separado, sola o junto con otras comunidades. Existen sólo si todas las comunidades los aprueban.":
    "Commitments that {{community}} votes on separately, alone or together with other communities. They exist only if every community approves them.",
  "Proponer un acuerdo": "Propose an agreement",
  "{{adhered}} de {{total}} comunidades adhirieron":
    "{{adhered}} of {{total}} communities endorsed",
  "Todavía no hay acuerdos acá. El primero puede ser tuyo.":
    "There are no agreements here yet. The first one can be yours.",
  "La votación dura entre 7 y 30 días.": "Voting lasts between 7 and 30 days.",
  "No pudimos registrar la propuesta. Probá de nuevo.":
    "We couldn't record the proposal. Try again.",

  // Formulario /c/[slug]/acuerdos/nuevo
  "Un compromiso que tu comunidad vota en secreto, sola o junto con otras. Se abre a votación cuando cada comunidad nombrada tiene una residente que la adhiere.":
    "A commitment your community votes on in secret, alone or together with others. Voting opens once every named community has a resident who endorses it.",
  "Título del acuerdo": "Agreement title",
  "Mantenimiento compartido de la ruta costera":
    "Shared maintenance of the coastal road",
  "Qué se compromete a hacer cada comunidad, en qué plazo y cómo se va a saber si se cumplió.":
    "What each community commits to do, by when, and how anyone will know it was done.",
  "Mínimo 50 caracteres. Una vez abierta la votación, el texto no se puede cambiar.":
    "At least 50 characters. Once voting opens, the text cannot be changed.",
  "Otras comunidades que lo votan": "Other communities that vote on it",
  "{{community}} participa siempre. Podés sumar hasta cuatro comunidades del mismo país, de provincia para abajo, que no se contengan entre sí. Si no sumás ninguna, es un acuerdo interno.":
    "{{community}} always takes part. You can add up to four communities from the same country, from province level down, none containing another. If you add none, it is an internal agreement.",
  "Buscar por nombre": "Search by name",
  "Ninguna comunidad coincide con esa búsqueda.":
    "No community matches that search.",
  "Duración de la votación": "Voting duration",
  "{{count}} días": "{{count}} days",
  "Empieza a contar cuando la última comunidad adhiere. Si pasan 30 días sin esa adhesión, la propuesta vence sola.":
    "It starts counting when the last community endorses. If 30 days pass without that endorsement, the proposal lapses on its own.",
  "Para que una ronda tenga resultado hacen falta cinco participantes o más en cada comunidad. Con menos, el acuerdo queda sin quórum.":
    "For a round to have a result, five or more participants are needed in each community. With fewer, the agreement ends without quorum.",
  "Proponer el acuerdo": "Propose the agreement",
};
