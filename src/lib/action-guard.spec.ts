import { _deserialize } from "@qwik.dev/core/internal";
import { describe, expect, it, vi } from "vitest";
import {
  ACTION_GUARD_BOOTSTRAP,
  ACTION_GUARD_STATE_ATTRIBUTE,
  ACTION_PENDING_ATTRIBUTE,
  UNDELIVERED_NETWORK_MESSAGE,
  UNDELIVERED_SERVER_MESSAGE,
  undeliveredResultWire,
} from "./action-guard";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  target: unknown;
  defaultPrevented: boolean;
  stopped: boolean;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

/** Un formulario de mentira: sólo atributos y oyentes, que es lo que usa el script. */
function fakeForm(
  attributes: Record<string, string> = {
    method: "post",
    action: "?qaction=abc123",
  },
) {
  const attrs = new Map(Object.entries(attributes));
  const listeners = new Map<string, Set<Listener>>();
  return {
    hasAttribute: (name: string) => attrs.has(name),
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
    addEventListener: (name: string, fn: Listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener: (name: string, fn: Listener) =>
      void listeners.get(name)?.delete(fn),
    emit: (name: string) =>
      [...(listeners.get(name) ?? [])].forEach((fn) =>
        fn({} as unknown as FakeEvent),
      ),
    listenerCount: (name: string) => listeners.get(name)?.size ?? 0,
    get pending() {
      return attrs.has(ACTION_PENDING_ATTRIBUTE);
    },
  };
}

function submitEvent(target: unknown): FakeEvent {
  const event: FakeEvent = {
    target,
    defaultPrevented: false,
    stopped: false,
    preventDefault: () => (event.defaultPrevented = true),
    stopImmediatePropagation: () => (event.stopped = true),
  };
  return event;
}

type FetchImpl = (this: unknown, ...args: unknown[]) => Promise<Response>;

/** Ejecuta el texto que va inline en el <head> con un `window` y un `document` de mentira. */
function boot(fetchImpl?: FetchImpl) {
  const captured = new Map<string, { fn: Listener; capture: boolean }>();
  const forms: ReturnType<typeof fakeForm>[] = [];
  const html = new Map<string, string>();
  const win = {
    fetch: fetchImpl as ((...args: unknown[]) => Promise<Response>) | undefined,
    addEventListener: (
      name: string,
      fn: Listener,
      capture?: boolean | AddEventListenerOptions,
    ) => captured.set(name, { fn, capture: capture === true }),
  };
  const doc = {
    // El selector real es `form[data-action-pending]`; acá alcanza con filtrar.
    querySelectorAll: () => forms.filter((form) => form.pending),
    documentElement: {
      setAttribute: (name: string, value: string) => void html.set(name, value),
    },
  };
  new Function("window", "document", "Response", ACTION_GUARD_BOOTSTRAP)(
    win,
    doc,
    Response,
  );
  const submit = (form: unknown) => {
    const event = submitEvent(form);
    captured.get("submit")!.fn(event);
    return event;
  };
  return { win, captured, forms, html, submit };
}

const json = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function readResult(response: Response) {
  const back = await _deserialize<{ result: Record<string, unknown> }>(
    await response.text(),
  );
  return back.result;
}

describe("undeliveredResultWire", () => {
  it("usa el formato que el router deserializa: result.failed, undelivered y el mensaje", async () => {
    const wire = undeliveredResultWire('Un mensaje con ¿acentos? y "comillas"');
    const back = await _deserialize<{ result: Record<string, unknown> }>(
      JSON.stringify(wire),
    );
    expect(back).toEqual({
      result: {
        failed: true,
        undelivered: true,
        message: 'Un mensaje con ¿acentos? y "comillas"',
      },
    });
  });
});

describe("ACTION_GUARD_BOOTSTRAP · instalación", () => {
  it("deja constancia en <html> de que corrió", () => {
    const { html } = boot(async () => new Response("ok"));
    expect(html.get(ACTION_GUARD_STATE_ATTRIBUTE)).toBe("on");
  });

  it("si algo falla al instalarse lo dice en vez de tragárselo", () => {
    const html = new Map<string, string>();
    new Function("window", "document", "Response", ACTION_GUARD_BOOTSTRAP)(
      { fetch: () => {}, addEventListener: null },
      {
        documentElement: {
          setAttribute: (n: string, v: string) => void html.set(n, v),
        },
      },
      Response,
    );
    expect(html.get(ACTION_GUARD_STATE_ATTRIBUTE)).toBe("failed");
  });

  it("el texto inline no puede cerrar su propio <script>", () => {
    expect(ACTION_GUARD_BOOTSTRAP).not.toMatch(/<\/script|<!--/i);
    expect(ACTION_GUARD_BOOTSTRAP).not.toMatch(/\b(let|const)\s|=>|`/);
  });
});

describe("ACTION_GUARD_BOOTSTRAP · fetch", () => {
  it("deja pasar intacto lo que no es un POST de acción y conserva el `this`", async () => {
    const html = new Response("<html>", { headers: { "content-type": "text/html" } });
    const seen: unknown[] = [];
    const original: FetchImpl = vi.fn(async function (this: unknown) {
      seen.push(this);
      return html;
    });
    const { win } = boot(original);
    expect(await win.fetch!("/algo?qaction=abc", { method: "GET" })).toBe(html);
    expect(await win.fetch!("/algo", { method: "POST" })).toBe(html);
    expect(seen).toEqual([win, win]);
  });

  it("reenvía los argumentos tal cual al fetch original", async () => {
    const original = vi.fn(async () => json("[5,[0,\"result\",3,0]]"));
    const { win } = boot(original);
    const init = { method: "POST", body: new FormData(), signal: new AbortController().signal };
    await win.fetch!("/ruta?qaction=abc", init);
    expect(original).toHaveBeenCalledWith("/ruta?qaction=abc", init);
  });

  it("también envuelve un Request POST con qaction", async () => {
    const { win } = boot(async () => {
      throw new TypeError("Failed to fetch");
    });
    const request = new Request("http://x/ruta?qaction=abc", { method: "POST" });
    const response = await win.fetch!(request);
    expect(await readResult(response)).toMatchObject({ undelivered: true });
  });

  it("una respuesta JSON de acción pasa con el mismo cuerpo y estado, aunque sea un rechazo 400", async () => {
    const body = '[5,[0,"result",5,[0,"message",0,"Esa comunidad no existe."]]]';
    const { win } = boot(async () => json(body, { status: 400 }));
    const response = await win.fetch!("/ruta?qaction=abc", { method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.text()).toBe(body);
  });

  it("una redirección real pasa intacta: el router recarga la página", async () => {
    const redirected = new Response("", { status: 200 });
    Object.defineProperty(redirected, "redirected", { value: true });
    const { win } = boot(async () => redirected);
    expect(await win.fetch!("/ruta?qaction=abc", { method: "POST" })).toBe(
      redirected,
    );
  });

  it("un rechazo de red se vuelve un resultado no entregado que el router puede leer", async () => {
    const { win } = boot(async () => {
      throw new TypeError("Failed to fetch");
    });
    const response = await win.fetch!("/ruta?qaction=abc", { method: "POST" });
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("json");
    expect(await readResult(response)).toEqual({
      failed: true,
      undelivered: true,
      message: UNDELIVERED_NETWORK_MESSAGE,
    });
  });

  it("una respuesta sin JSON se vuelve un resultado no entregado con su código", async () => {
    const { win } = boot(
      async () =>
        new Response("<html>Bad gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    );
    const response = await win.fetch!("/ruta?qaction=abc", { method: "POST" });
    expect(response.status).toBe(502);
    expect(await readResult(response)).toMatchObject({
      undelivered: true,
      message: UNDELIVERED_SERVER_MESSAGE,
    });
  });

  it("un código sin cuerpo posible o fuera de rango cae a 503 en vez de lanzar", async () => {
    for (const status of [204, 205, 304, 200]) {
      const { win } = boot(
        async () => new Response(null, { status, headers: { "content-type": "text/plain" } }),
      );
      const response = await win.fetch!("/ruta?qaction=abc", { method: "POST" });
      expect(response.status, String(status)).toBe(503);
    }
  });

  it("un 5xx JSON sin result (una acción que lanzó) ya no queda mudo", async () => {
    const { win } = boot(async () =>
      json('[5,[0,"e",0,"Internal error",0,"s",0,500]]', { status: 500 }),
    );
    const response = await win.fetch!("/ruta?qaction=abc", { method: "POST" });
    expect(response.status).toBe(500);
    expect(await readResult(response)).toMatchObject({
      undelivered: true,
      message: UNDELIVERED_SERVER_MESSAGE,
    });
  });

  it("un cuerpo JSON cortado tampoco", async () => {
    const { win } = boot(async () => json('[5,[0,"result",5,[0,"mess'));
    const response = await win.fetch!("/ruta?qaction=abc", { method: "POST" });
    expect(await readResult(response)).toMatchObject({ undelivered: true });
  });

  it("ninguno de los dos mensajes afirma que no se guardó ni habla sólo de publicar (D74)", () => {
    for (const message of [UNDELIVERED_NETWORK_MESSAGE, UNDELIVERED_SERVER_MESSAGE]) {
      expect(message).not.toMatch(/no se (guardó|publicó|envió)/i);
      expect(message).toMatch(/no sabemos/i);
      expect(message).not.toMatch(/comunidad|publicó\.$/i);
    }
  });
});

describe("ACTION_GUARD_BOOTSTRAP · submit", () => {
  it("escucha submit en captura sobre window, antes que el cargador de Qwik", () => {
    const { captured } = boot();
    expect(captured.get("submit")?.capture).toBe(true);
  });

  it("deja pasar el primer envío y bloquea el segundo hasta que la acción termina", () => {
    const { submit } = boot();
    const form = fakeForm();

    expect(submit(form).defaultPrevented).toBe(false);
    expect(form.pending).toBe(true);

    const second = submit(form);
    expect(second.defaultPrevented).toBe(true);
    expect(second.stopped).toBe(true);

    form.emit("submitcompleted");
    expect(form.pending).toBe(false);
    expect(form.listenerCount("submitcompleted")).toBe(0);
    form.emit("submitcompleted"); // repetido: no rompe nada
    expect(submit(form).defaultPrevented).toBe(false);
  });

  it("sólo toca formularios POST con una acción del router", () => {
    const { submit } = boot();
    const cases: Record<string, string>[] = [
      { method: "get", action: "/buscar" },
      { action: "?qaction=abc" },
      { method: "post", action: "/perfil" },
      {},
    ];
    for (const attrs of cases) {
      const form = fakeForm(attrs);
      expect(submit(form).defaultPrevented, JSON.stringify(attrs)).toBe(false);
      expect(form.pending, JSON.stringify(attrs)).toBe(false);
    }
  });

  it("también libera cuando el fetch de esa acción se asienta, aunque no haya submitcompleted", async () => {
    let settle: (r: Response) => void = () => {};
    const { win, forms, submit } = boot(
      () => new Promise<Response>((resolve) => (settle = resolve)),
    );
    const mine = fakeForm({ method: "post", action: "?qaction=abc123" });
    const other = fakeForm({ method: "post", action: "?qaction=zzz" });
    forms.push(mine, other);
    submit(mine);
    submit(other);
    const pending = win.fetch!("/ruta?qaction=abc123&x=1", { method: "POST" });
    settle(json('[5,[0,"result",3,0]]'));
    await pending;
    expect(mine.pending).toBe(false);
    expect(other.pending).toBe(true);
  });

  it("libera también si el fetch rechaza y el router no lo atrapa", async () => {
    const { win, forms, submit } = boot(async () => {
      throw new TypeError("Failed to fetch");
    });
    const form = fakeForm();
    forms.push(form);
    submit(form);
    await win.fetch!("/ruta?qaction=abc123", { method: "POST" });
    expect(form.pending).toBe(false);
  });

  it("al volver desde la caché del navegador libera todo lo que quedó pendiente", () => {
    const { captured, forms, submit } = boot();
    const form = fakeForm();
    forms.push(form);
    submit(form);
    captured.get("pageshow")!.fn({} as FakeEvent);
    expect(form.pending).toBe(false);
  });
});
