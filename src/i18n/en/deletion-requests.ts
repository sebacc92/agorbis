import type { Messages } from "../types";

export const enDeletionRequests: Messages = {
  "Seleccioná una opción": "Select an option",
  Filtrar: "Filter",
  Recibida: "Received",
  "Verificando identidad": "Verifying identity",
  Resuelta: "Resolved",
  "Gestión solicitada atendida": "Requested action addressed",
  "Gestión atendida con limitaciones": "Request addressed with limitations",
  "No se pudo verificar la identidad": "Identity could not be verified",
  "Solicitud fuera del alcance de este trámite":
    "Request outside the scope of this process",
  "Solicitud retirada por la persona": "Request withdrawn by the requester",
  "No pudimos consultar el recibo. Revisá la referencia y el código, o probá más tarde. Si necesitás ayuda, respondé al correo de privacidad.":
    "We could not retrieve the receipt. Check the reference and code, or try again later. If you need help, reply to the privacy email thread.",
  "El seguimiento de solicitudes de eliminación está reservado a administradores con una sesión verificada.":
    "Deletion request tracking is restricted to administrators with a verified session.",
  "No pudimos guardar el cambio. Recargá la lista y revisá el estado, la verificación y la respuesta de cierre.":
    "We could not save the change. Reload the list and check the status, identity verification, and closing response.",
  "Seguimiento de una solicitud por correo": "Track an email request",
  "Una solicitud registrada tiene una referencia y un código privado para consultar su estado sin ingresar. Si todavía no los recibiste, pedilos respondiendo al mismo hilo de correo.":
    "A registered request has a reference and a private code to check its status without signing in. If you have not received them yet, ask for them by replying to the same email thread.",
  "El recibo no muestra datos de la cuenta. El cierre de la gestión manual no garantiza por sí solo un borrado completo; el alcance se comunica en la respuesta por correo.":
    "The receipt does not show account details. Closing the manual process does not by itself guarantee complete deletion; the email response explains its scope.",
  "Consultar recibo": "Check receipt",
  "Consultar una solicitud de eliminación": "Check a deletion request",
  "Ingresá la referencia y el código que recibiste en el hilo de correo. Este recibo no muestra datos de una cuenta ni documentos de identidad.":
    "Enter the reference and code you received in the email thread. This receipt does not show account details or identity documents.",
  "Referencia de solicitud": "Request reference",
  "Código privado de consulta": "Private access code",
  "No compartas el código ni lo agregues a un enlace. Si venció o lo perdiste, pedí uno nuevo respondiendo al mismo hilo de correo.":
    "Do not share the code or add it to a link. If it has expired or you lost it, request a new one by replying to the same email thread.",
  "Última actualización": "Last updated",
  "Motivo de cierre": "Reason for closure",
  "Resuelta o rechazada indica que se cerró la gestión manual y se registró una respuesta por correo. No acredita por sí solo el borrado completo de la cuenta, publicaciones ni copias de proveedores. Consultá el alcance en esa respuesta.":
    "Resolved or rejected means the manual process was closed and an email response was recorded. It does not by itself confirm complete deletion of the account, posts, or provider copies. See that response for the scope.",
  "Solicitudes de eliminación": "Deletion requests",
  "Solicitudes de eliminación por correo": "Email deletion requests",
  "Registro privado para administradores. Documentá el trámite recibido por correo; la eliminación de cuentas sigue su procedimiento existente.":
    "Private registry for administrators. Record the request received by email; account deletion continues through its existing procedure.",
  "Cuenta completa": "Entire account",
  "Datos concretos": "Specific data",
  "Identidad verificada": "Identity verified",
  "Próximo estado": "Next status",
  "Método de verificación": "Verification method",
  "Control del correo de la cuenta comprobado":
    "Control of the account email verified",
  "Verificación alternativa acordada": "Agreed alternative verification",
  "Constancia mínima de verificación": "Minimal verification record",
  "Registrá sólo el método y la comprobación realizada. No pegues documentos, códigos, tokens ni el cuerpo del correo. Recibir un mensaje no verifica por sí solo la identidad.":
    "Record only the method and the check performed. Do not paste documents, codes, tokens, or the email body. Receiving a message does not by itself verify identity.",
  "Respuesta base para el hilo existente":
    "Response template for the existing email thread",
  "La gestión manual se cierra con el alcance comunicado en este hilo. Este cierre no acredita una eliminación completa de publicaciones, datos derivados ni copias de proveedores. Podés responder a este correo si necesitás aclaraciones.":
    "The manual process is being closed with the scope described in this thread. Closure does not confirm complete deletion of posts, derived data, or provider copies. You can reply to this email if you need clarification.",
  "Completá el alcance y las limitaciones reales en el correo, envialo desde el hilo existente y después registrá el cierre. Este formulario no envía mensajes ni borra cuentas.":
    "Add the actual scope and limitations to the email, send it in the existing thread, then record the closure. This form does not send messages or delete accounts.",
  "Envié la respuesta de cierre al destinatario verificado o la respuesta sin datos de cuenta cuando no se pudo verificar.":
    "I sent the closing response to the verified recipient, or a response without account details when verification was not possible.",
  "Al cerrar se retiran de este registro el contacto, la referencia del hilo y la nota de verificación. Se conservan la referencia de solicitud, el método, los estados y las fechas.":
    "Closing removes the contact details, thread reference, and verification note from this registry. The request reference, method, statuses, and dates are retained.",
  "Guardar estado": "Save status",
  "Estado guardado": "Status saved",
  "Reemitir código de consulta": "Reissue access code",
  "Invalida el código anterior. Entregá el nuevo sólo a la persona solicitante en el hilo verificado.":
    "Invalidates the previous code. Give the new code only to the requester in the verified email thread.",
  "Recibo para copiar al hilo de correo":
    "Receipt to copy into the email thread",
  "El código se muestra sólo al emitirlo. No queda disponible en la lista ni se envía automáticamente.":
    "The code is shown only when issued. It is not available in the list and is not sent automatically.",
  "Vencimiento del código": "Code expiry",
  "El vencimiento del código no es un plazo de resolución. Podés pedir otro código respondiendo a este correo. No lo compartas ni lo agregues a un enlace.":
    "The code expiry is not a resolution deadline. You can request another code by replying to this email. Do not share it or add it to a link.",
  "Registrar solicitud recibida": "Register a received request",
  "Correo de contacto del hilo": "Contact email from the thread",
  "Referencia interna del hilo": "Internal thread reference",
  "Usá una referencia que permita encontrar el mensaje en el buzón. No copies su contenido ni adjuntos.":
    "Use a reference that helps you find the message in the mailbox. Do not copy its contents or attachments.",
  "Alcance solicitado": "Requested scope",
  "Registrar y emitir recibo": "Register and issue receipt",
  "Mostrar solicitudes": "Show requests",
  Resueltas: "Resolved",
  Rechazadas: "Rejected",
  "No hay solicitudes en esta vista": "No requests in this view",
  "Páginas de solicitudes": "Request pages",
};
