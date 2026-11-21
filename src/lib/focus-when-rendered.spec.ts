import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { focusWhenRendered, holdFocus } from "./focus-when-rendered";

/** Un frame por llamada: el test decide cuándo "pasa el tiempo". */
function fakeFrames() {
  const queue = new Map<number, FrameRequestCallback>();
  let next = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = next++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => queue.delete(id));
  return {
    run(now = 0) {
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) cb(now);
    },
    size: () => queue.size,
  };
}

function fakeElement(connected = true) {
  const element = {
    isConnected: connected,
    focused: 0,
    focus() {
      this.focused += 1;
      active = element;
    },
  };
  return element;
}
let active: unknown = null;

describe("focusWhenRendered", () => {
  beforeEach(() => {
    active = null;
    vi.stubGlobal("document", {
      get activeElement() {
        return active;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("enfoca en cuanto el elemento aparece, aunque tarde varios frames", () => {
    const frames = fakeFrames();
    const element = fakeElement();
    let rendered = false;
    focusWhenRendered(
      () => (rendered ? (element as unknown as HTMLElement) : null),
      { maxFrames: 10 },
    );
    frames.run();
    frames.run();
    expect(element.focused).toBe(0);
    rendered = true;
    frames.run();
    expect(element.focused).toBe(1);
    // Con el foco puesto no sigue pidiendo frames.
    expect(frames.size()).toBe(0);
  });

  it("deja de intentar al llegar al tope", () => {
    const frames = fakeFrames();
    focusWhenRendered(() => null, { maxFrames: 3 });
    frames.run();
    frames.run();
    frames.run();
    expect(frames.size()).toBe(0);
  });

  it("reintenta si el foco no quedó donde se pidió", () => {
    const frames = fakeFrames();
    const element = fakeElement();
    // Primer intento: otro nodo retiene el foco (por ejemplo, un re-render).
    const stubborn = fakeElement();
    element.focus = function () {
      this.focused += 1;
      active = this.focused === 1 ? stubborn : element;
    };
    focusWhenRendered(() => element as unknown as HTMLElement, { maxFrames: 5 });
    frames.run();
    expect(element.focused).toBe(1);
    expect(frames.size()).toBe(1);
    frames.run();
    expect(element.focused).toBe(2);
    expect(frames.size()).toBe(0);
  });

  it("se puede cancelar antes de que aparezca", () => {
    const frames = fakeFrames();
    const element = fakeElement();
    const cancel = focusWhenRendered(() => element as unknown as HTMLElement);
    cancel();
    frames.run();
    expect(element.focused).toBe(0);
  });
});

describe("holdFocus", () => {
  const body = { tag: "body" };
  let listeners: Map<string, () => void>;

  beforeEach(() => {
    listeners = new Map();
    vi.stubGlobal("document", {
      body,
      get activeElement() {
        return active;
      },
    });
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: () => void) =>
        listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function held() {
    const frames = fakeFrames();
    const element = fakeElement();
    element.focus();
    element.focused = 0;
    holdFocus(element as unknown as HTMLElement, { ms: 1_000 });
    return { frames, element };
  }

  it("devuelve el foco si un redibujado lo dejó en el body", () => {
    const { frames, element } = held();
    frames.run(0);
    expect(element.focused).toBe(0);
    active = body;
    frames.run(16);
    expect(element.focused).toBe(1);
    expect(active).toBe(element);
    expect(frames.size()).toBe(1);
  });

  it("no mueve el scroll al devolverlo", () => {
    const { frames, element } = held();
    const focus = vi.spyOn(element, "focus");
    active = body;
    frames.run(0);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it.each(["pointerdown", "keydown"])("suelta con %s", (type) => {
    const { frames, element } = held();
    listeners.get(type)?.();
    expect(listeners.size).toBe(0);
    expect(frames.size()).toBe(0);
    active = body;
    frames.run(16);
    expect(element.focused).toBe(0);
  });

  it("no le pelea el foco a otro control", () => {
    const { frames, element } = held();
    active = fakeElement();
    frames.run(0);
    expect(element.focused).toBe(0);
    expect(frames.size()).toBe(0);
    expect(listeners.size).toBe(0);
  });

  it("termina si el nodo ya no está", () => {
    const { frames, element } = held();
    element.isConnected = false;
    active = body;
    frames.run(0);
    expect(element.focused).toBe(0);
    expect(frames.size()).toBe(0);
  });

  it("termina al vencer el plazo", () => {
    const { frames, element } = held();
    frames.run(0);
    active = body;
    frames.run(1_000);
    expect(element.focused).toBe(0);
    expect(frames.size()).toBe(0);
    expect(listeners.size).toBe(0);
  });
});
