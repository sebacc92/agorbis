import { LEGAL_ROUTES } from "./legal";
import type { ManualLink } from "./manual-content";

/**
 * Preguntas del manual (`/manual`).
 *
 * Hay dos listas, y la diferencia importa al sumar una pregunta:
 *
 * - `MANUAL_ESSENTIAL_FAQ`: lo que alguien necesita saber antes de participar.
 *   Son pocas y van en orden de lectura; el spec las limita a 16 para que no
 *   vuelva a crecer hasta ser la lista de cien preguntas que reemplazó.
 * - `MANUAL_DETAIL_FAQ`: cómo se comporta una pantalla puntual. Acá va la
 *   pregunta que acompaña a una función nueva (regla "función visible" de
 *   CLAUDE.md), dentro del tema que le toca y no arriba de todo.
 *
 * El `id` es el ancla pública de la respuesta (`/manual/#borradores`): se
 * comparte en mensajes y enlaces, así que no se cambia aunque se corrija la
 * redacción de la pregunta.
 *
 * `answer` es una lista de párrafos. Dos preguntas que se pisaban se unen
 * sumando párrafos, cada uno con su traducción, sin reescribir el texto.
 */
export const MANUAL_FAQ_CATEGORIES = [
  { id: "cuenta", label: "Cuenta, perfil y seguridad" },
  { id: "comunidades", label: "Comunidades y residencia" },
  { id: "navegacion", label: "Inicio, búsqueda y navegación" },
  { id: "publicar", label: "Publicar y borradores" },
  { id: "encuestas", label: "Encuestas y acuerdos" },
  { id: "debates", label: "Debates" },
  { id: "reclamos", label: "Reclamos y mapa" },
  { id: "proyectos", label: "Proyectos y presupuestos" },
  { id: "notificaciones", label: "Notificaciones" },
  { id: "compartir", label: "Compartir e imprimir" },
  { id: "instituciones", label: "Instituciones y moderación" },
  { id: "accesibilidad", label: "Accesibilidad y teclado" },
  { id: "sin-javascript", label: "Si tu navegador no ejecuta JavaScript" },
] as const;

export type ManualFaqCategoryId = (typeof MANUAL_FAQ_CATEGORIES)[number]["id"];

export interface ManualFaqItem {
  id: string;
  question: string;
  answer: readonly string[];
  link?: ManualLink;
}

export interface ManualDetailFaqItem extends ManualFaqItem {
  category: ManualFaqCategoryId;
}

/** Ancla del grupo de preguntas de un tema; el menú lateral enlaza acá. */
export function categoryAnchor(id: ManualFaqCategoryId): string {
  return `tema-${id}`;
}

export const MANUAL_ESSENTIAL_FAQ: readonly ManualFaqItem[] = [
  {
    id: "agorbis-y-gobierno",
    question: "¿Agorbis representa al gobierno?",
    answer: [
      "No. Es una plataforma cívica independiente para organizar participación territorial. Un reclamo publicado no equivale a un trámite oficial y un resultado de encuesta no es vinculante por sí solo.",
    ],
  },
  {
    id: "participar-en-otra-comunidad",
    question: "¿Puedo participar en cualquier comunidad?",
    answer: [
      "Podés leer y seguir cualquier comunidad. Para votar, comentar o publicar, tenés que ser residente de ese territorio: vivir en una ciudad te habilita también sus niveles superiores.",
    ],
  },
  {
    id: "una-sola-residencia",
    question: "¿Puedo declarar más de una residencia?",
    answer: [
      "No: declarás una sola residencia principal, idealmente tu ciudad o municipio habitual. Esa elección te incorpora automáticamente a toda su cadena territorial. Podés seguir cualquier otra comunidad para recibir novedades, pero sin votar ni comentar allí.",
    ],
  },
  {
    id: "cambiar-residencia",
    question: "¿Puedo cambiar mi residencia?",
    answer: [
      "Sí. Después de elegir o cambiar tu residencia hay un período de 30 días antes del próximo cambio. Desde Perfil siempre podés revisar tu residencia. Si fue una elección reciente y todavía no participaste desde ella, Agorbis puede permitir corregirla durante 24 horas sin reiniciar la fecha original; la pantalla indica si está disponible.",
    ],
  },
  {
    id: "registro-paso-a-paso",
    question: "¿Cómo es el registro, paso a paso?",
    answer: [
      "Son cinco pasos cortos: escribí tu correo y una contraseña, confirmá el correo desde el enlace, aceptá los acuerdos con dos casillas (los marcás al registrarte y, ya con el correo confirmado, una vez más para que queden registrados con tu sesión), elegí tu nombre y después tu comunidad. El nombre de usuario se completa solo y podés cambiarlo. Tu correo se usa para ingresar y no se muestra en ningún lado.",
    ],
  },
  {
    id: "encontrar-mi-ciudad",
    question: "¿Cómo encuentro mi ciudad en Explorar?",
    answer: [
      "Explorar abre en Argentina; la Tierra y el mapa siguen disponibles. El buscador recorre todas las comunidades, muestra primero las más específicas e indica cuál las contiene, para distinguir nombres repetidos. Si tu lugar no está, podés pedir que lo sumemos desde el mismo resultado.",
    ],
    link: { href: "/explorar", label: "Explorar comunidades" },
  },
  {
    id: "identidad-y-privacidad",
    question: "¿Mi identidad queda expuesta?",
    answer: [
      "Tu correo nunca es público. Tu membresía es anónima salvo que elijas mostrarte, permiso que podés revocar. El voto no se guarda como un registro individual con tu elección; tus publicaciones y comentarios sí muestran tu perfil.",
    ],
  },
  {
    id: "resultados-de-encuesta",
    question: "¿Cómo leo los resultados de una encuesta?",
    answer: [
      "Los resultados se muestran al cierre y con al menos cinco participantes. Un fallo de lectura se indica con reintento y no se confunde con participación insuficiente. En encuestas de varias respuestas, una persona puede elegir más de una opción. Es una muestra de quienes participaron, no una medición de toda la comunidad. Si tenés permiso para cerrar una encuesta, podés abrir la confirmación también sin JavaScript.",
    ],
  },
  {
    id: "cuota-de-publicacion",
    question: "¿Por qué hay una cuota para publicar?",
    answer: [
      "Para cuidar la atención de la comunidad y reducir spam. El cupo se renueva cada mes y es más limitado cuanto mayor es el alcance geográfico. Votar, comentar, apoyar y comprometer aportes no consumen ese cupo.",
    ],
  },
  {
    id: "reclamo-sube-de-nivel",
    question: "¿Qué hace falta para que un reclamo suba de nivel?",
    answer: [
      "Tienen que darse tres cosas: que venza el plazo de respuesta de la comunidad, que ninguna institución haya acusado recibo y que el reclamo llegue al mínimo de apoyos que muestra el reloj. Entonces también se muestra en la comunidad superior, sin dejar la suya. No se envía solo a ningún organismo, y los apoyos de la app no son firmas: la planilla en papel es aparte.",
    ],
  },
  {
    id: "herramientas-de-la-comunidad",
    question: "¿Dónde están las herramientas de mi comunidad?",
    answer: [
      "La barra de la comunidad muestra Info, Encuestas, Debates, Reclamos y Proyectos; Miembros, Sub-comunidades, Comparar y, si la comunidad tiene uno cargado, Presupuesto están en Más. Comparar reúne el contraste entre sus sub-comunidades y la comparación con comunidades del mismo nivel. Al final de la página, Más herramientas ofrece las victorias, las instituciones, los recursos para compartir y la guía de participación; en ciudades y barrios suma el mapa barrial y la rendición. Al abrir una herramienta, la navegación indica cuál estás consultando y permite pasar a las demás.",
    ],
  },
  {
    id: "borradores",
    question: "¿Se guardan mis borradores?",
    answer: [
      "Los formularios guardan el texto y las opciones en este dispositivo mientras escribís y antes de cambiar de página. El indicador confirma si pudo guardarse; si falla, te avisa. Al volver se recupera el borrador de tu cuenta y comunidad, la barra del borrador lo dice y permite descartarlo. Las fotos que ya subiste en la revisión de un reclamo se conservan al volver a editar; sin JavaScript hay que seleccionarlas de nuevo. El borrador se elimina al publicar o cerrar sesión.",
    ],
  },
  {
    id: "suspension-y-apelacion",
    question: "¿Qué pasa si suspenden mi cuenta y cómo apelo?",
    answer: [
      "Una suspensión impide nuevas acciones de participación, pero conservás el acceso necesario para exportar tus datos, apelar o borrar la cuenta. En tu perfil, Suspensiones y apelaciones permite consultar la medida y pedir una revisión. Apelar no elimina el registro ni garantiza que la medida se cambie.",
    ],
    link: { href: LEGAL_ROUTES.moderation, label: "Moderación y apelaciones" },
  },
  {
    id: "borrar-cuenta-y-datos",
    question: "¿Cómo borro mi cuenta y mis datos?",
    answer: [
      "Desde tu perfil, con la opción de borrar tu cuenta; si querés conservar una copia, descargá tus datos antes. Si no podés ingresar, podés pedir el borrado por correo. La página Eliminar tu cuenta y tus datos explica los dos caminos, qué se elimina y qué puede permanecer publicado.",
    ],
    link: {
      href: LEGAL_ROUTES.dataDeletion,
      label: "Eliminar tu cuenta y tus datos",
    },
  },
  {
    id: "donaciones",
    question: "¿Cómo se sostiene Agorbis y qué pasa si dono?",
    answer: [
      "Agorbis no tiene publicidad, no vende datos y no cobra por participar. Cuando hay un medio para donar, la portada, el menú de tu cuenta y el pie muestran “Apoyar”, que lleva a una página con un enlace a Cafecito, un sitio externo. Donar es voluntario y no da visibilidad, peso en una votación ni funciones. Agorbis no registra quién dona ni cuánto: el pago queda en Cafecito, y el enlace sale sin datos tuyos ni de tu comunidad.",
    ],
  },
];

export const MANUAL_DETAIL_FAQ: readonly ManualDetailFaqItem[] = [
  {
    id: "volver-despues-de-registrarme",
    category: "cuenta",
    question: "¿Puedo volver a la publicación después de registrarme?",
    answer: [
      "Si empezaste el registro desde una publicación, Agorbis conserva ese destino durante la confirmación del correo, la aceptación de documentos y la elección de residencia para que puedas retomar lo que estabas haciendo.",
    ],
  },
  {
    id: "corregir-correo-de-recuperacion",
    category: "cuenta",
    question: "¿Cómo corrijo el correo al recuperar el acceso?",
    answer: [
      "La pantalla muestra la dirección que ingresaste y permite probar con otra sin volver al ingreso. El mensaje no confirma si existe una cuenta con ese correo.",
    ],
  },
  {
    id: "seguridad-en-dos-pasos",
    category: "cuenta",
    question: "¿Qué es la seguridad en dos pasos y tengo que activarla?",
    answer: [
      "Para tu cuenta es opcional; los roles de moderación sí la exigen. Se activa desde tu perfil, en Seguridad en dos pasos, con una aplicación autenticadora que genera códigos temporales. Guardá el secreto en un lugar seguro: desde esa pantalla no se puede eliminar un factor ya verificado y, si perdés todos tus autenticadores, soporte tiene que validar tu identidad para recuperarlo.",
    ],
    link: { href: "/perfil/seguridad", label: "Seguridad en dos pasos" },
  },
  {
    id: "reintentar-segundo-factor",
    category: "cuenta",
    question:
      "¿Cómo retomo el alta del segundo factor si el código fue rechazado?",
    answer: [
      "Podés volver a ingresar un código del mismo factor pendiente, también después de un envío sin JavaScript. Usá la aplicación que ya vinculaste: el secreto y el QR no se vuelven a mostrar y el reintento no crea otro factor.",
    ],
  },
  {
    id: "cambios-del-perfil",
    category: "cuenta",
    question: "¿Cómo evito perder cambios del perfil?",
    answer: [
      "Si editás tus datos o tu foto y tratás de salir sin guardar, aparece una advertencia. Un guardado rechazado conserva los campos. Si el nombre de usuario ya está ocupado, el formulario señala y enfoca ese campo para corregirlo. Si una foto pública no carga, se muestran las iniciales sin cambiar el tamaño del avatar.",
    ],
  },
  {
    id: "foto-de-perfil",
    category: "cuenta",
    question: "¿Cómo cambio o quito mi foto de perfil?",
    answer: [
      "Al elegir una nueva foto de perfil ves una vista previa local. La foto pública cambia sólo cuando guardás y se confirma la actualización. Los controles para quitar favoritos nombran cada publicación y tienen más espacio para tocarlos.",
      "En Perfil, abrí Cuenta y marcá Quitar foto actual al guardar. La foto se quita cuando se confirman los cambios; si falla el guardado, se conserva. El formulario también explica las reglas del nombre de usuario antes de enviarlo.",
    ],
  },
  {
    id: "seguimiento-y-visibilidad",
    category: "cuenta",
    question: "¿Cómo sé si cambiaron mi seguimiento o mi visibilidad pública?",
    answer: [
      "Seguir, dejar de seguir y cambiar la visibilidad muestran el resultado confirmado. Si falla una operación, conservan el estado anterior y permiten reintentar. Si no se puede consultar tu visibilidad, la pantalla lo indica en vez de asumir que tu perfil está visible.",
    ],
  },
  {
    id: "publicaciones-anteriores",
    category: "cuenta",
    question: "¿Dónde encuentro mis publicaciones anteriores?",
    answer: [
      "En Publicaciones de tu perfil, Ver anteriores permite recorrer tu historial por tandas. Podés volver a las publicaciones más recientes sin cambiar la página de tu actividad o de las comunidades seguidas.",
    ],
  },
  {
    id: "actividad-anterior",
    category: "cuenta",
    question: "¿Dónde veo mi actividad anterior y más comunidades seguidas?",
    answer: [
      "En el perfil podés avanzar a la actividad anterior y a más comunidades seguidas, conservando los filtros. Cada comentario de Actividad enlaza al mensaje concreto, aunque no esté entre los destacados. Publicaciones y Actividad no presenta las filas cargadas como un total de tu historial. Las cuotas disponibles enlazan al formulario de creación de la comunidad correspondiente.",
    ],
  },
  {
    id: "calendario-de-actividad",
    category: "cuenta",
    question: "¿Cómo exploro el calendario de actividad?",
    answer: [
      "En el mapa de actividad del perfil podés recorrer los días con las flechas o elegir una fecha con el selector. Debajo aparecen enlaces a las publicaciones de ese día incluidas en el perfil. El mapa describe sólo las publicaciones cargadas.",
    ],
  },
  {
    id: "enlaces-de-perfil-y-proyectos",
    category: "cuenta",
    question:
      "¿Cómo vuelvo a una sección del perfil o a una vista de proyectos?",
    answer: [
      "Las secciones del perfil y las vistas Cuadrícula y Agenda de proyectos tienen su propia URL. Podés guardar el enlace, recargar y usar Atrás o Adelante. En proyectos, cambiar de vista conserva los filtros y la página; cambiar un filtro vuelve al principio.",
    ],
  },
  {
    id: "pasaporte-civico",
    category: "cuenta",
    question: "¿Cómo avanza mi pasaporte cívico?",
    answer: [
      "El pasaporte usa tus acciones registradas: los niveles comienzan en 0, 5, 10 y 25 acciones. La barra muestra el avance dentro del nivel actual, parte de cero y señala cuando alcanzaste el nivel máximo. Los sellos se pueden abrir y cerrar con teclado.",
      "El pasaporte muestra los sellos que ya obtuviste y, como mucho, el que sigue, con lo que hace falta para conseguirlo. Los demás aparecen a medida que los vas logrando. Nada se marca por adelantado.",
    ],
  },
  {
    id: "cadena-de-comunidades",
    category: "comunidades",
    question:
      "¿Por qué la cadena de comunidades muestra puntos suspensivos en el teléfono?",
    answer: [
      "En pantallas angostas la miga muestra las dos comunidades más cercanas y guarda las que las contienen detrás de los puntos. Tocalos para desplegar la cadena entera. En pantallas más anchas se ve completa.",
    ],
  },
  {
    id: "comunidad-sin-publicaciones",
    category: "comunidades",
    question: "¿Por qué una comunidad dice que todavía no tiene publicaciones?",
    answer: [
      "Cuando Agorbis confirma que no hay encuestas, debates, reclamos ni proyectos, la comunidad propone abrir la primera publicación en lugar de mostrar contadores en cero, y lista hasta tres encuestas abiertas de las comunidades que la contienen, porque quien vive ahí también vota en ellas. Si alguna cantidad no se pudo leer, aparece como no disponible y no se afirma que la comunidad esté vacía.",
    ],
  },
  {
    id: "buscar-subcomunidad",
    category: "comunidades",
    question:
      "¿Cómo encuentro una subcomunidad que no aparece en la primera página?",
    answer: [
      "El directorio permite buscar por nombre entre todas las subcomunidades del territorio y recorrer las páginas de resultados. La búsqueda se aplica antes de paginar y queda en la URL para recargar o compartir la vista.",
    ],
  },
  {
    id: "error-al-cargar-subcomunidades",
    category: "comunidades",
    question: "¿Qué hago si no cargan las subcomunidades o la búsqueda rápida?",
    answer: [
      "Un error de carga ofrece Reintentar y se distingue de una lista sin resultados. La búsqueda rápida descarta los resultados anteriores al cambiar el texto y no permite abrirlos mientras espera la nueva búsqueda.",
    ],
  },
  {
    id: "busqueda-de-miembros",
    category: "comunidades",
    question: "¿Cómo funciona la búsqueda de miembros?",
    answer: [
      "En Miembros podés buscar por nombre público o usuario y filtrar perfiles con foto. La búsqueda abarca todas las páginas y conserva los filtros al avanzar. Sólo aparecen quienes eligieron mostrarse en esa comunidad; los perfiles anónimos siguen ocultos.",
    ],
  },
  {
    id: "en-curso-y-comparativa",
    category: "comunidades",
    question: "¿Qué cuentan En curso y la comparativa comunitaria?",
    answer: [
      "En curso cuenta reclamos abiertos, sin incluir resueltos, rechazados ni retirados. Una cantidad no disponible no equivale a cero. Comunidad consultada es el territorio que abriste; Personas miembro cuenta membresías, sin afirmar dónde vivís ni cuántas personas estuvieron activas recientemente.",
    ],
  },
  {
    id: "guia-de-bienvenida",
    category: "comunidades",
    question: "¿Qué funciones presenta la guía de bienvenida?",
    answer: [
      "La guía explica el mapa de reclamos con ubicación aproximada y los apoyos como señal de un problema compartido, sin garantizar una respuesta de las autoridades. También orienta a encuestas y debates; si hay una ronda de presupuesto, revisá su fase y los requisitos para participar.",
    ],
  },
  {
    id: "modo-asamblea",
    category: "comunidades",
    question: "¿Cómo funciona el turno del modo asamblea?",
    answer: [
      "Turno 2m inicia dos minutos y permite comenzar otro turno al finalizar. Cerrar el proyector cancela el temporizador y lo deja listo para un nuevo turno; también se detiene al salir de la página. En pantallas pequeñas, los controles se acomodan y el contenido se puede desplazar.",
    ],
  },
  {
    id: "idioma-tema-y-busqueda",
    category: "navegacion",
    question: "¿Dónde están el idioma, el tema y la búsqueda?",
    answer: [
      "Sin sesión, idioma y tema están en la barra superior; con sesión, en Preferencias, dentro del menú de tu cuenta. En el teléfono también aparecen en el menú ☰. El buscador de la barra superior encuentra comunidades y publicaciones, y desde sus resultados abrís la búsqueda completa con filtros.",
    ],
  },
  {
    id: "busqueda-y-atajos",
    category: "navegacion",
    question: "¿Cómo busco y uso los atajos?",
    answer: [
      "La búsqueda global necesita al menos 3 caracteres. En computadora, Ctrl+K o Cmd+K abre la paleta de comandos y / enfoca el buscador visible o abre la página de búsqueda. El atajo / no se activa mientras escribís en un formulario. Los atajos de una sola tecla (/, ?, H y E) se pueden apagar desde el panel de accesibilidad, al pie de la página.",
    ],
  },
  {
    id: "pasando-ahora",
    category: "navegacion",
    question: "¿Qué muestra “Pasando ahora” en la portada?",
    answer: [
      "Las últimas publicaciones públicas de cualquier comunidad, leídas como las vería alguien sin cuenta. Lo dado de baja no aparece y, si todavía no hay publicaciones, la sección no se muestra.",
    ],
  },
  {
    id: "filtros-de-inicio-y-busqueda",
    category: "navegacion",
    question:
      "¿Qué conservan las categorías de búsqueda y los filtros de Inicio?",
    answer: [
      "Cambiar el tipo de contenido en Buscar envía también el texto y los filtros que editaste. En Inicio hay un solo conjunto de filtros por comunidad y tipo, aplicado antes de pasar de página; la URL conserva la selección.",
    ],
  },
  {
    id: "busquedas-recientes",
    category: "navegacion",
    question: "¿Las búsquedas recientes conservan mis filtros?",
    answer: [
      "Al elegir un término reciente se conservan el territorio, el tipo de publicación y el orden actuales. La búsqueda vuelve a la primera página para mostrar las coincidencias del término elegido.",
    ],
  },
  {
    id: "donde-publicar-y-cupo",
    category: "publicar",
    question: "¿Dónde puedo publicar y qué pasa si agoté mi cupo?",
    answer: [
      "Publicar usa una comunidad de tu residencia y muestra su nombre antes de escribir. El formulario va directo a los campos: no repite la cabecera de la comunidad y conserva arriba las pestañas de la sección. Si no podés crear ese tipo de publicación en el destino elegido, el selector permite revisar tus comunidades y los cupos disponibles.",
    ],
  },
  {
    id: "publicar-desde-el-telefono",
    category: "publicar",
    question: "¿Cómo elijo qué publicar desde el teléfono?",
    answer: [
      "Tocá Publicar en la navegación inferior y elegí encuesta, debate, reclamo o proyecto. Se usa la comunidad que estás visitando o, fuera de ella, tu residencia. Si todavía no elegiste una comunidad, el selector te lleva a explorar.",
    ],
  },
  {
    id: "fotos-y-revision",
    category: "publicar",
    question: "¿Cómo añado fotos y reviso una publicación antes de publicarla?",
    answer: [
      "Cada selección añade fotos hasta el límite indicado y conserva las anteriores, su orden y su portada. Para reemplazar una foto, quitala primero. Un reclamo se completa en una sola pantalla, con la ubicación como dato opcional; “Revisar antes de publicar” te lleva arriba de la revisión, con cómo va a quedar, y recién ahí se publica; “Volver a editar” te lleva arriba del formulario. Encuestas y proyectos avanzan por pasos: el foco acompaña cada encabezado y se anuncia dónde estás.",
    ],
  },
  {
    id: "corte-de-conexion-al-publicar",
    category: "publicar",
    question: "¿Qué pasa si se corta la conexión mientras publico?",
    answer: [
      "El botón vuelve a habilitarse y un aviso dice que no sabemos si llegó, porque el envío pudo haber entrado antes del corte. Tu texto sigue en pantalla; antes de volver a intentar, fijate en la comunidad si ya se publicó. Un segundo toque mientras el primero está en camino no manda nada, y cuando Agorbis confirma se avisa “Publicado” hasta que se abre la ficha.",
    ],
  },
  {
    id: "despues-de-publicar",
    category: "publicar",
    question: "¿Qué veo después de publicar?",
    answer: [
      "La ficha de tu publicación te muestra qué sigue: el plazo de respuesta de un reclamo, el cierre y el mínimo de participación de una encuesta, cómo compartirla y cómo darla de baja. Sólo lo ve quien la publicó.",
    ],
  },
  {
    id: "guardar-compartir-reportar",
    category: "publicar",
    question: "¿Dónde guardo, comparto o reporto una publicación?",
    answer: [
      "En encuestas, debates, reclamos y proyectos, Guardar en favoritos (☆) y Compartir están debajo del título. El reclamo se comparte desde su barra fija y desde Difundir este reclamo. Reportar está siempre al final de la publicación. Fuentes y contenido relacionado aparecen cuando hay algo cargado o cuando podés sumarlo.",
    ],
  },
  {
    id: "favoritos",
    category: "publicar",
    question: "¿Cómo sé si se guardó un favorito?",
    answer: [
      "La estrella cambia después de guardar en este dispositivo. Si el navegador no permite guardar o quitar el favorito, aparece un aviso junto al control y se conserva el estado anterior para que puedas reintentar. Los favoritos son locales y se eliminan al cerrar sesión.",
    ],
  },
  {
    id: "opciones-sin-cuenta",
    category: "encuestas",
    question: "¿Puedo ver las opciones de una encuesta sin cuenta?",
    answer: [
      "Sí. La pregunta y sus opciones se leen sin cuenta, desde otra residencia y también después de votar. Esa lista no muestra cantidades ni marca qué elegiste: los números salen con los resultados, al cierre. Para votar hacen falta una cuenta y vivir en ese territorio; en una encuesta de la Tierra alcanza con haber elegido dónde vivís.",
    ],
  },
  {
    id: "seleccion-entre-encuestas",
    category: "encuestas",
    question: "¿Se conserva mi selección al abrir otra encuesta?",
    answer: [
      "La selección se reinicia al cambiar de encuesta. Cada confirmación o error de envío corresponde sólo a la encuesta enviada; no acredita participación en otra. La constancia no guarda las opciones elegidas y no permite recuperar ni cambiar un voto registrado.",
    ],
  },
  {
    id: "encuesta-que-vence",
    category: "encuestas",
    question: "¿Qué ocurre si una encuesta vence mientras la estoy leyendo?",
    answer: [
      "La pantalla actualiza el estado al terminar el plazo y al volver a la pestaña. Cuando cierra, deja de ofrecer votar y permite consultar los resultados finales. Agorbis siempre verifica el cierre y la participación mínima antes de publicarlos.",
    ],
  },
  {
    id: "cambiar-tipo-de-encuesta",
    category: "encuestas",
    question: "¿Qué pasa si cambio el tipo de encuesta mientras la preparo?",
    answer: [
      "Las opciones escritas se conservan al pasar a una encuesta binaria y volver. Revisá la fecha, la hora y la zona horaria de cierre antes de publicar: la hora se interpreta en la zona indicada en el formulario.",
    ],
  },
  {
    id: "pagina-sin-encuestas",
    category: "encuestas",
    question: "¿Qué hago cuando no quedan encuestas en una página?",
    answer: [
      "Una página agotada se distingue de una comunidad sin encuestas. Podés volver al principio del listado conservando los filtros elegidos, también sin JavaScript.",
    ],
  },
  {
    id: "seguir-despues-de-participar",
    category: "encuestas",
    question: "¿Cómo sigo una encuesta o un proyecto después de participar?",
    answer: [
      "Después de votar, la encuesta te recuerda que te avisamos al cierre, según tus preferencias, y que los resultados se publican si participaron al menos 5 personas. Cada proyecto muestra sus etapas (Propuesta, Juntando apoyo, En ejecución y Completado) y quién las marca. Quienes se sumaron reciben una notificación cuando avanza.",
    ],
  },
  {
    id: "acuerdo-entre-comunidades",
    category: "encuestas",
    question: "¿Cómo funciona un acuerdo entre comunidades?",
    answer: [
      "Un acuerdo se propone desde la sección Acuerdos de la pestaña Encuestas de tu comunidad. Queda “Propuesto, esperando adhesión” hasta que una residente de cada comunidad elegida, y otra distinta de quien propone en la propia, adhiere. Con la última adhesión se abre una votación binaria en todas a la vez, con el cierre que fija la duración elegida (7 a 30 días). Adherir no aprueba nada: sólo dice que esa comunidad va a votar. Quien propone puede retirar la propuesta sólo antes de que se abra, y a los 30 días sin la última adhesión queda “Sin adhesión”. Como cualquier publicación, un acuerdo se puede reportar desde su ficha; moderación puede darlo de baja, con sus rondas, y restaurarlo.",
    ],
  },
  {
    id: "acuerdo-aprobado-y-quorum",
    category: "encuestas",
    question:
      "¿Cuándo un acuerdo queda aprobado y qué pasa si una comunidad no llega a cinco participantes?",
    answer: [
      "El resultado se calcula al cierre de la votación y por comunidad: hacen falta cinco participantes o más y más votos por sí que por no; el empate rechaza. El acuerdo queda “Aprobado” sólo si todas las comunidades aprobaron, “Rechazado” si alguna rechazó y “Sin quórum” si ninguna rechazó pero alguna no llegó a cinco. La participación se muestra al lado del resultado de cada comunidad y nunca se suma entre comunidades. Durante la ronda no se muestran conteos, y una ronda abierta por su enlace de encuesta te lleva a la página del acuerdo.",
    ],
  },
  {
    id: "donde-escribir-en-un-debate",
    category: "debates",
    question: "¿Dónde escribo en un debate?",
    answer: [
      "En la columna de tu comunidad, marcada como Tu comunidad. La caja para comentar está arriba de sus comentarios y el botón “Comentar desde…”, bajo el título, la trae a la vista y la deja lista para escribir.",
    ],
  },
  {
    id: "editar-mientras-se-envia",
    category: "debates",
    question: "¿Qué pasa si sigo editando un comentario mientras se envía?",
    answer: [
      "La confirmación limpia sólo el texto enviado que sigue intacto. Si escribiste cambios durante la espera, quedan en el borrador y se indica que siguen pendientes; no se publican automáticamente.",
    ],
  },
  {
    id: "mas-comentarios",
    category: "debates",
    question: "¿Cómo leo más de veinte comentarios de una columna?",
    answer: [
      "El debate comienza con los comentarios destacados de cada columna. El botón al pie permite cargar el resto por tandas, sin duplicar comentarios ni perder el lugar de lectura. Un fallo permite reintentar.",
    ],
  },
  {
    id: "citas-y-resumen",
    category: "debates",
    question: "¿Cómo uso citas y el resumen de un debate?",
    answer: [
      "Citar agrega el texto a tu borrador de la comunidad correspondiente, sin publicar ni reemplazar lo escrito. Si supera el límite, conserva el borrador y te permite copiar la cita. El filtro de propuestas busca palabras en español o inglés entre las citas cargadas; el resumen muestra puntajes de comentarios cargados, no el acuerdo de toda la comunidad.",
    ],
  },
  {
    id: "compartir-un-comentario",
    category: "debates",
    question: "¿Cómo comparto un comentario concreto?",
    answer: [
      "Cada comentario ofrece un enlace directo. Al abrirlo, se muestra ese comentario aunque no esté entre los primeros de su columna, siempre que siga visible. Si necesitás ingresar para votar, volvés a ese mismo mensaje y elegís tu voto después. Si falla un voto por conexión, se restaura el estado anterior y podés reintentar.",
    ],
  },
  {
    id: "etapas-de-un-reclamo",
    category: "reclamos",
    question: "¿Qué hechos muestran las etapas de un reclamo?",
    answer: [
      "Cada etapa distingue apoyos, elevación registrada y su destino, acuse institucional, respuesta oficial, gestión y resolución. Llegar a la meta de apoyos no significa que el reclamo se haya elevado. Una resolución tampoco acredita etapas anteriores que no se registraron.",
    ],
  },
  {
    id: "quien-actualiza-un-reclamo",
    category: "reclamos",
    question: "¿Quién puede actualizar el seguimiento de un reclamo?",
    answer: [
      "Pueden agregar actualizaciones el autor, moderación y representantes verificados de la organización responsable. Las respuestas oficiales y los cambios de estado corresponden a moderación o a esa organización. Cuando la organización sigue disponible, cada movimiento institucional muestra su nombre, aunque después cambie el organismo responsable.",
    ],
  },
  {
    id: "novedad-del-reclamo",
    category: "reclamos",
    question: "¿Cómo sé si se guardó una novedad del reclamo?",
    answer: [
      "El seguimiento confirma el guardado y actualiza la cronología. Lo que hayas editado durante el envío se conserva. Una resolución del autor sin institución se distingue de una respuesta oficial; los permisos para cambiar el estado no cambian.",
    ],
  },
  {
    id: "plazo-del-reclamo",
    category: "reclamos",
    question: "¿El plazo del reclamo cambia mientras tengo la pestaña abierta?",
    answer: [
      "El reloj actualiza los días y el vencimiento mientras leés y al volver a la pestaña. Que el plazo termine no significa que el reclamo ya haya escalado: ese cambio sólo se muestra cuando Agorbis lo confirma.",
    ],
  },
  {
    id: "antes-y-despues",
    category: "reclamos",
    question: "¿Qué evidencia aparece en la comparación de antes y después?",
    answer: [
      "La comparativa usa imágenes compatibles que la plataforma puede mostrar. Si la evidencia es un PDF, una página u otro documento, se ofrece como enlace para consultarlo en lugar de mostrar una imagen rota.",
    ],
  },
  {
    id: "ubicacion-en-la-revision",
    category: "reclamos",
    question: "¿Qué significa la ubicación en la revisión de un reclamo?",
    answer: [
      "La revisión distingue una referencia escrita, una zona aproximada marcada y la ausencia de ubicación. No afirma que exista un punto en el mapa si no lo elegiste; podés volver a los detalles para corregirlo antes de publicar.",
    ],
  },
  {
    id: "buscar-un-reclamo",
    category: "reclamos",
    question: "¿Cómo busco un reclamo de mi comunidad?",
    answer: [
      "El buscador de Reclamos consulta títulos y descripciones de todas las páginas de esa comunidad. La búsqueda, la categoría, el estado y el orden se conservan en la URL al avanzar, para compartir el resultado o volver a él.",
    ],
  },
  {
    id: "reclamos-fuera-del-historial",
    category: "reclamos",
    question:
      "¿Qué significa el aviso de reclamos fuera del historial reciente?",
    answer: [
      "El aviso compara los reclamos de esta página con un historial limitado de tarjetas vistas en este dispositivo. Sólo registra las tarjetas que llegan a la pantalla: un filtro no marca como vistos los reclamos ocultos. El historial se elimina al limpiar los datos personales locales.",
    ],
  },
  {
    id: "estados-y-distancias-del-mapa",
    category: "reclamos",
    question: "¿Qué significan los estados y las distancias del mapa?",
    answer: [
      "El mapa muestra el estado real de cada reclamo, incluidas las respuestas negativas. Los focos críticos reúnen reclamos abiertos con al menos cinco apoyos dentro de los resultados cargados. La distancia aproximada se mide en línea recta desde el centro indicado, sobre coordenadas públicas aproximadas; no representa un recorrido ni un tiempo de viaje.",
    ],
  },
  {
    id: "busqueda-del-mapa",
    category: "reclamos",
    question: "¿Qué abarca la búsqueda del mapa?",
    answer: [
      "El mapa busca por título o ubicación escrita y filtra categoría y estado antes de elegir hasta cien reclamos. La URL conserva esos filtros. Los conteos corresponden a los resultados mostrados; si falla la consulta aparece un error con una opción para reintentar.",
    ],
  },
  {
    id: "radio-mapa-y-ubicacion",
    category: "reclamos",
    question: "¿Cómo se relacionan el radio, el mapa y mi ubicación?",
    answer: [
      "Todo el territorio encuadra los reclamos con ubicación cargados. Al elegir un radio, el listado muestra los reclamos dentro de ese radio y separa los que no tienen ubicación. En móvil, seleccionar un reclamo acerca y enfoca su detalle. Usar mi ubicación indica la búsqueda o el error; Centrar en la comunidad vuelve al centro inicial. La ubicación del dispositivo se usa sólo en esta vista. Si falla copiar coordenadas, el diálogo permite seleccionarlas para copiarlas manualmente; siempre son coordenadas públicas aproximadas.",
    ],
  },
  {
    id: "revisar-el-barrio",
    category: "reclamos",
    question: "¿Qué significa Revisar el barrio en el mapa?",
    answer: [
      "Es una invitación a recorrer y consultar el barrio. Agorbis todavía no calcula qué sectores tienen cobertura suficiente ni detecta zonas silenciosas: que no aparezca un reclamo no permite concluir que no haya problemas o participación.",
    ],
  },
  {
    id: "compromiso-con-un-proyecto",
    category: "proyectos",
    question: "¿Cómo sé si se guardó mi compromiso con un proyecto?",
    answer: [
      "Al guardar, modificar o retirar un compromiso, el panel confirma el resultado y actualiza el aporte personal, el progreso y el total de personas comprometidas. Ese total incluye todos los compromisos, aunque la lista muestre sólo los más recientes. Si falla la lectura de tu compromiso, ofrece volver a cargarlo antes de hacer cambios. Un rechazo conserva lo escrito. Agorbis no procesa pagos.",
      "En móvil, Ver opciones de aporte cerca del título lleva al panel de compromisos. Agorbis no procesa pagos. Una pregunta o respuesta enviada con éxito recibe una confirmación; el texto de otros formularios en edición se conserva y un error no borra lo escrito.",
    ],
  },
  {
    id: "corregir-hito-tarea-o-aporte",
    category: "proyectos",
    question: "¿Cómo corrijo un hito, tarea o aporte que no se pudo guardar?",
    answer: [
      "El formulario señala los campos que necesitan corrección y conserva lo enviado, también sin JavaScript. Un guardado aceptado se confirma y actualiza la ejecución. Si editaste mientras se guardaba, esas ediciones siguen pendientes. Los selectores ofrecen los cambios de estado permitidos desde el estado actual; Agorbis verifica cada operación.",
    ],
  },
  {
    id: "preguntas-de-un-proyecto",
    category: "proyectos",
    question: "¿Cómo recorro todas las preguntas de un proyecto?",
    answer: [
      "Preguntas y respuestas se recorren por páginas con enlaces que funcionan sin JavaScript. El mensaje recién enviado o enlazado se recupera aunque no esté en esa página. Si hace falta, se muestra su pregunta como contexto; el listado aclara qué mensajes están cargados.",
    ],
  },
  {
    id: "agenda-de-un-proyecto",
    category: "proyectos",
    question: "¿Qué fecha agrega la agenda de un proyecto?",
    answer: [
      "Agendar utiliza la próxima fecha objetivo de un hito pendiente o en curso, como evento tentativo de todo el día. Es una previsión del plan y puede cambiar. Si no hay una próxima fecha, la agenda lo indica y enlaza al proyecto.",
    ],
  },
  {
    id: "presupuesto-con-centavos",
    category: "proyectos",
    question: "¿Cómo escribo un presupuesto con centavos?",
    answer: [
      "En español podés escribir 2.500,50; en inglés, 2,500.50. El formulario conserva lo escrito y muestra el importe interpretado antes de publicar. Si el formato no es válido, te pide corregirlo. El presupuesto sigue siendo opcional.",
    ],
  },
  {
    id: "error-en-un-presupuesto",
    category: "proyectos",
    question: "¿Qué hago si no se pueden consultar datos de un presupuesto?",
    answer: [
      "La pantalla identifica la sección que falló y permite volver a cargar. Una lectura desconocida no significa que no haya propuestas, que no hayas participado o que no seas elegible. Las acciones que necesitan ese dato esperan una lectura correcta. Los resultados mantienen las reglas de cierre, participación mínima y voto secreto.",
    ],
  },
  {
    id: "escuchar-resumen",
    category: "notificaciones",
    question: "¿Qué lee “Escuchar resumen” en Notificaciones?",
    answer: [
      "Lee sólo las notificaciones de la página visible, con sus filtros actuales, y se detiene al salir de Notificaciones. La lista aparece primero; las preferencias están al final, en “Elegir qué recibir”. Al editarlas se indican los cambios sin guardar y el éxito aparece después de confirmarlos. Marcar como leídas confirma cuántas se actualizaron y muestra un error si falla.",
    ],
  },
  {
    id: "notificaciones-leidas",
    category: "notificaciones",
    question: "¿Qué se actualiza al marcar notificaciones como leídas?",
    answer: [
      "Después de confirmar el cambio, se actualizan la bandeja y la campana. En la vista Sin leer se retiran las filas leídas, conservando los filtros y la página. Más filtros se puede abrir y cerrar también sin JavaScript.",
      "Ocultar filtros conserva los valores que estabas editando. Al volver a abrirlos podés continuar y aplicarlos sin tener que seleccionar todo otra vez.",
    ],
  },
  {
    id: "preferencias-de-avisos",
    category: "notificaciones",
    question: "¿Cómo corrijo preferencias de avisos que no se guardaron?",
    answer: [
      "El formulario se abre con las opciones que enviaste, incluidas las que desmarcaste, para corregir y reintentar. Sólo muestra guardado después de confirmarlo. Los enlaces de filtros indican cuál está activo y tienen espacio suficiente para tocarlos.",
    ],
  },
  {
    id: "idioma-al-compartir",
    category: "compartir",
    question: "¿En qué idioma se comparten las publicaciones?",
    answer: [
      "Los mensajes preparados por Agorbis usan el idioma elegido y conservan los títulos escritos por la comunidad. Si el sistema no puede compartir, aparece un aviso para reintentar o copiar el enlace. Cancelar voluntariamente no se trata como un error.",
      "El resumen barrial y el balance cívico usan el idioma elegido en Agorbis. La vista previa, Copiar y WhatsApp contienen el mismo mensaje, con los nombres de la comunidad sin traducir. Son cantidades acumuladas, no un informe semanal.",
    ],
  },
  {
    id: "falla-copiar-enlace",
    category: "compartir",
    question: "¿Qué hago si falla Copiar enlace?",
    answer: [
      "Se muestra el enlace exacto que ibas a compartir en un campo de texto. Seleccionar enlace lo enfoca y selecciona para copiarlo manualmente; no hace falta copiar parámetros o fragmentos de la barra de direcciones.",
      "La invitación rápida a votar desaparece cuando vence el plazo de la encuesta. Al compartir un reclamo, cancelar el menú del teléfono no muestra un error. Si falla compartir o copiar, aparece un aviso para que puedas volver a intentarlo.",
    ],
  },
  {
    id: "kit-de-difusion",
    category: "compartir",
    question: "¿El kit de difusión copia lo que veo en pantalla?",
    answer: [
      "La invitación y la firma usan el idioma elegido y conservan el nombre de la comunidad. La vista previa y la copia contienen el mismo texto. Si el portapapeles falla, podés seleccionar el texto de la vista previa y copiarlo manualmente.",
    ],
  },
  {
    id: "compartir-una-victoria",
    category: "compartir",
    question: "¿Cómo comparto una victoria concreta?",
    answer: [
      "El título de una victoria destacada abre su reclamo. Sus opciones de compartir también enlazan a ese reclamo, para que otras personas puedan consultar el resultado y su evidencia.",
    ],
  },
  {
    id: "afiche-y-reporte",
    category: "compartir",
    question: "¿Cómo imprimo un afiche de la comunidad o reporto contenido?",
    answer: [
      "En los recursos para compartir podés abrir un afiche imprimible con un QR que lleva a la comunidad. Reportar contenido abre una confirmación que funciona sin JavaScript y conserva el motivo si el envío se rechaza. Si necesitás ingresar, el enlace conserva el destino y vuelve a abrir el formulario después del ingreso.",
    ],
  },
  {
    id: "imprimible-que-falla",
    category: "compartir",
    question: "¿Por qué puede fallar un imprimible de un reclamo?",
    answer: [
      "Afiche, dossier, nota y planilla distinguen un reclamo inexistente de un error al consultar sus datos. Si falla la consulta, podés volver a intentar. El dossier tampoco presenta una cronología vacía cuando no se pudieron leer sus movimientos.",
    ],
  },
  {
    id: "consultar-institucion",
    category: "instituciones",
    question: "¿Dónde consulto una institución o pido acreditación?",
    answer: [
      "En el directorio de tu comunidad, tocá el nombre de una institución para ver su perfil público. Solicitar acreditación institucional lleva directamente al formulario de solicitud.",
    ],
  },
  {
    id: "buscar-instituciones",
    category: "instituciones",
    question: "¿Cómo busco instituciones y respuestas anteriores?",
    answer: [
      "Los directorios permiten buscar y filtrar por tipo antes de pasar de página. El perfil institucional permite recorrer su historial de respuestas; los conteos aclaran qué respuestas y reclamos abarcan.",
    ],
  },
  {
    id: "solicitud-guardada",
    category: "instituciones",
    question: "¿Cómo sé si se guardó mi solicitud de institución o comunidad?",
    answer: [
      "La confirmación identifica la solicitud y permite verla en tu historial actualizado. El nombre y la explicación se limpian si no los editaste mientras esperabas. Un rechazo conserva los datos; recargar la confirmación de un envío sin JavaScript no vuelve a enviarlo. Sin JavaScript, la comunidad superior se indica con el nombre que aparece en su dirección web y se comprueba al enviar.",
    ],
  },
  {
    id: "errores-en-fuentes",
    category: "instituciones",
    question:
      "¿Qué hago si una fuente o respuesta institucional tiene errores?",
    answer: [
      "El formulario señala los campos que necesitan corrección y conserva lo escrito, también sin JavaScript. Un guardado aceptado se confirma y actualiza la lista sin borrar otras ediciones. Si falla la lectura de fuentes, respuestas o representación, se indica y se ofrece volver a cargar; no se presenta como una lista vacía. Vincular contenido también confirma el guardado y conserva la selección ante un rechazo.",
    ],
  },
  {
    id: "apelacion-enviada",
    category: "instituciones",
    question: "¿Cómo sé si se envió o retiró mi apelación?",
    answer: [
      "La confirmación corresponde a la suspensión elegida y el historial se actualiza después de guardar. Si el envío se rechaza, el texto se conserva para corregirlo. Los borradores de otras suspensiones no se borran.",
    ],
  },
  {
    id: "accesibilidad-sin-cuenta",
    category: "accesibilidad",
    question: "¿Puedo ajustar la accesibilidad antes de crear una cuenta?",
    answer: [
      "Sí. El pie de las pantallas de ingreso y registro también ofrece Accesibilidad para ajustar contraste, tamaño de texto y foco. Las fichas de la comunidad indican si están expandidas y ofrecen un botón amplio para abrirlas y cerrarlas.",
    ],
  },
  {
    id: "vibracion-y-animaciones",
    category: "accesibilidad",
    question: "¿Por qué el teléfono no vibra y hay pocas animaciones?",
    answer: [
      "La vibración viene apagada: se enciende en Accesibilidad, al pie de cada pantalla, y acompaña una acción terminada, como un voto o un apoyo registrados, no el simple toque. Reducir movimiento, desde ese panel o desde el sistema, frena también el confeti y los desplazamientos animados. El confeti queda para celebrar a mano un hito o un sello ya conseguidos.",
    ],
  },
  {
    id: "hitos-y-atajos-en-dialogos",
    category: "accesibilidad",
    question: "¿Cómo recorro los hitos y uso los atajos dentro de un diálogo?",
    answer: [
      "El carrusel permite elegir hitos con botones amplios e indica cuál está seleccionado. El teclado sólo recorre las acciones del hito visible. Los atajos globales se suspenden mientras hay un diálogo abierto; el panel de accesibilidad mantiene visibles las opciones activas y ofrece controles amplios para ajustar el texto.",
    ],
  },
  {
    id: "agendar-y-fotos-con-teclado",
    category: "accesibilidad",
    question: "¿Cómo uso Agendar y las fotos con el teclado?",
    answer: [
      "En Agendar, las flechas abren y recorren las opciones; Inicio y Fin van a los extremos. Escape cierra y devuelve el foco al botón, y Tab continúa por la página. Las fotos enlazan a la imagen completa también sin JavaScript. Cuando se abre el diálogo, anuncia el reclamo y Escape devuelve el foco a la miniatura.",
    ],
  },
  {
    id: "publicar-sin-javascript",
    category: "sin-javascript",
    question: "¿Puedo enviar publicaciones sin JavaScript?",
    answer: [
      "Si ya tenés una sesión, los formularios permiten enviar, revisar, volver a editar y confirmar publicaciones con formularios comunes. Los pasos aparecen juntos y se mantienen las validaciones y los permisos. Algunas ayudas, como guardar borradores automáticamente o agregar opciones dinámicas, necesitan JavaScript.",
    ],
  },
  {
    id: "territorio-sin-javascript",
    category: "sin-javascript",
    question: "¿Cómo elijo un territorio de búsqueda sin JavaScript?",
    answer: [
      "Elegir territorio abre un buscador de comunidades que conserva tu término y los demás filtros. Elegí un resultado para aplicarlo, volvé sin cambiarlo o buscá en todo el territorio. Escribir un nombre por sí solo no aplica un territorio.",
    ],
  },
  {
    id: "cancelar-retiro-sin-javascript",
    category: "sin-javascript",
    question: "¿Puedo cancelar el retiro de una publicación sin JavaScript?",
    answer: [
      "Sí. Retirar contenido abre una pantalla de confirmación. Cancelar vuelve al contenido sin retirarlo y conserva el contexto de la página. La publicación sólo se retira después de confirmar y de que Agorbis acepte la operación.",
    ],
  },
  {
    id: "vincular-sin-javascript",
    category: "sin-javascript",
    question: "¿Cómo busco una publicación para vincular sin JavaScript?",
    answer: [
      "Desde el formulario de relación podés buscar publicaciones por título y tipo, elegir un resultado y volver al contenido de origen. La selección se comprueba con tus permisos. Elegir todavía no guarda la relación: revisá el destino y confirmá el formulario.",
    ],
  },
  {
    id: "cuit-sin-javascript",
    category: "sin-javascript",
    question: "¿Se envían el CUIT y el teléfono si no uso JavaScript?",
    answer: [
      "Sí. Se suman al mensaje de la solicitud institucional para su revisión. La explicación y esos datos deben sumar hasta 2000 caracteres. Si necesitás corregir algo, se conservan la explicación, el tipo y los contactos enviados.",
    ],
  },
];

/** Límite del texto buscado: llega por la URL y se repite en la página. */
export const MANUAL_QUERY_MAX_LENGTH = 80;

/** Deja la búsqueda que llegó por la URL en un largo razonable. */
export function cleanManualQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim().slice(0, MANUAL_QUERY_MAX_LENGTH);
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Dice si `text` contiene todas las palabras de `query`, sin distinguir
 * mayúsculas ni acentos y en cualquier orden. Una búsqueda vacía no filtra.
 */
export function matchesManualQuery(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(text);
  return words.every((word) => haystack.includes(word));
}

/**
 * Filtra preguntas por el texto que la persona tiene delante: se busca sobre
 * la traducción al idioma elegido, no sobre el español fuente.
 */
export function filterManualFaq<
  T extends Pick<ManualFaqItem, "question" | "answer">,
>(items: readonly T[], query: string, t: (text: string) => string): T[] {
  return items.filter((entry) =>
    matchesManualQuery(
      [entry.question, ...entry.answer].map(t).join(" "),
      query,
    ),
  );
}
