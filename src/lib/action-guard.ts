/**
 * Guardián de los envíos de formulario: ningún envío queda mudo.
 *
 * Rodeo a dos fallas de `@qwik.dev/router` 2.0.0-beta.40 (D75 lo revisa en
 * cada actualización, D114 lo decide):
 *
 * 1. `submitAction` hace el `fetch` sin `try/catch` y, si la respuesta no trae
 *    `content-type` JSON, devuelve `undefined`. En los dos casos la promesa de
 *    la acción no se resuelve nunca: el botón queda apagado, el velo tapando
 *    la pantalla y nadie se entera de nada. Acá `window.fetch` se envuelve
 *    sólo para los POST con `qaction=` y convierte esos casos, más un JSON
 *    inválido o un 5xx sin `result` (una acción que lanzó), en un resultado de
 *    acción con el formato que el router deserializa. El mensaje nunca afirma
 *    que no se guardó: el POST pudo haber llegado (D74).
 * 2. `Form` no evita un segundo `submit` mientras el primero está en vuelo si
 *    recibe un solo `onSubmit$`, e `isRunning` recién apaga el botón cuando
 *    Qwik vuelve a pintar (y ese pintado puede esperar una descarga). Un
 *    segundo toque rápido mandaba otro POST y podía duplicar un reclamo. Acá
 *    un oyente de `submit` en captura sobre `window` (corre antes que el del
 *    cargador de Qwik, que está en `document`) marca el formulario como
 *    pendiente y frena cualquier otro envío. Sólo toca formularios con
 *    `method="post"` y `action` con `qaction=`: los que el router envía con
 *    `fetch`. `preventdefault:submit` no sirve como criterio porque Qwik 2 no
 *    lo deja como atributo en el HTML.
 *
 * La marca se libera cuando el router despacha `submitcompleted`, cuando el
 * `fetch` envuelto de esa misma acción se asienta (cubre `submit(FormData)`,
 * que no despacha el evento, y cualquier error del router al leer la
 * respuesta) y al volver desde la caché del navegador. Un formulario propio
 * que decide no enviar después de marcarse (validación local) la quita él
 * mismo con `ACTION_PENDING_ATTRIBUTE`.
 *
 * Va inline en el `<head>` con nonce, como el tema: tiene que estar antes del
 * primer envío y no vale la pena una descarga para quedarse escuchando. Son
 * literales fijos, sin nada que venga de la persona. Deja
 * `data-action-guard="on"` en `<html>` para que un E2E compruebe que corrió;
 * si algo falla al instalarse queda `"failed"`, sin tragárselo en silencio.
 */

/** Texto fuente en español; las pantallas lo pasan por `translate()`. */
export const UNDELIVERED_NETWORK_MESSAGE =
  "Se cortó la conexión mientras se enviaba y no sabemos si llegó. Lo que escribiste sigue acá. Antes de volver a intentar, revisá si el cambio ya se aplicó.";

export const UNDELIVERED_SERVER_MESSAGE =
  "El servidor respondió algo inesperado y no sabemos si el envío se aplicó. Lo que escribiste sigue acá. Antes de volver a intentar, revisá si el cambio ya se aplicó.";

/** Atributo con el que el script marca un formulario cuyo envío sigue en vuelo. */
export const ACTION_PENDING_ATTRIBUTE = "data-action-pending";

/** Atributo de `<html>`: `on` si el guardián se instaló, `failed` si no. */
export const ACTION_GUARD_STATE_ATTRIBUTE = "data-action-guard";

/**
 * Lo que el router espera leer con `_deserialize`: `[tipo, valor, …]`, donde
 * 5 es objeto, 0 un valor plano y `3,2` la constante `true`. Es el formato
 * interno de Qwik: el spec lo pasa por `_deserialize` para que una
 * actualización del beta falle ahí y no en Producción.
 */
export function undeliveredResultWire(message: string): unknown[] {
  return [
    5,
    [
      0,
      "result",
      5,
      [0, "failed", 3, 2, 0, "undelivered", 3, 2, 0, "message", 0, message],
    ],
  ];
}

const MESSAGE_SLOT = "\u0000mensaje\u0000";
const WIRE_TEMPLATE = JSON.stringify(
  undeliveredResultWire(MESSAGE_SLOT),
).replace(JSON.stringify(MESSAGE_SLOT), "m");

export const ACTION_GUARD_BOOTSTRAP = [
  "(function(){try{",
  `var P=${JSON.stringify(ACTION_PENDING_ATTRIBUTE)};`,
  `var NET=${JSON.stringify(UNDELIVERED_NETWORK_MESSAGE)};`,
  `var SRV=${JSON.stringify(UNDELIVERED_SERVER_MESSAGE)};`,
  // Respuesta sintética. Sólo códigos de error con cuerpo: los 2xx no tienen
  // sentido acá y `new Response` lanza con 204 y 205.
  "var fail=function(m,s){",
  `var w=${WIRE_TEMPLATE};`,
  "return new Response(JSON.stringify(w),{status:(s>=400&&s<=599)?s:503,headers:{'content-type':'application/json; charset=utf-8'}});",
  "};",
  "var actionId=function(u){var i=u.indexOf('qaction=');if(i<0)return '';return u.slice(i+8).split('&')[0];};",
  // Libera los formularios de esa acción (o todos, con id vacío).
  "var release=function(id){",
  "var l=document.querySelectorAll('form['+P+']');",
  "for(var i=0;i<l.length;i++){if(!id||actionId(l[i].getAttribute('action')||'')===id)l[i].removeAttribute(P);}",
  "};",
  // Primero el fetch: si algo de abajo fallara, al menos nada queda colgado.
  "var of=window.fetch;",
  "if(typeof of==='function'){",
  "window.fetch=function(input,init){",
  "var url=typeof input==='string'?input:(input&&typeof input.url==='string'?input.url:'');",
  "var method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();",
  "if(method!=='POST'||url.indexOf('qaction=')<0)return of.apply(window,arguments);",
  "var id=actionId(url);",
  "return of.apply(window,arguments).then(function(r){",
  "if(r.redirected)return r;",
  "if((r.headers.get('content-type')||'').indexOf('json')<0)return fail(SRV,r.status);",
  // JSON: se lee entero para que un cuerpo cortado o un sobre de error del
  // servidor (sin `result`) no dejen la acción muda otra vez.
  "return r.text().then(function(t){",
  "try{JSON.parse(t);}catch(e){return fail(SRV,r.status);}",
  "if(r.status>=500&&t.indexOf('\"result\"')<0)return fail(SRV,r.status);",
  "return new Response(t,{status:r.status,statusText:r.statusText,headers:r.headers});",
  "},function(){return fail(SRV,r.status);});",
  "},function(){return fail(NET,503);}).then(function(r){release(id);return r;},function(e){release(id);throw e;});",
  "};",
  "}",
  "window.addEventListener('submit',function(ev){",
  "var f=ev.target;",
  "if(!f||typeof f.getAttribute!=='function')return;",
  "if(String(f.getAttribute('method')||'').toLowerCase()!=='post'||!actionId(f.getAttribute('action')||''))return;",
  "if(f.hasAttribute(P)){ev.preventDefault();ev.stopImmediatePropagation();return;}",
  "f.setAttribute(P,'');",
  "f.addEventListener('submitcompleted',function h(){f.removeEventListener('submitcompleted',h);f.removeAttribute(P);});",
  "},true);",
  "window.addEventListener('pageshow',function(){release('');});",
  `document.documentElement.setAttribute(${JSON.stringify(ACTION_GUARD_STATE_ATTRIBUTE)},'on');`,
  `}catch(e){try{document.documentElement.setAttribute(${JSON.stringify(ACTION_GUARD_STATE_ATTRIBUTE)},'failed');}catch(_){}}})();`,
].join("");
