import type { Messages } from "../types";

export const enManual: Messages = {
  // Acuerdos entre comunidades (D118); "Acuerdos" vive en auth.ts
  "Comprometer a una comunidad, sola o junto con otras, con una decisión votada.":
    "Commit a community, alone or together with others, to a decision taken by vote.",
  "Una residente propone el compromiso desde su comunidad y elige hasta cuatro comunidades más del mismo país, de provincia para abajo y que no se contengan entre sí. Cada comunidad vota por separado, con la misma constancia sin elección de las encuestas, y el acuerdo existe sólo si todas lo aprueban. Nadie abre una votación en una comunidad ajena: entra cuando una residente de ahí adhiere.":
    "A resident proposes the commitment from their community and chooses up to four more communities in the same country, from province level down, none containing another. Each community votes separately, with the same choice-free receipt as polls, and the agreement exists only if all of them approve it. Nobody opens a vote in someone else's community: it joins when one of its residents endorses.",
  "El pasaporte muestra los sellos que ya obtuviste y, como mucho, el que sigue, con lo que hace falta para conseguirlo. Los demás aparecen a medida que los vas logrando. Nada se marca por adelantado.":
    "The passport shows the stamps you have earned and, at most, the next one, with what it takes to get it. The rest appear as you earn them. Nothing is marked in advance.",
  "¿Por qué la cadena de comunidades muestra puntos suspensivos en el teléfono?":
    "Why does the community chain show an ellipsis on the phone?",
  "En pantallas angostas la miga muestra las dos comunidades más cercanas y guarda las que las contienen detrás de los puntos. Tocalos para desplegar la cadena entera. En pantallas más anchas se ve completa.":
    "On narrow screens the breadcrumb shows the two nearest communities and keeps the ones containing them behind the dots. Tap them to unfold the whole chain. On wider screens it is shown in full.",
  "¿Cómo funciona un acuerdo entre comunidades?":
    "How does an agreement between communities work?",
  "Un acuerdo se propone desde la sección Acuerdos de la pestaña Encuestas de tu comunidad. Queda “Propuesto, esperando adhesión” hasta que una residente de cada comunidad elegida, y otra distinta de quien propone en la propia, adhiere. Con la última adhesión se abre una votación binaria en todas a la vez, con el cierre que fija la duración elegida (7 a 30 días). Adherir no aprueba nada: sólo dice que esa comunidad va a votar. Quien propone puede retirar la propuesta sólo antes de que se abra, y a los 30 días sin la última adhesión queda “Sin adhesión”. Como cualquier publicación, un acuerdo se puede reportar desde su ficha; moderación puede darlo de baja, con sus rondas, y restaurarlo.":
    "An agreement is proposed from the Agreements section of your community's Polls tab. It stays “Proposed, awaiting endorsement” until a resident of each chosen community, and in your own one a resident other than the proposer, endorses it. The last endorsement opens a yes/no vote in all of them at once, closing after the chosen duration (7 to 30 days). Endorsing approves nothing: it only says that community will vote. The proposer can withdraw only before the vote opens, and after 30 days without the last endorsement it becomes “Not endorsed”. Like any publication, an agreement can be reported from its page; moderation can remove it, rounds included, and restore it.",
  "¿Cuándo un acuerdo queda aprobado y qué pasa si una comunidad no llega a cinco participantes?":
    "When is an agreement approved, and what if a community does not reach five participants?",
  "El resultado se calcula al cierre de la votación y por comunidad: hacen falta cinco participantes o más y más votos por sí que por no; el empate rechaza. El acuerdo queda “Aprobado” sólo si todas las comunidades aprobaron, “Rechazado” si alguna rechazó y “Sin quórum” si ninguna rechazó pero alguna no llegó a cinco. La participación se muestra al lado del resultado de cada comunidad y nunca se suma entre comunidades. Durante la ronda no se muestran conteos, y una ronda abierta por su enlace de encuesta te lleva a la página del acuerdo.":
    "The outcome is computed when voting closes, community by community: it takes five or more participants and more yes than no votes; a tie rejects. The agreement is “Approved” only if every community approved, “Rejected” if any rejected, and “No quorum” if none rejected but one fell short of five. Participation is shown next to each community's outcome and is never added up across communities. No tallies are shown during the round, and a round opened through its poll link takes you to the agreement page.",
  "¿Qué pasa si sigo editando un comentario mientras se envía?":
    "What happens if I keep editing a comment while it is being submitted?",
  "La confirmación limpia sólo el texto enviado que sigue intacto. Si escribiste cambios durante la espera, quedan en el borrador y se indica que siguen pendientes; no se publican automáticamente.":
    "Confirmation clears only the submitted text that remains unchanged. Changes written while waiting stay in the draft, with a notice that they are still pending; they are not published automatically.",
  "¿Cómo elijo un territorio de búsqueda sin JavaScript?":
    "How do I choose a search territory without JavaScript?",
  "Elegir territorio abre un buscador de comunidades que conserva tu término y los demás filtros. Elegí un resultado para aplicarlo, volvé sin cambiarlo o buscá en todo el territorio. Escribir un nombre por sí solo no aplica un territorio.":
    "Choose territory opens a community search that keeps your term and other filters. Choose a result to apply it, return without changing it, or search all territories. Typing a name alone does not apply a territory.",
  "¿Cómo sé si se guardó mi solicitud de institución o comunidad?":
    "How do I know whether my institution or community request was saved?",
  "La confirmación identifica la solicitud y permite verla en tu historial actualizado. El nombre y la explicación se limpian si no los editaste mientras esperabas. Un rechazo conserva los datos; recargar la confirmación de un envío sin JavaScript no vuelve a enviarlo. Sin JavaScript, la comunidad superior se indica con el nombre que aparece en su dirección web y se comprueba al enviar.":
    "Confirmation identifies the request and links to it in your updated history. The name and explanation clear if you did not edit them while waiting. A rejection preserves your data; reloading the confirmation of a submission made without JavaScript does not resubmit it. Without JavaScript, enter the parent community's name as it appears in its web address; it is checked on submission.",
  "¿Se envían el CUIT y el teléfono si no uso JavaScript?":
    "Are the tax ID and phone number submitted without JavaScript?",
  "Sí. Se suman al mensaje de la solicitud institucional para su revisión. La explicación y esos datos deben sumar hasta 2000 caracteres. Si necesitás corregir algo, se conservan la explicación, el tipo y los contactos enviados.":
    "Yes. They are added to the institution request message for review. The explanation and those details must fit within 2000 characters combined. If corrections are needed, the explanation, type, and submitted contact details are preserved.",
  "¿Cómo corrijo preferencias de avisos que no se guardaron?":
    "How do I correct notification preferences that were not saved?",
  "El formulario se abre con las opciones que enviaste, incluidas las que desmarcaste, para corregir y reintentar. Sólo muestra guardado después de confirmarlo. Los enlaces de filtros indican cuál está activo y tienen espacio suficiente para tocarlos.":
    "The form opens with your submitted options, including unchecked ones, so you can correct and retry. It shows saved only after confirmation. Filter links indicate which one is active and provide enough space to tap.",
  "¿Qué cuentan En curso y la comparativa comunitaria?":
    "What do In progress and the community comparison count?",
  "En curso cuenta reclamos abiertos, sin incluir resueltos, rechazados ni retirados. Una cantidad no disponible no equivale a cero. Comunidad consultada es el territorio que abriste; Personas miembro cuenta membresías, sin afirmar dónde vivís ni cuántas personas estuvieron activas recientemente.":
    "In progress counts open claims, excluding resolved, rejected, and removed ones. An unavailable count does not mean zero. Community being viewed is the territory you opened; Members counts memberships without claiming where you live or how many people were recently active.",
  "¿Qué funciones presenta la guía de bienvenida?":
    "Which features does the welcome guide describe?",
  "La guía explica el mapa de reclamos con ubicación aproximada y los apoyos como señal de un problema compartido, sin garantizar una respuesta de las autoridades. También orienta a encuestas y debates; si hay una ronda de presupuesto, revisá su fase y los requisitos para participar.":
    "The guide explains the claim map with approximate locations and support as a signal of a shared problem, without guaranteeing a response from authorities. It also points to polls and debates; if there is a budget round, check its phase and participation requirements.",
  "¿El kit de difusión copia lo que veo en pantalla?":
    "Does the outreach kit copy what I see on screen?",
  "La invitación y la firma usan el idioma elegido y conservan el nombre de la comunidad. La vista previa y la copia contienen el mismo texto. Si el portapapeles falla, podés seleccionar el texto de la vista previa y copiarlo manualmente.":
    "The invitation and signature use your chosen language and preserve the community name. The preview and clipboard contain the same text. If clipboard access fails, you can select the preview text and copy it manually.",
  "¿Qué hago si no se pueden consultar datos de un presupuesto?":
    "What should I do if budget data cannot be loaded?",
  "La pantalla identifica la sección que falló y permite volver a cargar. Una lectura desconocida no significa que no haya propuestas, que no hayas participado o que no seas elegible. Las acciones que necesitan ese dato esperan una lectura correcta. Los resultados mantienen las reglas de cierre, participación mínima y voto secreto.":
    "The page identifies the section that failed and lets you reload. An unknown read does not mean there are no proposals, that you have not participated, or that you are ineligible. Actions needing that information wait for a successful read. Results retain the closing, minimum-participation, and secret-vote rules.",
  "¿Puedo cancelar el retiro de una publicación sin JavaScript?":
    "Can I cancel removing a publication without JavaScript?",
  "Sí. Retirar contenido abre una pantalla de confirmación. Cancelar vuelve al contenido sin retirarlo y conserva el contexto de la página. La publicación sólo se retira después de confirmar y de que Agorbis acepte la operación.":
    "Yes. Remove content opens a confirmation page. Cancel returns to the content without removing it and preserves the page context. The publication is removed only after confirmation and once Agorbis accepts the operation.",
  "¿Se conserva mi selección al abrir otra encuesta?":
    "Is my selection kept when I open another poll?",
  "La selección se reinicia al cambiar de encuesta. Cada confirmación o error de envío corresponde sólo a la encuesta enviada; no acredita participación en otra. La constancia no guarda las opciones elegidas y no permite recuperar ni cambiar un voto registrado.":
    "The selection resets when you change polls. Each submission confirmation or error applies only to the poll submitted; it does not establish participation in another. The receipt does not store selected options and cannot recover or change a recorded vote.",
  "¿Qué hechos muestran las etapas de un reclamo?":
    "Which facts do claim progress stages show?",
  "Cada etapa distingue apoyos, elevación registrada y su destino, acuse institucional, respuesta oficial, gestión y resolución. Llegar a la meta de apoyos no significa que el reclamo se haya elevado. Una resolución tampoco acredita etapas anteriores que no se registraron.":
    "Each stage distinguishes support, a recorded escalation and its destination, institutional acknowledgment, an official response, management status, and resolution. Reaching the support target does not mean the claim has been escalated. A resolution does not establish earlier stages that were not recorded either.",
  "¿Por qué puede fallar un imprimible de un reclamo?":
    "Why might a claim printable fail?",
  "Afiche, dossier, nota y planilla distinguen un reclamo inexistente de un error al consultar sus datos. Si falla la consulta, podés volver a intentar. El dossier tampoco presenta una cronología vacía cuando no se pudieron leer sus movimientos.":
    "The poster, dossier, formal note, and signature sheet distinguish a missing claim from an error reading its data. If the query fails, you can retry. The dossier also avoids showing an empty timeline when its events could not be read.",
  "¿Cómo busco una publicación para vincular sin JavaScript?":
    "How do I find a publication to link without JavaScript?",
  "Desde el formulario de relación podés buscar publicaciones por título y tipo, elegir un resultado y volver al contenido de origen. La selección se comprueba con tus permisos. Elegir todavía no guarda la relación: revisá el destino y confirmá el formulario.":
    "From the relation form, you can search publications by title and type, choose a result, and return to the source content. The selection is checked with your permissions. Choosing does not save the relation yet: review the destination and confirm the form.",
  "¿Cómo retomo el alta del segundo factor si el código fue rechazado?":
    "How do I resume second-factor setup if the code was rejected?",
  "Podés volver a ingresar un código del mismo factor pendiente, también después de un envío sin JavaScript. Usá la aplicación que ya vinculaste: el secreto y el QR no se vuelven a mostrar y el reintento no crea otro factor.":
    "You can enter another code for the same pending factor, including after submitting without JavaScript. Use the app you already linked: the secret and QR are not shown again, and retrying does not create another factor.",
  "¿Qué se actualiza al marcar notificaciones como leídas?":
    "What updates when I mark notifications as read?",
  "Después de confirmar el cambio, se actualizan la bandeja y la campana. En la vista Sin leer se retiran las filas leídas, conservando los filtros y la página. Más filtros se puede abrir y cerrar también sin JavaScript.":
    "Once the change is confirmed, the inbox and bell update. Read rows disappear from the Unread view while keeping your filters and page. More filters can also be opened and closed without JavaScript.",
  "¿Cómo sé si se envió o retiró mi apelación?":
    "How do I know whether my appeal was submitted or withdrawn?",
  "La confirmación corresponde a la suspensión elegida y el historial se actualiza después de guardar. Si el envío se rechaza, el texto se conserva para corregirlo. Los borradores de otras suspensiones no se borran.":
    "The confirmation applies to the selected suspension, and the history updates after saving. If a submission is rejected, the text is preserved for correction. Drafts for other suspensions are not erased.",
  "¿Cómo corrijo un hito, tarea o aporte que no se pudo guardar?":
    "How do I correct a milestone, task, or contribution that could not be saved?",
  "El formulario señala los campos que necesitan corrección y conserva lo enviado, también sin JavaScript. Un guardado aceptado se confirma y actualiza la ejecución. Si editaste mientras se guardaba, esas ediciones siguen pendientes. Los selectores ofrecen los cambios de estado permitidos desde el estado actual; Agorbis verifica cada operación.":
    "The form identifies fields that need correcting and preserves your submission, including without JavaScript. An accepted save is confirmed and updates execution. Edits made while saving remain pending. Selectors offer status changes permitted from the current status; Agorbis checks every operation.",
  "¿Cómo recorro todas las preguntas de un proyecto?":
    "How do I browse all questions on a project?",
  "Preguntas y respuestas se recorren por páginas con enlaces que funcionan sin JavaScript. El mensaje recién enviado o enlazado se recupera aunque no esté en esa página. Si hace falta, se muestra su pregunta como contexto; el listado aclara qué mensajes están cargados.":
    "Questions and answers have page links that work without JavaScript. Newly submitted or linked messages are retrieved even if they are outside that page. Their question is shown as context when needed; the list explains which messages are loaded.",
  "¿Qué significa Revisar el barrio en el mapa?":
    "What does Review the neighborhood on the map mean?",
  "Es una invitación a recorrer y consultar el barrio. Agorbis todavía no calcula qué sectores tienen cobertura suficiente ni detecta zonas silenciosas: que no aparezca un reclamo no permite concluir que no haya problemas o participación.":
    "It is an invitation to explore and ask about the neighborhood. Agorbis does not yet calculate which areas have sufficient coverage or detect silent zones: an absence of claims does not establish an absence of problems or participation.",
  "¿Las búsquedas recientes conservan mis filtros?":
    "Do recent searches keep my filters?",
  "Al elegir un término reciente se conservan el territorio, el tipo de publicación y el orden actuales. La búsqueda vuelve a la primera página para mostrar las coincidencias del término elegido.":
    "Choosing a recent term keeps your current territory, content type, and order. Search returns to the first page to show matches for that term.",
  "¿Qué hago si falla Copiar enlace?": "What should I do if Copy link fails?",
  "Se muestra el enlace exacto que ibas a compartir en un campo de texto. Seleccionar enlace lo enfoca y selecciona para copiarlo manualmente; no hace falta copiar parámetros o fragmentos de la barra de direcciones.":
    "The exact link you were sharing appears in a text field. Select link focuses and selects it for manual copying; you do not need to copy parameters or fragments from the address bar.",
  "El formulario señala los campos que necesitan corrección y conserva lo escrito, también sin JavaScript. Un guardado aceptado se confirma y actualiza la lista sin borrar otras ediciones. Si falla la lectura de fuentes, respuestas o representación, se indica y se ofrece volver a cargar; no se presenta como una lista vacía. Vincular contenido también confirma el guardado y conserva la selección ante un rechazo.":
    "The form identifies fields that need correcting and preserves your text, including without JavaScript. An accepted save is confirmed and updates the list without erasing other edits. Failed reads of sources, responses, or organization membership are identified with a reload option rather than shown as empty lists. Linking content also confirms the save and preserves the selection after a rejection.",
  "En Agendar, las flechas abren y recorren las opciones; Inicio y Fin van a los extremos. Escape cierra y devuelve el foco al botón, y Tab continúa por la página. Las fotos enlazan a la imagen completa también sin JavaScript. Cuando se abre el diálogo, anuncia el reclamo y Escape devuelve el foco a la miniatura.":
    "In Add to calendar, arrow keys open and navigate the options; Home and End move to the first and last. Escape closes it and returns focus to the button, and Tab continues through the page. Photos link to the full image even without JavaScript. When the dialog opens, it announces the claim, and Escape returns focus to the thumbnail.",
  "Los resultados se muestran al cierre y con al menos cinco participantes. Un fallo de lectura se indica con reintento y no se confunde con participación insuficiente. En encuestas de varias respuestas, una persona puede elegir más de una opción. Es una muestra de quienes participaron, no una medición de toda la comunidad. Si tenés permiso para cerrar una encuesta, podés abrir la confirmación también sin JavaScript.":
    "Results are shown after closing with at least five participants. A failed read offers a retry and is not confused with insufficient participation. In multiple-choice polls, a person can choose more than one option. Results describe those who participated rather than measure the entire community. If you have permission to close a poll, you can open the confirmation without JavaScript too.",
  "¿Cómo sé si se guardó una novedad del reclamo?":
    "How do I know whether a claim update was saved?",
  "El seguimiento confirma el guardado y actualiza la cronología. Lo que hayas editado durante el envío se conserva. Una resolución del autor sin institución se distingue de una respuesta oficial; los permisos para cambiar el estado no cambian.":
    "The progress section confirms the save and updates the timeline. Edits made during submission are preserved. An author's resolution without an institution is distinguished from an official response; permissions to change the status remain the same.",
  "¿Qué evidencia aparece en la comparación de antes y después?":
    "What evidence appears in the before-and-after comparison?",
  "La comparativa usa imágenes compatibles que la plataforma puede mostrar. Si la evidencia es un PDF, una página u otro documento, se ofrece como enlace para consultarlo en lugar de mostrar una imagen rota.":
    "The comparison uses supported images the platform can display. If the evidence is a PDF, a page, or another document, it is offered as a link you can open instead of a broken image.",
  "¿Cómo sigo una encuesta o un proyecto después de participar?":
    "How do I follow a poll or a project after taking part?",
  "Después de votar, la encuesta te recuerda que te avisamos al cierre, según tus preferencias, y que los resultados se publican si participaron al menos 5 personas. Cada proyecto muestra sus etapas (Propuesta, Juntando apoyo, En ejecución y Completado) y quién las marca. Quienes se sumaron reciben una notificación cuando avanza.":
    "After you vote, the poll reminds you that we'll notify you when it closes, according to your preferences, and that results are published if at least 5 people took part. Each project shows its stages (Proposal, Gathering support, In progress and Completed) and who marks them. People who joined get a notification when it moves forward.",
  "¿Dónde escribo en un debate?": "Where do I write in a debate?",
  "En la columna de tu comunidad, marcada como Tu comunidad. La caja para comentar está arriba de sus comentarios y el botón “Comentar desde…”, bajo el título, la trae a la vista y la deja lista para escribir.":
    "In your community's column, marked as Your community. The comment box sits above its comments and the “Comment from…” button, under the title, brings it into view, ready to type.",
  "¿Qué muestra “Pasando ahora” en la portada?":
    "What does “Happening now” on the home page show?",
  "Las últimas publicaciones públicas de cualquier comunidad, leídas como las vería alguien sin cuenta. Lo dado de baja no aparece y, si todavía no hay publicaciones, la sección no se muestra.":
    "The latest public posts from any community, read as someone without an account would see them. Withdrawn posts are excluded and, if there are no posts yet, the section is not shown.",
  "¿Qué pasa si se corta la conexión mientras publico?":
    "What happens if the connection drops while I'm posting?",
  "El botón vuelve a habilitarse y un aviso dice que no sabemos si llegó, porque el envío pudo haber entrado antes del corte. Tu texto sigue en pantalla; antes de volver a intentar, fijate en la comunidad si ya se publicó. Un segundo toque mientras el primero está en camino no manda nada, y cuando Agorbis confirma se avisa “Publicado” hasta que se abre la ficha.":
    "The button becomes available again and a notice says we don't know whether it arrived, because the submission may have gone through before the drop. Your text stays on screen; before trying again, check the community to see whether it was already published. A second tap while the first is on its way sends nothing, and once Agorbis confirms, “Published” is shown until the post opens.",
  "¿Qué veo después de publicar?": "What do I see after posting?",
  "La ficha de tu publicación te muestra qué sigue: el plazo de respuesta de un reclamo, el cierre y el mínimo de participación de una encuesta, cómo compartirla y cómo darla de baja. Sólo lo ve quien la publicó.":
    "Your post's page shows what happens next: a claim's response deadline, a poll's closing date and participation minimum, how to share it and how to withdraw it. Only the person who posted it sees this.",
  "¿Cómo encuentro mi ciudad en Explorar?": "How do I find my city in Explore?",
  "Explorar abre en Argentina; la Tierra y el mapa siguen disponibles. El buscador recorre todas las comunidades, muestra primero las más específicas e indica cuál las contiene, para distinguir nombres repetidos. Si tu lugar no está, podés pedir que lo sumemos desde el mismo resultado.":
    "Explore opens on Argentina; Earth and the map are still one click away. Search covers every community, lists the most specific ones first and shows which community contains each one, so repeated names can be told apart. If your place is missing, you can ask us to add it from the same result.",
  "¿Por qué una comunidad dice que todavía no tiene publicaciones?":
    "Why does a community say it has no posts yet?",
  "Cuando Agorbis confirma que no hay encuestas, debates, reclamos ni proyectos, la comunidad propone abrir la primera publicación en lugar de mostrar contadores en cero, y lista hasta tres encuestas abiertas de las comunidades que la contienen, porque quien vive ahí también vota en ellas. Si alguna cantidad no se pudo leer, aparece como no disponible y no se afirma que la comunidad esté vacía.":
    "When Agorbis confirms there are no polls, debates, claims or projects, the community invites you to start the first post instead of showing counters at zero, and lists up to three open polls from the communities that contain it, because anyone who lives there also votes in them. If a count could not be read, it shows as unavailable and the community is not described as empty.",
  "¿Qué hace falta para que un reclamo suba de nivel?":
    "What does it take for a claim to move up a level?",
  "Tienen que darse tres cosas: que venza el plazo de respuesta de la comunidad, que ninguna institución haya acusado recibo y que el reclamo llegue al mínimo de apoyos que muestra el reloj. Entonces también se muestra en la comunidad superior, sin dejar la suya. No se envía solo a ningún organismo, y los apoyos de la app no son firmas: la planilla en papel es aparte.":
    "Three things must happen: the community's response deadline passes, no institution has acknowledged it, and the claim reaches the minimum support shown on the clock. It then also appears in the parent community without leaving its own. It is not sent to any agency on its own, and in-app support is not a signature: the paper sheet is separate.",
  "¿El plazo del reclamo cambia mientras tengo la pestaña abierta?":
    "Does the claim deadline update while the tab stays open?",
  "El reloj actualiza los días y el vencimiento mientras leés y al volver a la pestaña. Que el plazo termine no significa que el reclamo ya haya escalado: ese cambio sólo se muestra cuando Agorbis lo confirma.":
    "The clock updates the days and deadline while you read and when you return to the tab. A deadline passing does not mean the claim has already escalated: that change is only shown once Agorbis confirms it.",
  "¿Cómo sé si cambiaron mi seguimiento o mi visibilidad pública?":
    "How do I know whether following or my public visibility changed?",
  "Seguir, dejar de seguir y cambiar la visibilidad muestran el resultado confirmado. Si falla una operación, conservan el estado anterior y permiten reintentar. Si no se puede consultar tu visibilidad, la pantalla lo indica en vez de asumir que tu perfil está visible.":
    "Following, unfollowing, and changing visibility show the confirmed result. If an operation fails, the previous state is preserved and you can retry. If your visibility cannot be read, the page says so instead of assuming your profile is visible.",
  "¿Cómo comparto una victoria concreta?": "How do I share a specific victory?",
  "El título de una victoria destacada abre su reclamo. Sus opciones de compartir también enlazan a ese reclamo, para que otras personas puedan consultar el resultado y su evidencia.":
    "A featured victory's title opens its claim. Its sharing options also link to that claim so other people can review the outcome and its evidence.",
  "¿Cómo encuentro una subcomunidad que no aparece en la primera página?":
    "How do I find a subcommunity that is not on the first page?",
  "El directorio permite buscar por nombre entre todas las subcomunidades del territorio y recorrer las páginas de resultados. La búsqueda se aplica antes de paginar y queda en la URL para recargar o compartir la vista.":
    "The directory lets you search all subcommunities in the territory by name and browse result pages. Search is applied before pagination and stays in the URL so you can reload or share the view.",
  "¿Qué hago cuando no quedan encuestas en una página?":
    "What do I do when a page has no more polls?",
  "Una página agotada se distingue de una comunidad sin encuestas. Podés volver al principio del listado conservando los filtros elegidos, también sin JavaScript.":
    "An exhausted page is distinguished from a community with no polls. You can return to the start of the list while keeping your filters, including without JavaScript.",
  "¿Cómo corrijo el correo al recuperar el acceso?":
    "How do I correct my email address when recovering access?",
  "La pantalla muestra la dirección que ingresaste y permite probar con otra sin volver al ingreso. El mensaje no confirma si existe una cuenta con ese correo.":
    "The page shows the address you entered and lets you try another without returning to sign-in. The message does not confirm whether an account exists for that address.",
  "¿Quién puede actualizar el seguimiento de un reclamo?":
    "Who can update a claim’s progress?",
  "Pueden agregar actualizaciones el autor, moderación y representantes verificados de la organización responsable. Las respuestas oficiales y los cambios de estado corresponden a moderación o a esa organización. Cuando la organización sigue disponible, cada movimiento institucional muestra su nombre, aunque después cambie el organismo responsable.":
    "The author, moderators, and verified representatives of the responsible organization can add updates. Official responses and status changes are available to moderators or that organization. When the organization is still available, each institutional event shows its name, even if the responsible organization later changes.",
  "¿Qué hago si una fuente o respuesta institucional tiene errores?":
    "What should I do if a source or institutional response has errors?",
  "El formulario señala los campos que necesitan corrección y conserva lo escrito, también sin JavaScript. Los enlaces del resumen llevan al campo correspondiente. Un guardado aceptado se confirma y actualiza la lista; las ediciones hechas durante el envío y el texto de otros formularios se conservan.":
    "The form identifies fields that need correcting and preserves what you wrote, including without JavaScript. Summary links take you to the relevant field. An accepted save is confirmed and updates the list; edits made during submission and text in other forms are preserved.",
  "¿Cómo sé si se guardó mi compromiso con un proyecto?":
    "How do I know whether my project pledge was saved?",
  "Al guardar, modificar o retirar un compromiso, el panel confirma el resultado y actualiza el aporte personal, el progreso y el total de personas comprometidas. Ese total incluye todos los compromisos, aunque la lista muestre sólo los más recientes. Si falla la lectura de tu compromiso, ofrece volver a cargarlo antes de hacer cambios. Un rechazo conserva lo escrito. Agorbis no procesa pagos.":
    "When you save, change, or withdraw a pledge, the panel confirms the result and updates your pledge, the project’s progress, and the total number of people who pledged. That total includes all pledges even when the list shows only the most recent ones. If your pledge cannot be read, you can reload it before making changes. A rejection preserves your text. Agorbis does not process payments.",
  "¿Dónde encuentro mis publicaciones anteriores?":
    "Where can I find my older posts?",
  "En Publicaciones de tu perfil, Ver anteriores permite recorrer tu historial por tandas. Podés volver a las publicaciones más recientes sin cambiar la página de tu actividad o de las comunidades seguidas.":
    "In your profile’s Posts section, View older lets you browse your history in batches. You can return to your latest posts without changing the page of your activity or followed communities.",
  "¿Cómo añado fotos y reviso una publicación antes de publicarla?":
    "How do I add photos and review a post before publishing it?",
  "Cada selección añade fotos hasta el límite indicado y conserva las anteriores, su orden y su portada. Para reemplazar una foto, quitala primero. Un reclamo se completa en una sola pantalla, con la ubicación como dato opcional; “Revisar antes de publicar” te lleva arriba de la revisión, con cómo va a quedar, y recién ahí se publica; “Volver a editar” te lleva arriba del formulario. Encuestas y proyectos avanzan por pasos: el foco acompaña cada encabezado y se anuncia dónde estás.":
    "Each selection adds photos up to the stated limit and keeps the earlier ones, their order and their cover. To replace a photo, remove it first. A claim is filled in on a single screen, with location as optional; “Review before publishing” takes you to the top of the review, showing how it will look, and only then is it published; “Back to editing” takes you to the top of the form. Polls and projects move through steps: focus follows each heading and your position is announced.",
  "Ocultar filtros conserva los valores que estabas editando. Al volver a abrirlos podés continuar y aplicarlos sin tener que seleccionar todo otra vez.":
    "Hiding filters preserves the values you were editing. When you reopen them, you can continue and apply them without selecting everything again.",
  "¿Qué ocurre si una encuesta vence mientras la estoy leyendo?":
    "What happens if a poll closes while I am reading it?",
  "La pantalla actualiza el estado al terminar el plazo y al volver a la pestaña. Cuando cierra, deja de ofrecer votar y permite consultar los resultados finales. Agorbis siempre verifica el cierre y la participación mínima antes de publicarlos.":
    "The page updates its status when the deadline passes and when you return to the tab. Once closed, it stops offering voting and lets you check the final results. Agorbis always checks the deadline and minimum participation before publishing results.",
  "¿Qué significan los estados y las distancias del mapa?":
    "What do the map’s statuses and distances mean?",
  "El mapa muestra el estado real de cada reclamo, incluidas las respuestas negativas. Los focos críticos reúnen reclamos abiertos con al menos cinco apoyos dentro de los resultados cargados. La distancia aproximada se mide en línea recta desde el centro indicado, sobre coordenadas públicas aproximadas; no representa un recorrido ni un tiempo de viaje.":
    "The map shows each claim’s actual status, including negative responses. Critical points are open claims with at least five supporters among the loaded results. Approximate distance is measured in a straight line from the indicated center using approximate public coordinates; it is not a route or travel time.",
  "¿Dónde puedo publicar y qué pasa si agoté mi cupo?":
    "Where can I publish, and what happens if I reach my limit?",
  "Publicar usa una comunidad de tu residencia y muestra su nombre antes de escribir. El formulario va directo a los campos: no repite la cabecera de la comunidad y conserva arriba las pestañas de la sección. Si no podés crear ese tipo de publicación en el destino elegido, el selector permite revisar tus comunidades y los cupos disponibles.":
    "Publish uses a community in your residence chain and shows its name before you write. The form goes straight to the fields: it doesn't repeat the community header and keeps the section tabs at the top. If you cannot create that type of post in the selected destination, the selector lets you review your communities and available quotas.",
  "¿Qué conservan las categorías de búsqueda y los filtros de Inicio?":
    "What do search categories and Home filters preserve?",
  "Cambiar el tipo de contenido en Buscar envía también el texto y los filtros que editaste. En Inicio hay un solo conjunto de filtros por comunidad y tipo, aplicado antes de pasar de página; la URL conserva la selección.":
    "Changing the content type in Search also submits the text and filters you edited. Home has one set of community and content-type filters applied before pagination; the URL preserves your selection.",
  "¿Cómo leo más de veinte comentarios de una columna?":
    "How do I read more than twenty comments in a column?",
  "El debate comienza con los comentarios destacados de cada columna. El botón al pie permite cargar el resto por tandas, sin duplicar comentarios ni perder el lugar de lectura. Un fallo permite reintentar.":
    "A debate starts with each column’s highlighted comments. The button at the bottom loads the remaining comments in batches without duplicates or losing your reading position. If loading fails, you can retry.",
  "En móvil, Ver opciones de aporte cerca del título lleva al panel de compromisos. Agorbis no procesa pagos. Una pregunta o respuesta enviada con éxito recibe una confirmación; el texto de otros formularios en edición se conserva y un error no borra lo escrito.":
    "On mobile, View contribution options near the title takes you to the commitment panel. Agorbis does not process payments. A successfully posted question or answer receives confirmation; text being edited in other forms is preserved, and an error does not erase your writing.",
  "¿Puedo ajustar la accesibilidad antes de crear una cuenta?":
    "Can I adjust accessibility before creating an account?",
  "Sí. El pie de las pantallas de ingreso y registro también ofrece Accesibilidad para ajustar contraste, tamaño de texto y foco. Las fichas de la comunidad indican si están expandidas y ofrecen un botón amplio para abrirlas y cerrarlas.":
    "Yes. The footer on sign-in and registration screens also offers Accessibility to adjust contrast, text size and focus. Community cards indicate whether they are expanded and provide a large button to open and close them.",
  "¿Por qué el teléfono no vibra y hay pocas animaciones?":
    "Why doesn’t my phone vibrate, and why are there few animations?",
  "La vibración viene apagada: se enciende en Accesibilidad, al pie de cada pantalla, y acompaña una acción terminada, como un voto o un apoyo registrados, no el simple toque. Reducir movimiento, desde ese panel o desde el sistema, frena también el confeti y los desplazamientos animados. El confeti queda para celebrar a mano un hito o un sello ya conseguidos.":
    "Vibration is off by default: turn it on under Accessibility, at the bottom of every screen. It accompanies a completed action, such as a recorded vote or support, not a mere tap. Reducing motion, from that panel or from your system settings, also stops confetti and animated scrolling. Confetti is reserved for celebrating, by hand, a milestone or badge already achieved.",
  "¿Qué significa la ubicación en la revisión de un reclamo?":
    "What does location mean when reviewing a claim?",
  "La revisión distingue una referencia escrita, una zona aproximada marcada y la ausencia de ubicación. No afirma que exista un punto en el mapa si no lo elegiste; podés volver a los detalles para corregirlo antes de publicar.":
    "The review distinguishes a written reference, a marked approximate area and no location. It does not claim that a map point exists if you did not choose one; you can return to the details to correct it before publishing.",

  "¿Qué pasa si cambio el tipo de encuesta mientras la preparo?":
    "What happens if I change the poll type while preparing it?",
  "Las opciones escritas se conservan al pasar a una encuesta binaria y volver. Revisá la fecha, la hora y la zona horaria de cierre antes de publicar: la hora se interpreta en la zona indicada en el formulario.":
    "Your written options are preserved when switching to a binary poll and back. Review the closing date, time and time zone before publishing: the time is interpreted in the zone shown in the form.",
  "¿Qué hago si no cargan las subcomunidades o la búsqueda rápida?":
    "What should I do if subcommunities or quick search fail to load?",
  "Un error de carga ofrece Reintentar y se distingue de una lista sin resultados. La búsqueda rápida descarta los resultados anteriores al cambiar el texto y no permite abrirlos mientras espera la nueva búsqueda.":
    "A loading error offers Try again and is distinguished from an empty list. Quick search clears previous results when the text changes and prevents opening them while waiting for the new search.",
  "¿En qué idioma se comparten las publicaciones?":
    "Which language is used when sharing posts?",
  "Los mensajes preparados por Agorbis usan el idioma elegido y conservan los títulos escritos por la comunidad. Si el sistema no puede compartir, aparece un aviso para reintentar o copiar el enlace. Cancelar voluntariamente no se trata como un error.":
    "Messages prepared by Agorbis use your selected language and preserve community-written titles. If the system cannot share, a notice offers retrying or copying the link. Voluntary cancellation is not treated as an error.",
  "¿Cómo recorro los hitos y uso los atajos dentro de un diálogo?":
    "How do I browse milestones and use shortcuts inside a dialog?",
  "El carrusel permite elegir hitos con botones amplios e indica cuál está seleccionado. El teclado sólo recorre las acciones del hito visible. Los atajos globales se suspenden mientras hay un diálogo abierto; el panel de accesibilidad mantiene visibles las opciones activas y ofrece controles amplios para ajustar el texto.":
    "The carousel lets you choose milestones with large buttons and indicates the selected one. The keyboard only visits actions in the visible milestone. Global shortcuts are suspended while a dialog is open; the accessibility panel clearly shows active options and provides large controls for adjusting text size.",
  "¿Cómo funciona el turno del modo asamblea?":
    "How does the assembly-mode timer work?",
  "Turno 2m inicia dos minutos y permite comenzar otro turno al finalizar. Cerrar el proyector cancela el temporizador y lo deja listo para un nuevo turno; también se detiene al salir de la página. En pantallas pequeñas, los controles se acomodan y el contenido se puede desplazar.":
    "Turno 2m starts a two-minute turn and lets you start another after it ends. Closing the projector cancels the timer and prepares it for a new turn; it also stops when you leave the page. On small screens, controls adapt and content can be scrolled.",

  "¿Cómo avanza mi pasaporte cívico?": "How does my civic passport progress?",
  "El pasaporte usa tus acciones registradas: los niveles comienzan en 0, 5, 10 y 25 acciones. La barra muestra el avance dentro del nivel actual, parte de cero y señala cuando alcanzaste el nivel máximo. Los sellos se pueden abrir y cerrar con teclado.":
    "The passport uses your recorded actions: levels start at 0, 5, 10 and 25 actions. The bar shows progress within the current level, starts at zero and indicates when you reach the highest level. Badges can be opened and closed with a keyboard.",
  "¿Qué fecha agrega la agenda de un proyecto?":
    "Which date does the project calendar add?",
  "Agendar utiliza la próxima fecha objetivo de un hito pendiente o en curso, como evento tentativo de todo el día. Es una previsión del plan y puede cambiar. Si no hay una próxima fecha, la agenda lo indica y enlaza al proyecto.":
    "Add to calendar uses the next target date of a pending or ongoing milestone as a tentative all-day event. This is a planned date and may change. If there is no upcoming date, the agenda says so and links to the project.",
  "¿Cómo evito perder cambios del perfil?":
    "How do I avoid losing profile changes?",
  "Si editás tus datos o tu foto y tratás de salir sin guardar, aparece una advertencia. Un guardado rechazado conserva los campos. Si el nombre de usuario ya está ocupado, el formulario señala y enfoca ese campo para corregirlo. Si una foto pública no carga, se muestran las iniciales sin cambiar el tamaño del avatar.":
    "If you edit your details or photo and try to leave without saving, a warning appears. A rejected save preserves the fields. If the username is already taken, the form identifies and focuses that field so you can correct it. If a public photo fails to load, initials appear without changing the avatar’s size.",
  "¿Dónde veo mi actividad anterior y más comunidades seguidas?":
    "Where can I see older activity and more followed communities?",
  "En el perfil podés avanzar a la actividad anterior y a más comunidades seguidas, conservando los filtros. Cada comentario de Actividad enlaza al mensaje concreto, aunque no esté entre los destacados. Publicaciones y Actividad no presenta las filas cargadas como un total de tu historial. Las cuotas disponibles enlazan al formulario de creación de la comunidad correspondiente.":
    "In your profile, you can browse older activity and more followed communities while preserving filters. Each Activity comment links to its exact message, even outside the highlights. Publications and Activity does not present loaded rows as a total of your history. Available quotas link to the creation form for the corresponding community.",
  "¿Cómo exploro el calendario de actividad?":
    "How do I explore the activity calendar?",
  "En el mapa de actividad del perfil podés recorrer los días con las flechas o elegir una fecha con el selector. Debajo aparecen enlaces a las publicaciones de ese día incluidas en el perfil. El mapa describe sólo las publicaciones cargadas.":
    "In the profile activity map, you can move through days with the arrow keys or choose a date with the picker. Links below show that day’s publications included in the profile. The map describes only loaded publications.",
  "¿Cómo busco instituciones y respuestas anteriores?":
    "How do I find institutions and older responses?",
  "Los directorios permiten buscar y filtrar por tipo antes de pasar de página. El perfil institucional permite recorrer su historial de respuestas; los conteos aclaran qué respuestas y reclamos abarcan.":
    "Directories let you search and filter by type before moving between pages. An institution’s profile lets you browse its response history; counts explain which responses and claims they cover.",
  "¿Qué significa el aviso de reclamos fuera del historial reciente?":
    "What does the notice about claims outside recent history mean?",
  "El aviso compara los reclamos de esta página con un historial limitado de tarjetas vistas en este dispositivo. Sólo registra las tarjetas que llegan a la pantalla: un filtro no marca como vistos los reclamos ocultos. El historial se elimina al limpiar los datos personales locales.":
    "The notice compares claims on this page with a limited history of cards viewed on this device. It records only cards that enter the screen: filters do not mark hidden claims as viewed. The history is removed when local personal data is cleared.",
  "¿Cómo uso citas y el resumen de un debate?":
    "How do I use quotes and a debate summary?",
  "Citar agrega el texto a tu borrador de la comunidad correspondiente, sin publicar ni reemplazar lo escrito. Si supera el límite, conserva el borrador y te permite copiar la cita. El filtro de propuestas busca palabras en español o inglés entre las citas cargadas; el resumen muestra puntajes de comentarios cargados, no el acuerdo de toda la comunidad.":
    "Quoting adds text to your draft for the relevant community without publishing or replacing your writing. If it exceeds the limit, your draft is preserved and you can copy the quote. The proposal filter looks for Spanish or English words in loaded quotes; the summary shows scores of loaded comments, not agreement across the whole community.",
  "¿Cómo imprimo un afiche de la comunidad o reporto contenido?":
    "How do I print a community poster or report content?",
  "En los recursos para compartir podés abrir un afiche imprimible con un QR que lleva a la comunidad. Reportar contenido abre una confirmación que funciona sin JavaScript y conserva el motivo si el envío se rechaza. Si necesitás ingresar, el enlace conserva el destino y vuelve a abrir el formulario después del ingreso.":
    "In sharing resources, you can open a printable poster with a QR code linking to the community. Report content opens a confirmation that works without JavaScript and preserves the reason if submission is rejected. If you need to sign in, the link keeps the destination and reopens the form after sign-in.",
  "¿Cómo se relacionan el radio, el mapa y mi ubicación?":
    "How do the radius, map and my location work together?",
  "Todo el territorio encuadra los reclamos con ubicación cargados. Al elegir un radio, el listado muestra los reclamos dentro de ese radio y separa los que no tienen ubicación. En móvil, seleccionar un reclamo acerca y enfoca su detalle. Usar mi ubicación indica la búsqueda o el error; Centrar en la comunidad vuelve al centro inicial. La ubicación del dispositivo se usa sólo en esta vista. Si falla copiar coordenadas, el diálogo permite seleccionarlas para copiarlas manualmente; siempre son coordenadas públicas aproximadas.":
    "The whole territory fits the loaded claims with locations. Choosing a radius shows claims within it and separates those without a location. On mobile, selecting a claim brings its details into view and focuses them. Use my location shows progress or an error; Center on community restores the initial center. The device location is used only in this view. If copying coordinates fails, the dialog lets you select them for manual copying; these are always approximate public coordinates.",
  "¿Cómo vuelvo a una sección del perfil o a una vista de proyectos?":
    "How do I return to a profile section or project view?",
  "Las secciones del perfil y las vistas Cuadrícula y Agenda de proyectos tienen su propia URL. Podés guardar el enlace, recargar y usar Atrás o Adelante. En proyectos, cambiar de vista conserva los filtros y la página; cambiar un filtro vuelve al principio.":
    "Profile sections and the Grid and Agenda project views have their own URL. You can save the link, reload, and use Back or Forward. Switching project views preserves filters and the page; changing a filter returns to the beginning.",
  "Al elegir una nueva foto de perfil ves una vista previa local. La foto pública cambia sólo cuando guardás y se confirma la actualización. Los controles para quitar favoritos nombran cada publicación y tienen más espacio para tocarlos.":
    "Choosing a new profile photo shows a local preview. Your public photo changes only after you save and the update is confirmed. Controls for removing bookmarks name each post and have larger touch targets.",
  "¿Cómo comparto un comentario concreto?":
    "How do I share a specific comment?",
  "Cada comentario ofrece un enlace directo. Al abrirlo, se muestra ese comentario aunque no esté entre los primeros de su columna, siempre que siga visible. Si necesitás ingresar para votar, volvés a ese mismo mensaje y elegís tu voto después. Si falla un voto por conexión, se restaura el estado anterior y podés reintentar.":
    "Each comment has a direct link. Opening it shows that comment even outside the first messages in its column, as long as it remains visible. If you need to sign in to vote, you return to that message and choose your vote afterwards. If a vote fails because of connectivity, the previous state is restored and you can retry.",
  "¿Qué abarca la búsqueda del mapa?": "What does the map search cover?",
  "El mapa busca por título o ubicación escrita y filtra categoría y estado antes de elegir hasta cien reclamos. La URL conserva esos filtros. Los conteos corresponden a los resultados mostrados; si falla la consulta aparece un error con una opción para reintentar.":
    "The map searches titles or written locations and filters by category and status before selecting up to one hundred claims. The URL preserves those filters. Counts refer to the displayed results; if the query fails, an error offers an option to retry.",
  "El resumen barrial y el balance cívico usan el idioma elegido en Agorbis. La vista previa, Copiar y WhatsApp contienen el mismo mensaje, con los nombres de la comunidad sin traducir. Son cantidades acumuladas, no un informe semanal.":
    "The neighborhood summary and civic balance use your selected Agorbis language. The preview, Copy and WhatsApp contain the same message, with community names left untranslated. These are cumulative counts, not a weekly report.",
  "La invitación rápida a votar desaparece cuando vence el plazo de la encuesta. Al compartir un reclamo, cancelar el menú del teléfono no muestra un error. Si falla compartir o copiar, aparece un aviso para que puedas volver a intentarlo.":
    "The quick invitation to vote disappears when the poll deadline passes. Cancelling your phone’s sharing menu for a claim does not show an error. If sharing or copying fails, a message lets you try again.",
  "¿Cómo busco un reclamo de mi comunidad?":
    "How do I search for a claim in my community?",
  "El buscador de Reclamos consulta títulos y descripciones de todas las páginas de esa comunidad. La búsqueda, la categoría, el estado y el orden se conservan en la URL al avanzar, para compartir el resultado o volver a él.":
    "The Claims search covers titles and descriptions across all pages in that community. The search, category, status, and order stay in the URL as you move between pages, so you can share or revisit the results.",
  "En Perfil, abrí Cuenta y marcá Quitar foto actual al guardar. La foto se quita cuando se confirman los cambios; si falla el guardado, se conserva. El formulario también explica las reglas del nombre de usuario antes de enviarlo.":
    "In Profile, open Account and select Remove current photo when saving. Your photo is removed after the changes are confirmed; if saving fails, it stays. The form also explains the username rules before you submit it.",
  "¿Cómo uso Agendar y las fotos con el teclado?":
    "How do I use Add to calendar and photos with the keyboard?",
  "En Agendar, las flechas abren y recorren las opciones; Inicio y Fin van a los extremos. Escape cierra y devuelve el foco al botón, y Tab continúa por la página. Las fotos ampliadas anuncian el reclamo al que pertenecen y se cierran con Escape.":
    "In Add to calendar, arrow keys open and move through the options; Home and End go to the first and last options. Escape closes the menu and returns focus to the button, while Tab continues through the page. Enlarged photos announce which claim they belong to and close with Escape.",
  "¿Dónde consulto una institución o pido acreditación?":
    "Where can I view an organization or request accreditation?",
  "En el directorio de tu comunidad, tocá el nombre de una institución para ver su perfil público. Solicitar acreditación institucional lleva directamente al formulario de solicitud.":
    "In your community's directory, select an organization's name to view its public profile. Request institutional accreditation goes directly to the application form.",
  "Lee sólo las notificaciones de la página visible, con sus filtros actuales, y se detiene al salir de Notificaciones. La lista aparece primero; las preferencias están al final, en “Elegir qué recibir”. Al editarlas se indican los cambios sin guardar y el éxito aparece después de confirmarlos. Marcar como leídas confirma cuántas se actualizaron y muestra un error si falla.":
    "It reads only the notifications on the visible page, with its current filters, and stops when you leave Notifications. The list comes first; preferences are at the end, under “Choose what to receive”. Editing them shows unsaved changes and success appears after confirmation. Marking as read confirms how many were updated and shows an error if it fails.",
  "¿Cómo funciona la búsqueda de miembros?": "How does member search work?",
  "En Miembros podés buscar por nombre público o usuario y filtrar perfiles con foto. La búsqueda abarca todas las páginas y conserva los filtros al avanzar. Sólo aparecen quienes eligieron mostrarse en esa comunidad; los perfiles anónimos siguen ocultos.":
    "In Members you can search by public name or username and filter profiles with photos. Search covers all pages and keeps filters as you move forward. Only people who chose to be visible in that community appear; anonymous profiles remain hidden.",
  "¿Dónde guardo, comparto o reporto una publicación?":
    "Where do I save, share or report a post?",
  "En encuestas, debates, reclamos y proyectos, Guardar en favoritos (☆) y Compartir están debajo del título. El reclamo se comparte desde su barra fija y desde Difundir este reclamo. Reportar está siempre al final de la publicación. Fuentes y contenido relacionado aparecen cuando hay algo cargado o cuando podés sumarlo.":
    "In polls, debates, claims and projects, Save to favorites (☆) and Share are below the title. A claim is shared from its fixed bar and from Share this claim. Report is always at the end of the post. Sources and related content appear when something has been added or when you can add it.",
  "¿Cómo sé si se guardó un favorito?": "How do I know a favorite was saved?",
  "La estrella cambia después de guardar en este dispositivo. Si el navegador no permite guardar o quitar el favorito, aparece un aviso junto al control y se conserva el estado anterior para que puedas reintentar. Los favoritos son locales y se eliminan al cerrar sesión.":
    "The star changes after saving on this device. If the browser cannot save or remove a favorite, a message appears beside the control and the previous state is preserved so you can retry. Favorites are local and are removed when you sign out.",
  "¿Qué lee “Escuchar resumen” en Notificaciones?":
    "What does “Listen to summary” read in Notifications?",
  "El resumen y su lectura en voz alta cuentan sólo los avisos de la página visible, con sus filtros actuales. Al marcar avisos como leídos, Agorbis confirma cuántos se actualizaron después de recibir la respuesta de la base; si falla, muestra un error.":
    "The summary and its spoken version count only notifications on the visible page, with its current filters. When marking notifications as read, Agorbis confirms how many were updated after receiving the database response; failures show an error.",
  "¿Puedo enviar publicaciones sin JavaScript?":
    "Can I submit posts without JavaScript?",
  "Si ya tenés una sesión, los formularios permiten enviar, revisar, volver a editar y confirmar publicaciones con formularios comunes. Los pasos aparecen juntos y se mantienen las validaciones y los permisos. Algunas ayudas, como guardar borradores automáticamente o agregar opciones dinámicas, necesitan JavaScript.":
    "If you already have a session, the forms let you submit, review, return to editing, and confirm posts with plain forms. Steps appear together and validation and permissions remain in place. Some helpers, such as automatic draft saving or adding options dynamically, need JavaScript.",
  "¿Cómo elijo qué publicar desde el teléfono?":
    "How do I choose what to publish from my phone?",
  "Tocá Publicar en la navegación inferior y elegí encuesta, debate, reclamo o proyecto. Se usa la comunidad que estás visitando o, fuera de ella, tu residencia. Si todavía no elegiste una comunidad, el selector te lleva a explorar.":
    "Tap Publish in the bottom navigation and choose a poll, debate, claim, or project. It uses the community you are visiting or, elsewhere, your residence. If you have not chosen a community yet, the selector takes you to explore.",
  "¿Dónde están el idioma, el tema y la búsqueda?":
    "Where are language, theme and search?",
  "Sin sesión, idioma y tema están en la barra superior; con sesión, en Preferencias, dentro del menú de tu cuenta. En el teléfono también aparecen en el menú ☰. El buscador de la barra superior encuentra comunidades y publicaciones, y desde sus resultados abrís la búsqueda completa con filtros.":
    "When signed out, language and theme are in the top bar; when signed in, they are under Preferences in your account menu. On a phone they also appear in the ☰ menu. The search box in the top bar finds communities and posts, and its results open the full search with filters.",
  "¿Cómo busco y uso los atajos?": "How do I search and use shortcuts?",
  "La búsqueda global necesita al menos 3 caracteres. En computadora, Ctrl+K o Cmd+K abre la paleta de comandos y / enfoca el buscador visible o abre la página de búsqueda. El atajo / no se activa mientras escribís en un formulario. Los atajos de una sola tecla (/, ?, H y E) se pueden apagar desde el panel de accesibilidad, al pie de la página.":
    "Global search needs at least 3 characters. On a computer, Ctrl+K or Cmd+K opens the command palette and / focuses the visible search field or opens the search page. The / shortcut does not activate while typing in a form. Single-key shortcuts (/, ?, H and E) can be turned off from the accessibility panel at the bottom of the page.",
  "¿Cómo leo los resultados de una encuesta?": "How do I read poll results?",
  "¿Puedo ver las opciones de una encuesta sin cuenta?":
    "Can I see a poll's options without an account?",
  "Sí. La pregunta y sus opciones se leen sin cuenta, desde otra residencia y también después de votar. Esa lista no muestra cantidades ni marca qué elegiste: los números salen con los resultados, al cierre. Para votar hacen falta una cuenta y vivir en ese territorio; en una encuesta de la Tierra alcanza con haber elegido dónde vivís.":
    "Yes. The question and its options can be read without an account, from another residence and also after voting. That list shows no counts and doesn't mark what you chose: the numbers come with the results, at closing. To vote you need an account and to live in that territory; in an Earth-wide poll, having chosen where you live is enough.",
  "Los resultados cerrados indican cuántas personas participaron y cuántos votos recibió cada opción. En encuestas de varias respuestas, una persona puede elegir más de una opción. Es una muestra de quienes participaron, no una medición de toda la comunidad.":
    "Closed results show how many people participated and how many votes each option received. In multiple-answer polls, a person can choose more than one option. This is a sample of participants, not a measure of the whole community.",
  "¿Cómo escribo un presupuesto con centavos?":
    "How do I enter a budget with cents?",
  "En español podés escribir 2.500,50; en inglés, 2,500.50. El formulario conserva lo escrito y muestra el importe interpretado antes de publicar. Si el formato no es válido, te pide corregirlo. El presupuesto sigue siendo opcional.":
    "In Spanish you can enter 2.500,50; in English, 2,500.50. The form preserves your input and shows the interpreted amount before publishing. Invalid formats prompt you to correct them. The budget remains optional.",
  "¿Se guardan mis borradores?": "Are my drafts saved?",
  "Los formularios guardan el texto y las opciones en este dispositivo mientras escribís y antes de cambiar de página. El indicador confirma si pudo guardarse; si falla, te avisa. Al volver se recupera el borrador de tu cuenta y comunidad, la barra del borrador lo dice y permite descartarlo. Las fotos que ya subiste en la revisión de un reclamo se conservan al volver a editar; sin JavaScript hay que seleccionarlas de nuevo. El borrador se elimina al publicar o cerrar sesión.":
    "Forms save the text and options on this device while you type and before you change page. The indicator confirms whether it could be saved; if it fails, it tells you. When you come back, the draft for your account and community is restored, the draft bar says so and lets you discard it. Photos you already uploaded while reviewing a claim are kept when you go back to editing; without JavaScript you have to select them again. The draft is deleted when you publish or sign out.",
  "¿Puedo volver a la publicación después de registrarme?":
    "Can I return to the post after signing up?",
  "Si empezaste el registro desde una publicación, Agorbis conserva ese destino durante la confirmación del correo, la aceptación de documentos y la elección de residencia para que puedas retomar lo que estabas haciendo.":
    "If you started signing up from a post, Agorbis preserves that destination through email confirmation, document acceptance, and residence selection so you can pick up where you left off.",
  "¿Dónde están las herramientas de mi comunidad?":
    "Where are my community tools?",
  "La barra de la comunidad muestra Info, Encuestas, Debates, Reclamos y Proyectos; Miembros, Sub-comunidades, Comparar y, si la comunidad tiene uno cargado, Presupuesto están en Más. Comparar reúne el contraste entre sus sub-comunidades y la comparación con comunidades del mismo nivel. Al final de la página, Más herramientas ofrece las victorias, las instituciones, los recursos para compartir y la guía de participación; en ciudades y barrios suma el mapa barrial y la rendición. Al abrir una herramienta, la navegación indica cuál estás consultando y permite pasar a las demás.":
    "The community bar shows Info, Polls, Debates, Claims and Projects; Members, Subcommunities, Compare and, when the community has one, Budget are under More. Compare brings together the contrast among its subcommunities and the comparison with communities at the same level. At the bottom of the page, More tools offers victories, organizations, sharing resources and the participation guide; cities and neighborhoods also get the neighborhood map and accountability. When you open a tool, navigation identifies the one you are viewing and lets you switch to the others.",
  "Manual de la comunidad": "Community guide",
  "Una guía clara para entender la idea, elegir tu comunidad y participar con información útil, desde tu ciudad hasta la Tierra.":
    "A clear guide to understanding the idea, choosing your community, and contributing useful information—from your city to Earth.",
  "Crear una cuenta": "Create an account",
  "Secciones del manual": "Guide sections",
  "La idea": "The idea",
  "Amor cívico": "Civic care",
  "Primeros pasos": "First steps",
  Herramientas: "Tools",
  Seguimiento: "Tracking",
  "Publicar bien": "Publish well",
  "Reglas y privacidad": "Rules and privacy",
  "Preguntas frecuentes": "Frequently asked questions",
  "La idea central": "The core idea",
  "Un lugar de participación para cada escala":
    "A place to participate at every scale",
  "Agorbis organiza la conversación pública con una estructura que ya conocemos: el lugar donde vivimos. Una persona pertenece a varias comunidades al mismo tiempo y cada problema encuentra la escala donde tiene sentido tratarlo.":
    "Agorbis organizes public conversation around a structure we already know: where we live. Each person belongs to several communities at once, and every issue can be addressed at the scale where it makes sense.",
  "Si vivís en Mar del Plata, por ejemplo, también formás parte de General Pueyrredón, Buenos Aires, Argentina, América del Sur y la Tierra. Podés participar en las seis sin crear grupos separados ni demostrar la misma residencia una y otra vez.":
    "If you live in Mar del Plata, for example, you also belong to General Pueyrredón, Buenos Aires, Argentina, South America, and Earth. You can participate in all six without creating separate groups or proving the same residence again and again.",
  "Ejemplo de pertenencia": "Membership example",
  "Cadena geográfica de Mar del Plata": "Geographic chain for Mar del Plata",
  "🌍 Tierra": "🌍 Earth",
  "🌎 América del Sur": "🌎 South America",
  "Las demás comunidades son públicas: podés explorarlas y seguirlas, aunque la participación queda reservada a quienes viven allí.":
    "All other communities are public: you can explore and follow them, although participation is reserved for the people who live there.",
  "El espíritu de Agorbis": "The spirit of Agorbis",
  "Amor cívico: cuidar lo que compartimos":
    "Civic care: caring for what we share",
  "Amor cívico es sentir que la comunidad también es tuya: que el bienestar de personas que quizá no conocés importa y que podés aportar, aunque sea de manera pequeña, a construirla.":
    "Civic care means feeling that the community is yours too: that the well-being of people you may not know matters, and that you can help build it, even in a small way.",
  "No es obedecer a un gobierno ni pensar que tu país siempre tiene razón. Informarse, pedir explicaciones, señalar un problema o proponer una mejora también pueden ser formas de compromiso con lo común.":
    "It does not mean obeying a government or believing your country is always right. Getting informed, asking for answers, pointing out a problem, or proposing an improvement can also be ways to commit to what we share.",
  "Tampoco exige pensar igual. En una comunidad democrática, podés creer que una solución está equivocada sin convertir a quien la propone en un enemigo. Agorbis busca ampliar el “nosotros” y hacer lugar para desacuerdos honestos, con contexto, respeto y ganas de mejorar.":
    "It does not require everyone to think alike either. In a democratic community, you can believe a solution is wrong without turning the person proposing it into an enemy. Agorbis aims to broaden “us” and make room for honest disagreements, with context, respect, and a desire to improve.",
  "Lo común también es un poco tuyo: participar es una forma de cuidarlo.":
    "What we share is partly yours too: taking part is a way to care for it.",
  "Empezar lleva pocos minutos": "Getting started takes only a few minutes",
  "Tus primeros pasos": "Your first steps",
  "Creá tu cuenta": "Create your account",
  "Son cinco pasos cortos: escribí tu correo y una contraseña, confirmá el correo desde el enlace, aceptá los acuerdos con dos casillas (los marcás al registrarte y, ya con el correo confirmado, una vez más para que queden registrados con tu sesión), elegí tu nombre y después tu comunidad. El nombre de usuario se completa solo y podés cambiarlo. Tu correo se usa para ingresar y no se muestra en ningún lado.":
    "Five short steps: enter your email and a password, confirm the email from the link, accept the agreements with two checkboxes (you tick them when signing up and, once your email is confirmed, once more so they are recorded with your session), choose your name and then your community. The username fills in by itself and you can change it. Your email is used to sign in and is never shown.",
  "Indicá dónde vivís": "Say where you live",
  "Buscá tu ciudad o municipio y revisá la cadena geográfica completa antes de confirmar.":
    "Find your city or municipality and review the full geographic chain before confirming.",
  "Entrá a tus comunidades": "Enter your communities",
  Participá: "Take part",
  "Votá, debatí, apoyá reclamos o comprometé recursos con proyectos que te importan.":
    "Vote, debate, support claims, or pledge resources to projects you care about.",
  "Cinco formas de participar": "Five ways to participate",
  "Elegí la herramienta según lo que querés lograr":
    "Choose the right tool for what you want to achieve",
  "Medir prioridades y tomar el pulso de una comunidad.":
    "Measure priorities and take a community's pulse.",
  "Pueden permitir una o varias respuestas. Tu cuenta guarda sólo una constancia de participación sin elección y tu elección se suma al total de cada opción, sin guardarse como un voto individual. No se puede recuperar ni cambiar. Los resultados se publican al cierre sólo si participaron al menos 5 personas.":
    "Polls may allow one or several answers. Your account stores only a participation record without the choice, and your choice is added to each option's total and is not stored as an individual ballot. It cannot be retrieved or changed. Results are published after closing only if at least 5 people participated.",
  "Comparar argumentos sin mezclar territorios ni perder contexto.":
    "Compare arguments without mixing territories or losing context.",
  "Los comentarios se agrupan por las comunidades hijas del nivel debatido. En un debate de Argentina, por ejemplo, cada provincia tiene su columna: escribís en la propia y podés leer las demás.":
    "Comments are grouped by the child communities of the level being discussed. In an Argentina debate, for example, each province has a column: you write in your own and can read the others.",
  "Hacer visible un problema concreto y reunir a quienes también afecta.":
    "Make a specific problem visible and bring together the people it also affects.",
  "Un reclamo debe describir qué pasa, dónde y qué respuesta verificable se espera. Se puede sumar evidencia visual y apoyo comunitario. Agorbis le da visibilidad, pero no reemplaza una denuncia ni garantiza su resolución.":
    "A claim should describe what is happening, where, and what verifiable response is expected. Visual evidence and community support can be added. Agorbis provides visibility, but it does not replace an official report or guarantee resolution.",
  "Pasar de una idea a un plan con recursos, etapas y compromisos.":
    "Turn an idea into a plan with resources, stages, and commitments.",
  "Cada propuesta explica el objetivo, el plan, el tiempo y los recursos necesarios. Otras personas pueden comprometer dinero, materiales, tiempo o habilidades. Son compromisos públicos: nadie transfiere dinero a través de Agorbis.":
    "Each proposal explains its goal, plan, timing and the resources it needs. Other people can pledge money, materials, time or skills. These are public pledges: nobody transfers money through Agorbis.",
  "Del tema a los resultados": "From an issue to results",
  "La participación no termina al publicar":
    "Participation doesn't end when you publish",
  "Inicio personalizado": "Personalized home",
  "Búsqueda global": "Global search",
  "Encontrá comunidades, publicaciones e instituciones y acotá los resultados por tipo, estado o territorio.":
    "Find communities, posts, and organizations, then narrow results by type, status, or territory.",
  "Notificaciones útiles": "Useful notifications",
  "Te avisa respuestas, cierres de encuestas, cambios en reclamos y avances de proyectos a los que te sumaste.":
    "Alerts you to replies, poll closures, changes to claims, and progress on projects you've joined.",
  "Fuentes visibles": "Visible sources",
  "Cada publicación puede mostrar enlaces, documentos, organismo publicador y fecha de verificación.":
    "Each post can show links, documents, the publishing organization, and its verification date.",
  "Respuesta institucional": "Institutional response",
  "Municipios y organizaciones verificadas responden con identidad pública y conservan un historial consultable.":
    "Verified municipalities and organizations respond under a public identity and keep a reviewable history.",
  Trazabilidad: "Traceability",
  "Los reclamos tienen línea de tiempo, evidencia, responsable y estado; los proyectos suman hitos, tareas y aportes concretos.":
    "Claims have a timeline, evidence, a responsible party, and a status; projects add milestones, tasks, and concrete contributions.",
  "Contenido conectado": "Connected content",
  "Una encuesta puede originar un debate y un reclamo puede convertirse en proyecto sin perder el contexto original.":
    "A poll can lead to a debate, and a claim can become a project without losing its original context.",
  "¿Tu localidad todavía no aparece?": "Is your locality still missing?",
  "Podés solicitarla con su comunidad superior y una fuente oficial. Al aprobarla, el sistema crea automáticamente su nivel, dirección pública y lugar correcto dentro de la jerarquía.":
    "You can request it with its parent community and an official source. Once approved, the system automatically creates its level, public address, and correct place in the hierarchy.",
  "Imprimir y compartir": "Print and share",
  "Fuera de la pantalla": "Beyond the screen",
  "Imprimir, compartir y seguir resultados": "Print, share, and follow results",
  "Estas herramientas usan sólo lo que ya está publicado en Agorbis. Ayudan a difundir un tema y a ver cómo avanza, pero no hacen trámites por vos.":
    "These tools only use what is already published on Agorbis. They help you spread the word about an issue and see how it progresses, but they do not file anything on your behalf.",
  "Imprimibles de un reclamo": "Printables for a claim",
  "En cada reclamo, “Difundir este reclamo” reúne las formas de compartirlo y los imprimibles: un afiche, un dossier, una nota formal para presentar en mesa de entradas y una planilla de firmas. Se imprimen o se guardan como PDF desde el navegador, con un código QR que lleva al reclamo. Agorbis no presenta la nota por vos ni recibe una copia.":
    "On every claim, “Share this claim” gathers the ways to share it and the printables: a poster, a press dossier, a formal letter to file at the front desk and a signature sheet. They print or save as PDF from the browser, with a QR code that leads to the claim. Agorbis doesn't file the letter for you or receive a copy.",
  "Planilla de firmas en papel": "Paper signature sheet",
  "Pide sólo nombre, cuadra aproximada (opcional) y firma. Sirve para presentar en papel: las firmas de la planilla no se suman a los apoyos de la app. No la fotografíes ni la subas al reclamo, porque tiene datos de otras personas.":
    "It asks only for a name, an approximate block (optional), and a signature. It is meant for presenting on paper: signatures on the sheet are not added to the app's supports. Do not photograph it or upload it to the claim, because it contains other people's data.",
  "Los botones de compartir abren el menú de tu teléfono, WhatsApp o Telegram con un mensaje que ves antes de enviarlo. No se carga nada de esos servicios hasta que tocás el botón.":
    "Share buttons open your phone's share menu, WhatsApp, or Telegram with a message you see before sending it. Nothing from those services loads until you tap the button.",
  "Victorias, rendición y comparativa":
    "Victories, accountability, and comparison",
  "Cada comunidad muestra sus reclamos resueltos y proyectos completados, cuántos reclamos hay por categoría y cuántos figuran como resueltos, y una comparación con hasta seis comunidades del mismo nivel. Los números salen de los estados cargados en Agorbis: no son estadísticas oficiales ni una auditoría de ningún gobierno.":
    "Each community shows its resolved claims and completed projects, how many claims there are per category and how many are marked as resolved, and a comparison with up to six communities at the same level. The numbers come from the statuses recorded on Agorbis: they are not official statistics or an audit of any government.",
  "Mapa de reclamos": "Claims map",
  "Un esquema propio con los reclamos que tienen ubicación, redondeada a una cuadrícula de unos 110 metros. Abrir OpenStreetMap es opcional y te lleva a un sitio externo.":
    "Our own diagram of the claims that have a location, rounded to a grid of about 110 meters. Opening OpenStreetMap is optional and takes you to an external site.",
  "Datos abiertos y RSS": "Open data and RSS",
  "Cada comunidad publica feed.xml (RSS con los 25 reclamos más recientes) y datos.json (GeoJSON con hasta 100 reclamos con ubicación). Incluyen título, estado, fecha y un extracto de hasta 280 caracteres, nunca el autor. Pueden tardar hasta media hora en reflejar cambios y las copias que otros ya descargaron no se actualizan. Todavía no tienen una licencia de reutilización: citá la fuente y consultá los Términos.":
    "Each community publishes feed.xml (RSS with the 25 most recent claims) and datos.json (GeoJSON with up to 100 claims that have a location). They include the title, status, date, and an excerpt of up to 280 characters, never the author. They may take up to half an hour to reflect changes, and copies others have already downloaded are not updated. They do not have a reuse license yet: cite the source and check the Terms.",
  "Antes de publicar": "Before publishing",
  "Una buena publicación ayuda a actuar": "A good post helps people act",
  "Tiene el alcance correcto": "It has the right scope",
  "Una luminaria rota corresponde a la ciudad; una política ferroviaria puede discutirse a nivel provincial o nacional.":
    "A broken streetlight belongs at the city level; rail policy may belong at the provincial or national level.",
  "Separa hechos de opiniones": "It separates facts from opinions",
  "Incluí fechas, lugares y fuentes cuando existan. Si algo es una propuesta o percepción, presentalo como tal.":
    "Include dates, places, and sources when available. If something is a proposal or perception, present it as such.",
  "Pide una acción verificable": "It asks for verifiable action",
  "“Publicar las frecuencias reales cada mes” permite evaluar una respuesta; “que todo mejore” no.":
    "“Publish actual service frequencies every month” makes a response measurable; “make everything better” does not.",
  "Protege a las personas": "It protects people",
  "No publiques domicilios, teléfonos, documentos, datos médicos ni acusaciones personales sin sustento.":
    "Do not publish home addresses, phone numbers, IDs, medical data, or unsupported personal accusations.",
  "Confianza y convivencia": "Trust and coexistence",
  "Reglas simples, aplicadas desde el diseño":
    "Simple rules enforced by design",
  "Privacidad elegible": "Privacy you control",
  "El correo es privado, las elecciones sólo se conservan como contadores agregados y la membresía permanece anónima hasta que elijas mostrarte.":
    "Email is private, choices are retained only as aggregate counters, and membership stays anonymous until you choose to appear.",
  "Cuotas de publicación": "Publishing quotas",
  "El cupo mensual evita saturación y spam. Publicar a escala global cuesta más que hacerlo en una ciudad; participar en contenido existente no tiene cupo.":
    "The monthly quota prevents overload and spam. Publishing globally costs more than publishing in a city; interacting with existing content has no quota.",
  "Moderación trazable": "Traceable moderation",
  "Podés reportar contenido. Moderación puede ocultar publicaciones que incumplen las reglas sin borrar el historial de participación legítima.":
    "You can report content. Moderation can hide posts that break the rules without erasing the history of legitimate participation.",
  "Lo importante antes de participar": "What matters before participating",
  "¿Puedo participar en cualquier comunidad?":
    "Can I participate in any community?",
  "Podés leer y seguir cualquier comunidad. Para votar, comentar o publicar, tenés que ser residente de ese territorio: vivir en una ciudad te habilita también sus niveles superiores.":
    "You can read and follow any community. To vote, comment, or publish, you must be a resident of that territory: living in a city also includes you in its higher levels.",
  "¿Por qué hay una cuota para publicar?": "Why is there a publishing quota?",
  "Para cuidar la atención de la comunidad y reducir spam. El cupo se renueva cada mes y es más limitado cuanto mayor es el alcance geográfico. Votar, comentar, apoyar y comprometer aportes no consumen ese cupo.":
    "To protect community attention and reduce spam. The quota renews monthly and becomes more limited as geographic reach grows. Voting, commenting, supporting, and pledging do not use this quota.",
  "¿Puedo cambiar mi residencia?": "Can I change my residence?",
  "Sí. Después de elegir o cambiar tu residencia hay un período de 30 días antes del próximo cambio. Desde Perfil siempre podés revisar tu residencia. Si fue una elección reciente y todavía no participaste desde ella, Agorbis puede permitir corregirla durante 24 horas sin reiniciar la fecha original; la pantalla indica si está disponible.":
    "Yes. After choosing or changing your residence, there is a 30-day waiting period before the next change. Your profile always lets you review your residence. If the choice was recent and you have not participated from it, Agorbis may allow a correction within 24 hours without resetting the original date; the page shows whether this is available.",
  "¿Puedo declarar más de una residencia?":
    "Can I declare more than one residence?",
  "No: declarás una sola residencia principal, idealmente tu ciudad o municipio habitual. Esa elección te incorpora automáticamente a toda su cadena territorial. Podés seguir cualquier otra comunidad para recibir novedades, pero sin votar ni comentar allí.":
    "No. You declare one primary residence, ideally your usual city or municipality. That choice automatically includes you in its entire territorial chain. You can follow any other community for updates, but cannot vote or comment there.",
  "¿Mi identidad queda expuesta?": "Is my identity exposed?",
  "Tu correo nunca es público. Tu membresía es anónima salvo que elijas mostrarte, permiso que podés revocar. El voto no se guarda como un registro individual con tu elección; tus publicaciones y comentarios sí muestran tu perfil.":
    "Your email is never public. Membership is anonymous unless you choose to appear, and you can revoke that permission. A vote is not stored as an individual record with your choice; your posts and comments do show your profile.",
  "¿Agorbis representa al gobierno?": "Does Agorbis represent the government?",
  "No. Es una plataforma cívica independiente para organizar participación territorial. Un reclamo publicado no equivale a un trámite oficial y un resultado de encuesta no es vinculante por sí solo.":
    "No. It is an independent civic platform for organizing territorial participation. A published claim is not an official filing, and a poll result is not binding by itself.",
  "La mejor forma de entenderlo es probarlo":
    "The best way to understand it is to try it",
  "Explorá una comunidad, mirá qué temas se están tratando y sumate cuando encuentres tu lugar.":
    "Explore a community, see which issues people are discussing, and join when you find your place.",
  "Volver al inicio": "Back to home",
  // Menú lateral, buscador y preguntas reorganizadas del manual
  "Cómo funciona Agorbis": "How Agorbis works",
  "Ir a mi inicio": "Go to my home",
  "En este manual": "In this manual",
  "Cada pantalla, en detalle": "Each screen, in detail",
  "El detalle, por tema": "The details, by topic",
  "Respuestas puntuales sobre cada parte de Agorbis, agrupadas por tema. Usá el buscador o el menú para llegar a la tuya.":
    "Specific answers about each part of Agorbis, grouped by topic. Use the search or the menu to reach yours.",
  "Buscar en las preguntas": "Search the questions",
  "Por ejemplo: residencia, borrador, resultados":
    "For example: residence, draft, results",
  "Una respuesta para “{{query}}”": "One answer for “{{query}}”",
  "{{count}} respuestas para “{{query}}”": "{{count}} answers for “{{query}}”",
  "No encontramos respuestas para “{{query}}”. Probá con otra palabra o recorré los temas del menú.":
    "We found no answers for “{{query}}”. Try another word or browse the topics in the menu.",
  "Abrir todas las respuestas": "Open all answers",
  "Cerrar todas las respuestas": "Close all answers",
  "Enlace a esta respuesta": "Link to this answer",
  "Manual de Agorbis: qué es, cómo elegir tu comunidad y cómo participar con encuestas, debates, reclamos, proyectos y acuerdos. {{description}}":
    "Agorbis manual: what it is, how to choose your community, and how to take part with polls, debates, claims, projects and agreements. {{description}}",
  "Escribí tu correo y una contraseña, confirmá el correo desde el enlace que te mandamos y aceptá los documentos legales. Tu correo se usa para ingresar y no se muestra en ningún lado.":
    "Enter your email and a password, confirm the email from the link we send you and accept the legal documents. Your email is used to sign in and is not shown anywhere.",
  "Vas a ser miembro, al mismo tiempo, de tu localidad y de todas las comunidades que la contienen, hasta la Tierra.":
    "You will be a member, at the same time, of your town and of every community that contains it, all the way up to Earth.",
  "Reúne en un único feed las novedades de todas tus comunidades, desde tu localidad hasta la Tierra. Podés filtrar por comunidad y por tipo, incluidos los acuerdos, y las encuestas que ya votaste y los reclamos que apoyaste llevan su marca.":
    "Brings the news from all your communities, from your town up to Earth, into a single feed. You can filter by community and by type, agreements included, and the polls you already voted in and the claims you supported carry a mark.",
  "¿Cómo cambio o quito mi foto de perfil?":
    "How do I change or remove my profile photo?",
  "¿Cómo es el registro, paso a paso?": "What is sign-up like, step by step?",
  "¿Qué pasa si suspenden mi cuenta y cómo apelo?":
    "What happens if my account is suspended, and how do I appeal?",
  "Una suspensión impide nuevas acciones de participación, pero conservás el acceso necesario para exportar tus datos, apelar o borrar la cuenta. En tu perfil, Suspensiones y apelaciones permite consultar la medida y pedir una revisión. Apelar no elimina el registro ni garantiza que la medida se cambie.":
    "A suspension blocks new participation, but you keep the access needed to export your data, appeal or delete the account. In your profile, Suspensions and appeals lets you look up the measure and request a review. Appealing does not remove the record or guarantee that the measure will change.",
  "¿Cómo borro mi cuenta y mis datos?":
    "How do I delete my account and my data?",
  "Desde tu perfil, con la opción de borrar tu cuenta; si querés conservar una copia, descargá tus datos antes. Si no podés ingresar, podés pedir el borrado por correo. La página Eliminar tu cuenta y tus datos explica los dos caminos, qué se elimina y qué puede permanecer publicado.":
    "From your profile, with the option to delete your account; if you want to keep a copy, download your data first. If you cannot sign in, you can request deletion by email. The Delete your account and your data page explains both paths, what is deleted and what may remain published.",
  "¿Qué es la seguridad en dos pasos y tengo que activarla?":
    "What is two-step security, and do I have to turn it on?",
  "Para tu cuenta es opcional; los roles de moderación sí la exigen. Se activa desde tu perfil, en Seguridad en dos pasos, con una aplicación autenticadora que genera códigos temporales. Guardá el secreto en un lugar seguro: desde esa pantalla no se puede eliminar un factor ya verificado y, si perdés todos tus autenticadores, soporte tiene que validar tu identidad para recuperarlo.":
    "It is optional for your account; moderation roles do require it. You turn it on from your profile, under Two-step security, with an authenticator app that generates temporary codes. Keep the secret somewhere safe: a verified factor cannot be removed from that screen and, if you lose all your authenticators, support has to validate your identity to recover it.",
  "Cuenta, perfil y seguridad": "Account, profile and security",
  "Comunidades y residencia": "Communities and residence",
  "Inicio, búsqueda y navegación": "Home, search and navigation",
  "Publicar y borradores": "Publishing and drafts",
  "Encuestas y acuerdos": "Polls and agreements",
  "Reclamos y mapa": "Claims and map",
  "Proyectos y presupuestos": "Projects and budgets",
  "Compartir e imprimir": "Sharing and printing",
  "Instituciones y moderación": "Institutions and moderation",
  "Accesibilidad y teclado": "Accessibility and keyboard",
  "Si tu navegador no ejecuta JavaScript":
    "If your browser does not run JavaScript",
};
