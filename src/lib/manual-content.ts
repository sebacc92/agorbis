import { LEGAL_ROUTES } from "./legal";

/**
 * Contenido de `/manual`, fuera de la ruta.
 *
 * Los textos están en español, que es el texto fuente: la página los pasa por
 * `translate()` y su traducción vive en `src/i18n/en/manual.ts`.
 * `check-i18n` no ve textos que no estén escritos dentro de la llamada, así
 * que la red de este archivo es `manual-faq.spec.ts`, que exige traducción
 * para cada uno.
 */
export interface ManualLink {
  href: string;
  label: string;
}

export interface ManualCard {
  emoji: string;
  title: string;
  body: string;
  link?: ManualLink;
}

/** Secciones de la página, en orden. El `id` es su ancla y no se cambia. */
export const MANUAL_SECTIONS = [
  { id: "idea", label: "La idea" },
  { id: "amor-civico", label: "Amor cívico" },
  { id: "primeros-pasos", label: "Primeros pasos" },
  { id: "herramientas", label: "Herramientas" },
  { id: "seguimiento", label: "Seguimiento" },
  { id: "difundir", label: "Imprimir y compartir" },
  { id: "publicar", label: "Publicar bien" },
  { id: "reglas", label: "Reglas y privacidad" },
  { id: "preguntas", label: "Preguntas frecuentes" },
  { id: "detalle", label: "Cada pantalla, en detalle" },
] as const;

export type ManualSectionId = (typeof MANUAL_SECTIONS)[number]["id"];

/** Cadena del ejemplo de pertenencia: seis comunidades, de la Tierra a la ciudad. */
export const MANUAL_EXAMPLE_CHAIN = [
  "🌍 Tierra",
  "🌎 América del Sur",
  "🇦🇷 Argentina",
  "🌾 Buenos Aires",
  "🏛️ General Pueyrredón",
  "🌊 Mar del Plata",
] as const;

export const MANUAL_FIRST_STEPS = [
  {
    number: "01",
    title: "Creá tu cuenta",
    body: "Escribí tu correo y una contraseña, confirmá el correo desde el enlace que te mandamos y aceptá los documentos legales. Tu correo se usa para ingresar y no se muestra en ningún lado.",
  },
  {
    number: "02",
    title: "Indicá dónde vivís",
    body: "Buscá tu ciudad o municipio y revisá la cadena geográfica completa antes de confirmar.",
  },
  {
    number: "03",
    title: "Entrá a tus comunidades",
    body: "Vas a ser miembro, al mismo tiempo, de tu localidad y de todas las comunidades que la contienen, hasta la Tierra.",
  },
  {
    number: "04",
    title: "Participá",
    body: "Votá, debatí, apoyá reclamos o comprometé recursos con proyectos que te importan.",
  },
] as const;

export const MANUAL_TOOLS = [
  {
    emoji: "🗳️",
    title: "Encuestas",
    purpose: "Medir prioridades y tomar el pulso de una comunidad.",
    detail:
      "Pueden permitir una o varias respuestas. Tu cuenta guarda sólo una constancia de participación sin elección y tu elección se suma al total de cada opción, sin guardarse como un voto individual. No se puede recuperar ni cambiar. Los resultados se publican al cierre sólo si participaron al menos 5 personas.",
  },
  {
    emoji: "💬",
    title: "Debates",
    purpose: "Comparar argumentos sin mezclar territorios ni perder contexto.",
    detail:
      "Los comentarios se agrupan por las comunidades hijas del nivel debatido. En un debate de Argentina, por ejemplo, cada provincia tiene su columna: escribís en la propia y podés leer las demás.",
  },
  {
    emoji: "📣",
    title: "Reclamos",
    purpose:
      "Hacer visible un problema concreto y reunir a quienes también afecta.",
    detail:
      "Un reclamo debe describir qué pasa, dónde y qué respuesta verificable se espera. Se puede sumar evidencia visual y apoyo comunitario. Agorbis le da visibilidad, pero no reemplaza una denuncia ni garantiza su resolución.",
  },
  {
    emoji: "🛠️",
    title: "Proyectos",
    purpose: "Pasar de una idea a un plan con recursos, etapas y compromisos.",
    detail:
      "Cada propuesta explica el objetivo, el plan, el tiempo y los recursos necesarios. Otras personas pueden comprometer dinero, materiales, tiempo o habilidades. Son compromisos públicos: nadie transfiere dinero a través de Agorbis.",
  },
  {
    emoji: "🤝",
    title: "Acuerdos",
    purpose:
      "Comprometer a una comunidad, sola o junto con otras, con una decisión votada.",
    detail:
      "Una residente propone el compromiso desde su comunidad y elige hasta cuatro comunidades más del mismo país, de provincia para abajo y que no se contengan entre sí. Cada comunidad vota por separado, con la misma constancia sin elección de las encuestas, y el acuerdo existe sólo si todas lo aprueban. Nadie abre una votación en una comunidad ajena: entra cuando una residente de ahí adhiere.",
  },
] as const;

export const MANUAL_TRACKING: readonly ManualCard[] = [
  {
    emoji: "🏠",
    title: "Inicio personalizado",
    body: "Reúne en un único feed las novedades de todas tus comunidades, desde tu localidad hasta la Tierra. Podés filtrar por comunidad y por tipo, incluidos los acuerdos, y las encuestas que ya votaste y los reclamos que apoyaste llevan su marca.",
  },
  {
    emoji: "🔎",
    title: "Búsqueda global",
    body: "Encontrá comunidades, publicaciones e instituciones y acotá los resultados por tipo, estado o territorio.",
  },
  {
    emoji: "🔔",
    title: "Notificaciones útiles",
    body: "Te avisa respuestas, cierres de encuestas, cambios en reclamos y avances de proyectos a los que te sumaste.",
  },
  {
    emoji: "📎",
    title: "Fuentes visibles",
    body: "Cada publicación puede mostrar enlaces, documentos, organismo publicador y fecha de verificación.",
  },
  {
    emoji: "🏛️",
    title: "Respuesta institucional",
    body: "Municipios y organizaciones verificadas responden con identidad pública y conservan un historial consultable.",
  },
  {
    emoji: "🧭",
    title: "Trazabilidad",
    body: "Los reclamos tienen línea de tiempo, evidencia, responsable y estado; los proyectos suman hitos, tareas y aportes concretos.",
  },
  {
    emoji: "🔗",
    title: "Contenido conectado",
    body: "Una encuesta puede originar un debate y un reclamo puede convertirse en proyecto sin perder el contexto original.",
  },
  {
    emoji: "📍",
    title: "¿Tu localidad todavía no aparece?",
    body: "Podés solicitarla con su comunidad superior y una fuente oficial. Al aprobarla, el sistema crea automáticamente su nivel, dirección pública y lugar correcto dentro de la jerarquía.",
    link: { href: "/comunidades/solicitar", label: "Solicitar comunidad" },
  },
];

/**
 * Herramientas para llevar un tema fuera de la pantalla y seguir sus
 * resultados. Cada texto dice qué hace y qué no: ninguna presenta nada ante un
 * organismo, suma firmas por su cuenta ni convierte los números de Agorbis en
 * estadísticas oficiales (D74).
 */
export const MANUAL_OUTREACH = [
  {
    emoji: "🖨️",
    title: "Imprimibles de un reclamo",
    body: "En cada reclamo, “Difundir este reclamo” reúne las formas de compartirlo y los imprimibles: un afiche, un dossier, una nota formal para presentar en mesa de entradas y una planilla de firmas. Se imprimen o se guardan como PDF desde el navegador, con un código QR que lleva al reclamo. Agorbis no presenta la nota por vos ni recibe una copia.",
  },
  {
    emoji: "✍️",
    title: "Planilla de firmas en papel",
    body: "Pide sólo nombre, cuadra aproximada (opcional) y firma. Sirve para presentar en papel: las firmas de la planilla no se suman a los apoyos de la app. No la fotografíes ni la subas al reclamo, porque tiene datos de otras personas.",
  },
  {
    emoji: "📲",
    title: "Compartir",
    body: "Los botones de compartir abren el menú de tu teléfono, WhatsApp o Telegram con un mensaje que ves antes de enviarlo. No se carga nada de esos servicios hasta que tocás el botón.",
  },
  {
    emoji: "🏆",
    title: "Victorias, rendición y comparativa",
    body: "Cada comunidad muestra sus reclamos resueltos y proyectos completados, cuántos reclamos hay por categoría y cuántos figuran como resueltos, y una comparación con hasta seis comunidades del mismo nivel. Los números salen de los estados cargados en Agorbis: no son estadísticas oficiales ni una auditoría de ningún gobierno.",
  },
  {
    emoji: "🗺️",
    title: "Mapa de reclamos",
    body: "Un esquema propio con los reclamos que tienen ubicación, redondeada a una cuadrícula de unos 110 metros. Abrir OpenStreetMap es opcional y te lleva a un sitio externo.",
  },
  {
    emoji: "📡",
    title: "Datos abiertos y RSS",
    body: "Cada comunidad publica feed.xml (RSS con los 25 reclamos más recientes) y datos.json (GeoJSON con hasta 100 reclamos con ubicación). Incluyen título, estado, fecha y un extracto de hasta 280 caracteres, nunca el autor. Pueden tardar hasta media hora en reflejar cambios y las copias que otros ya descargaron no se actualizan. Todavía no tienen una licencia de reutilización: citá la fuente y consultá los Términos.",
  },
] as const;

export const MANUAL_GOOD_POSTS = [
  {
    title: "Tiene el alcance correcto",
    body: "Una luminaria rota corresponde a la ciudad; una política ferroviaria puede discutirse a nivel provincial o nacional.",
  },
  {
    title: "Separa hechos de opiniones",
    body: "Incluí fechas, lugares y fuentes cuando existan. Si algo es una propuesta o percepción, presentalo como tal.",
  },
  {
    title: "Pide una acción verificable",
    body: "“Publicar las frecuencias reales cada mes” permite evaluar una respuesta; “que todo mejore” no.",
  },
  {
    title: "Protege a las personas",
    body: "No publiques domicilios, teléfonos, documentos, datos médicos ni acusaciones personales sin sustento.",
  },
] as const;

export const MANUAL_RULES: readonly {
  emoji: string;
  title: string;
  body: string;
  links: readonly ManualLink[];
}[] = [
  {
    emoji: "🔒",
    title: "Privacidad elegible",
    body: "El correo es privado, las elecciones sólo se conservan como contadores agregados y la membresía permanece anónima hasta que elijas mostrarte.",
    links: [{ href: LEGAL_ROUTES.privacy, label: "Política de privacidad" }],
  },
  {
    emoji: "⏳",
    title: "Cuotas de publicación",
    body: "El cupo mensual evita saturación y spam. Publicar a escala global cuesta más que hacerlo en una ciudad; participar en contenido existente no tiene cupo.",
    links: [],
  },
  {
    emoji: "🛡️",
    title: "Moderación trazable",
    body: "Podés reportar contenido. Moderación puede ocultar publicaciones que incumplen las reglas sin borrar el historial de participación legítima.",
    links: [
      { href: LEGAL_ROUTES.communityRules, label: "Normas comunitarias" },
      { href: LEGAL_ROUTES.moderation, label: "Moderación y apelaciones" },
    ],
  },
];
