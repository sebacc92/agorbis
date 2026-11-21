import type { Messages } from "../types";

export const enBudget: Messages = {
  "No pudimos cargar las postulaciones. Los proyectos disponibles pueden estar incompletos.":
    "We couldn't load the proposals. Available projects may be incomplete.",
  "No pudimos cargar los resultados. No podemos confirmar el reparto.":
    "We couldn't load the results. We can't confirm the allocation.",
  "No pudimos comprobar si ya participaste. Volvé a cargar antes de enviar.":
    "We couldn't check whether you already took part. Reload before submitting.",
  "No pudimos comprobar si podés votar esta ronda. Volvé a intentarlo.":
    "We couldn't check whether you can vote in this round. Please try again.",
  "No pudimos cargar las rendiciones. No podemos indicar cuáles están pendientes.":
    "We couldn't load the reports. We can't tell which ones are pending.",
  "No pudimos cargar tus proyectos. Volvé a intentarlo para postular o rendir.":
    "We couldn't load your projects. Please try again to propose or report on a project.",
  "Presupuesto participativo": "Participatory budget",
  Partida: "Budget pot",

  // --- Fases (D59). Etiquetas dinámicas: el verificador estático no las ve. ---
  "Postulaciones abiertas": "Proposals open",
  "Votación abierta": "Voting open",
  Resultado: "Result",

  "Esta comunidad todavía no tiene una partida":
    "This community doesn't have a budget pot yet",
  "Cuando haya un presupuesto para repartir, acá se van a poder postular proyectos y votar cómo se asigna.":
    "Once there is a budget to distribute, projects can be proposed here and the community votes on how it gets allocated.",
  "hasta el {{date}}": "until {{date}}",
  "Partida asignada": "Allocated budget",
  "Rondas de presupuesto": "Budget rounds",
  "{{assigned}} asignados de {{total}} · {{count}} proyectos financiados":
    "{{assigned}} allocated out of {{total}} · {{count}} projects funded",

  // --- Votación ---
  "Repartí tus fichas": "Distribute your tokens",
  "Tenés {{total}} fichas para distribuir entre los proyectos que quieras, hasta {{max}} por proyecto. Tu reparto no queda guardado: sólo se suma al total y registramos que participaste. Una vez enviado, no se puede cambiar.":
    "You have {{total}} tokens to distribute among the projects you want, up to {{max}} per project. Your allocation isn't stored: it's only added to the total and we record that you took part. Once sent, it can't be changed.",
  "Ingresá para participar del reparto.":
    "Sign in to take part in the allocation.",
  "Para votar esta partida tu residencia tenía que estar declarada antes de que abriera la votación.":
    "To vote on this budget, your residence had to be declared before voting opened.",
  "Tu reparto se sumó al total. No queda guardado, así que no se puede ver ni cambiar.":
    "Your allocation was added to the total. It isn't stored, so it can't be viewed or changed.",
  "Ya participaste. Tu reparto no quedó guardado, así que no podemos mostrarlo ni cambiarlo.":
    "You already took part. Your allocation wasn't stored, so we can't show or change it.",
  "Ya emitiste tu reparto. No se guarda como una fila individual, por eso no se puede recuperar ni cambiar.":
    "You already submitted your allocation. It is not stored as an individual row, so it cannot be retrieved or changed.",
  "Repartí al menos una ficha.": "Allocate at least one token.",
  "Usadas: {{used}} de {{total}}": "Used: {{used}} of {{total}}",
  Fichas: "Tokens",
  "Fichas para {{project}}": "Tokens for {{project}}",
  "Enviar reparto (definitivo)": "Submit allocation (final)",
  "Entiendo que el reparto es definitivo: después no se puede ver ni cambiar.":
    "I understand the allocation is final: it can't be viewed or changed afterwards.",
  "Te queda 1 ficha sin repartir. Si enviás ahora, no vas a poder usarla después.":
    "You have 1 token left. If you submit now, you won't be able to use it later.",
  "Te quedan {{count}} fichas sin repartir. Si enviás ahora, no vas a poder usarlas después.":
    "You have {{count}} tokens left. If you submit now, you won't be able to use them later.",
  "Confirmá que el reparto es definitivo antes de enviarlo.":
    "Confirm that the allocation is final before submitting it.",

  // --- Postulaciones ---
  "Todavía no hay proyectos admitidos": "No projects have been admitted yet",
  "Los proyectos de esta comunidad se postulan durante la fase de postulaciones y pasan por una evaluación de viabilidad antes de entrar a la votación.":
    "Projects from this community apply during the proposal phase and go through a feasibility review before reaching the vote.",
  "Proyectos postulados": "Proposed projects",
  "Se evalúan cuando cierre la etapa de postulaciones.":
    "They are reviewed once the proposal phase closes.",
  "La moderación admite los proyectos viables antes de abrir la votación.":
    "Moderation admits viable projects before voting opens.",
  "{{count}} postulados": "{{count}} proposed",
  "Solicita {{amount}}": "Requests {{amount}}",
  "Admitido para votar": "Admitted to the ballot",
  "No admitido": "Not admitted",
  "Pendiente de evaluación": "Awaiting review",
  "Motivo:": "Reason:",
  Admitir: "Admit",
  "No admitir": "Do not admit",
  "Cambiar motivo": "Change reason",
  "Motivo de la decisión": "Reason for the decision",
  "Explicá por qué no pasa a votación":
    "Explain why it will not reach the ballot",
  Confirmar: "Confirm",
  "Explicá brevemente por qué no se admite el proyecto.":
    "Briefly explain why the project is not admitted.",
  "No pudimos guardar la evaluación. Comprobá que la fase de revisión siga abierta.":
    "We couldn't save the review. Check that the review phase is still open.",

  // --- Resultado ---
  "Resultado del reparto": "Allocation result",
  "Se asigna en orden de fichas hasta agotar la partida. Un proyecto que no entra por monto se saltea y sigue el próximo.":
    "Funds are allocated in token order until the pot runs out. A project that doesn't fit by amount is skipped and the next one continues.",
  "Esta ronda cerró sin proyectos admitidos":
    "This round closed with no admitted projects",
  "No hubo nada que repartir.": "There was nothing to allocate.",
  "Sin resultados por baja participación":
    "No results due to low participation",
  "Los resultados requieren al menos 5 participantes. Si hubo menos, no mostramos el número exacto ni el reparto.":
    "Results require at least 5 participants. If there were fewer, we do not show the exact count or allocation.",
  "{{tokens}} fichas · {{voters}} personas · pidió {{amount}}":
    "{{tokens}} tokens · {{voters}} people · requested {{amount}}",
  "Financiado · {{amount}}": "Funded · {{amount}}",
  "Sin partida": "Not funded",

  // --- Rendición (espejo de D58) ---
  Rendido: "Reported",
  "Rinde en {{count}} días": "Reports due in {{count}} days",
  "Sin rendir hace 1 día": "1 day without a report",
  "Sin rendir hace {{count}} días": "{{count}} days without a report",

  "Agorbis registra la decisión y la rendición, no administra los fondos. La transferencia ocurre fuera de la plataforma.":
    "Agorbis records the decision and the spending report; it does not hold or move the funds. Transfers happen outside the platform.",
  "Ronda creada": "Round created",
  "Cómo reparte {{community}} su partida entre proyectos, votado por quienes viven ahí.":
    "How {{community}} distributes its budget across projects, voted on by the people who live there.",
  "No pudimos guardar tu reparto.": "We couldn't save your allocation.",
  // --- Postulación ---
  "Postular un proyecto": "Propose a project",
  "Podés postular proyectos tuyos de esta comunidad. Después pasan por una evaluación de viabilidad antes de entrar a la votación.":
    "You can propose your own projects from this community. They then go through a feasibility review before reaching the vote.",
  "Postulamos tu proyecto a esta partida.":
    "Your project has been proposed for this budget.",
  "Ingresá para postular un proyecto.": "Sign in to propose a project.",
  "No tenés proyectos en esta comunidad sin postular. Creá uno desde la pestaña Proyectos.":
    "You have no unproposed projects in this community. Create one from the Projects tab.",
  "Monto solicitado": "Requested amount",
  "Queda fijo aunque después cambie el presupuesto del proyecto.":
    "This stays fixed even if the project's budget changes later.",
  Postular: "Propose",
  "Sólo podés postular un proyecto tuyo mientras la admisión esté abierta.":
    "You can only propose your own project while intake is open.",
  "No pudimos postular el proyecto.": "We couldn't propose the project.",

  // --- Rendición ---
  "Publicar la rendición": "Publish the spending report",
  "Publicar rendición": "Publish report",
  "Monto ejecutado": "Amount spent",
  "Comprobante o informe": "Receipt or report",
  "En qué se gastó": "What it was spent on",
  "Mínimo 20 caracteres.": "At least 20 characters.",
  "Publicamos tu rendición.": "Your report has been published.",
  "Ese proyecto ya tiene su rendición.":
    "That project already has a spending report.",
  "Sólo puede rendir quien creó el proyecto.":
    "Only the project's author can file the report.",
  "No pudimos publicar la rendición.": "We couldn't publish the report.",

  // --- Alta de ronda (moderación) ---
  "Abrir una ronda de presupuesto participativo":
    "Open a participatory budget round",
  "Abrir una ronda de presupuesto": "Open a budget round",
  "Abrir una ronda en {{community}}": "Open a round in {{community}}",
  "Abrir la ronda": "Open the round",
  "Sólo el equipo de moderación puede abrir una ronda de presupuesto.":
    "Only the moderation team can open a budget round.",
  "Sólo el equipo de moderación puede abrir una ronda.":
    "Only the moderation team can open a round.",
  "Las cuatro fechas definen las fases: no hay estados que mover a mano. Agorbis registra la decisión y la rendición, no administra los fondos.":
    "The four dates define the phases; there is no status to move by hand. Agorbis records the decision and the report, it does not hold the funds.",
  "Título de la ronda": "Round title",
  "Ej: Partida 2026": "E.g. 2026 budget",
  "Qué se está repartiendo": "What is being distributed",
  "De dónde sale la partida y qué tipo de proyectos se esperan.":
    "Where the money comes from and what kind of projects are expected.",
  "Monto de la partida": "Budget amount",
  "Fichas por votante": "Tokens per voter",
  "Cuántas reparte cada persona entre los proyectos.":
    "How many each person spreads across projects.",
  "Tope por proyecto": "Cap per project",
  "Evita que el reparto se vuelva una elección única.":
    "Keeps the allocation from collapsing into a single choice.",
  "Calendario de la ronda": "Round calendar",
  "Cierra la admisión": "Intake closes",
  "Abre la votación": "Voting opens",
  "Cierra la votación": "Voting closes",
  "Vence la rendición": "Reports due",
  "Después de esta fecha, un proyecto financiado sin rendición queda marcado.":
    "After this date, a funded project without a report gets flagged.",
  "Las fechas tienen que ir en orden: admisión, votación, cierre y rendición.":
    "The dates must run in order: intake, voting opens, voting closes, reports due.",
  "No pudimos crear la ronda. Revisá los datos.":
    "We couldn't create the round. Check the details.",
  "Usá el código de tres letras, por ejemplo ARS.":
    "Use the three-letter code, for example ARS.",
  "te pasaste por {{count}}": "{{count}} over the limit",
  "te quedan {{count}}": "{{count}} left",
  "repartiste todas": "all tokens assigned",
  "Ningún proyecto puede llevar más de {{max}} fichas.":
    "No project can take more than {{max}} tokens.",
  "Sacá fichas de algún proyecto: no podés repartir más de {{total}}.":
    "Take tokens off a project: you cannot allocate more than {{total}}.",
};
