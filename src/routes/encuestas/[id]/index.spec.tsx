import { component$, useContextProvider, useStore } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observePollDeadline } from "~/lib/poll-deadline";
import { buttonClass } from "~/components/ui";
import { useClosePoll } from "~/lib/content-actions";
import { LocaleContext } from "~/lib/i18n";
import { TimeZoneContext } from "~/lib/timezone";
import PollPage, { usePoll } from "./index";

// Conteo que la página no debe mostrar durante la ronda. Era 37, y la cuenta
// regresiva al cierre de 2030 pasó por "1437 días": un número de cinco cifras
// no aparece en fechas ni en plazos.
const HIDDEN_COUNT = 48_613;

const pollId = "a0000000-0000-4000-8000-000000000001";
const closeFixture = vi.hoisted(() => ({ action: undefined as unknown }));
vi.mock("~/lib/content-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/content-actions")>()),
  useClosePoll: vi.fn(() => closeFixture.action),
}));
const confirmFixtureLabel = "Confirmar cierre de prueba";
const optionIds = [
  "a0000000-0000-4000-8000-000000000002",
  "a0000000-0000-4000-8000-000000000003",
];
vi.mock("~/lib/poll-deadline", () => ({
  observePollDeadline: vi.fn(() => () => {}),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const Example = component$<{
  labels: string[];
  failure?: "options" | "stats" | "results";
  closed?: boolean;
  canManage?: boolean;
  closeFailed?: boolean;
  switchPoll?: boolean;
  author?: boolean;
  justPublished?: boolean;
  visitor?: boolean;
  nonMember?: boolean;
  voted?: boolean;
  earth?: boolean;
  single?: boolean;
  resultsVisible?: boolean;
  aiEnabled?: boolean;
  aiSummary?: boolean;
}>(
  ({
    labels,
    failure,
    closed,
    canManage,
    closeFailed,
    switchPoll,
    author,
    justPublished,
    visitor,
    nonMember,
    voted,
    earth,
    single,
    resultsVisible,
    aiEnabled,
    aiSummary,
  }) => {
  useContextProvider(LocaleContext, "es");
  useContextProvider(TimeZoneContext, "UTC");
  const initialPost = closeFailed ? new FormData() : undefined;
  initialPost?.set("id", pollId);
  const close = useStore({
    value: (closeFailed
      ? {
          failed: true,
          message: "No pudimos cerrar la encuesta. Puede que ya esté cerrada.",
        }
      : undefined) as
      { closed?: true; failed?: true; message?: string } | undefined,
    formData: initialPost,
    isRunning: false,
  });
  closeFixture.action = close;
  const detail = useStore({
    poll: {
      id: pollId,
      author_id: null,
      community_id: pollId,
      type: switchPoll ? "multiple" : single ? "single" : "binary",
      category: "transporte",
      status: closed ? "closed" : "active",
      question: "¿Qué diseño preferís para la calle?",
      description: null,
      created_at: "2026-10-01T12:00:00Z",
      closes_at: "2030-10-01T12:00:00Z",
      max_choices: switchPoll ? 1 : null,
      removed_at: null,
      removed_by: null,
      status_before_removal: null,
      results_visibility: "after_close",
    },
    options: labels.map((label, index) => ({
      id: optionIds[index],
      label,
      poll_id: pollId,
      sort_order: index,
    })),
    community: {
      id: pollId,
      slug: earth ? "earth" : "barrio",
      name: earth ? "Tierra" : "Barrio",
      emoji: "🏡",
      level: earth ? 0 : 4,
      path: earth ? "earth" : "earth.barrio",
    },
    chain: [
      {
        id: pollId,
        slug: "barrio",
        name: "Barrio",
        emoji: "🏡",
        level: 4,
        path: "earth.barrio",
      },
    ],
    results: resultsVisible
      ? labels.map((label, index) => ({
          option_id: optionIds[index],
          label,
          sort_order: index,
          votes: 5,
          percentage: 50,
        }))
      : [],
    totalVotes: HIDDEN_COUNT,
    totalVoters: HIDDEN_COUNT,
    canSeeResults: !!resultsVisible,
    closedAtLoad: !!closed,
    hasVoted: !!voted,
    isMember: !visitor && !nonMember,
    isAuthenticated: !visitor,
    optionsLoadFailed: failure === "options",
    statsLoadFailed: failure === "stats",
    resultsLoadFailed: failure === "results",
    canManage: !!canManage,
    isAuthor: !!author,
    aiSummary: aiSummary
      ? {
          summary: "Síntesis de prueba",
          keyPoints: [],
          generatedAt: "2026-10-01T12:00:00Z",
        }
      : null,
    aiSummaryEnabled: !!aiEnabled,
    extensions: {
      sources: [],
      responses: [],
      related: [],
      myOrganizations: [],
      loadFailures: {
        sources: false,
        responses: false,
        related: false,
        representation: false,
      },
    },
    socialImage: "",
    ogImage: "",
  });
  return (
    <QwikRouterMockProvider
      url={`http://localhost/encuestas/${pollId}${justPublished ? "?publicado=1" : ""}`}
      loaders={[
        {
          loader: usePoll,
          data: detail,
        },
      ]}
    >
      <button
        id="confirm-close-fixture"
        onClick$={() => {
          const posted = new FormData();
          posted.set("id", pollId);
          close.formData = posted;
          close.value = { closed: true };
        }}
      >
        {confirmFixtureLabel}
      </button>
      {switchPoll && (
        <button
          id="switch-poll-fixture"
          onClick$={() => {
            detail.poll.id = "b0000000-0000-4000-8000-000000000001";
            detail.poll.question = "Otra encuesta del mismo territorio";
            detail.options = detail.options.map((option, index) => ({
              ...option,
              id: `b0000000-0000-4000-8000-00000000000${index + 2}`,
              poll_id: detail.poll.id,
            }));
          }}
        >
          {confirmFixtureLabel}
        </button>
      )}
      <PollPage />
    </QwikRouterMockProvider>
  );
  },
);

describe("opciones binarias neutrales", () => {
  it("reinicia una selección múltiple al cambiar de encuesta sin desmontar la página", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example labels={["Avanzar", "Revisar"]} switchPoll />);
    const first = screen.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    first.checked = true;
    await userEvent(first, "change");
    expect(screen.textContent).toContain("Llegaste al máximo: 1 de 1 opciones");
    expect(
      screen.querySelectorAll('input[type="checkbox"][disabled]'),
    ).toHaveLength(1);
    await userEvent(screen.querySelector("#switch-poll-fixture"), "click");
    expect(screen.textContent).toContain("Otra encuesta del mismo territorio");
    expect(screen.textContent).toContain("Llevás 0 de 1 opciones");
    expect(
      screen.querySelectorAll('input[type="checkbox"][disabled]'),
    ).toHaveLength(0);
  });

  it("conserva la expansión nativa al actualizar el reloj y permite Cancelar", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example labels={["Avanzar", "Revisar"]} canManage />);
    const details = screen.querySelector<HTMLDetailsElement>(
      // D124: el cierre vive dentro del panel único de autor; el gancho es
      // el atributo del bloque, no una sección propia.
      `[data-author-action="close"] details`,
    )!;
    details.open = true;
    details.setAttribute("open", "");
    await userEvent(details, "toggle");
    const update = vi.mocked(observePollDeadline).mock.calls.at(-1)![2];
    update(Date.parse("2029-10-01T12:00:00Z"));
    await vi.waitFor(() => expect(details.hasAttribute("open")).toBe(true));
    const cancel = Array.from(details.querySelectorAll("a")).find(
      (anchor) => anchor.textContent?.trim() === "Cancelar",
    )!;
    await userEvent(cancel, "click");
    expect(details.hasAttribute("open")).toBe(false);
  });
  it("deja abierta la confirmación de un POST rechazado y conserva el error del servidor", async () => {
    const { render, screen } = await createDOM();
    const prototype = Object.getPrototypeOf(
      screen.ownerDocument.createElement("div"),
    );
    const previousRect = Object.getOwnPropertyDescriptor(
      prototype,
      "getBoundingClientRect",
    );
    Object.defineProperty(prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0, bottom: 1 }),
    });
    vi.stubGlobal("window", { innerHeight: 900 });
    try {
      await render(
        <Example labels={["Avanzar", "Revisar"]} canManage closeFailed />,
      );
      expect(
        screen
          .querySelector(`[data-author-action="close"] details`)
          ?.hasAttribute("open"),
      ).toBe(true);
      expect(screen.textContent).toContain(
        "No pudimos cerrar la encuesta. Puede que ya esté cerrada.",
      );
      expect(screen.textContent).not.toContain("La encuesta se cerró.");
    } finally {
      if (previousRect)
        Object.defineProperty(prototype, "getBoundingClientRect", previousRect);
      else delete prototype.getBoundingClientRect;
    }
  });
  it("el mismo cierre confirmado retira el voto del padre, confirma el hijo y ofrece consultar resultados sin inventarlos", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example labels={["Avanzar", "Revisar"]} canManage />);
    expect(screen.querySelectorAll('button[name="option_id"]')).toHaveLength(2);
    expect(useClosePoll).toHaveBeenCalledTimes(1);
    await userEvent(screen.querySelector("#confirm-close-fixture"), "click");
    expect(screen.querySelectorAll('button[name="option_id"]')).toHaveLength(0);
    expect(screen.textContent).toContain("La encuesta se cerró.");
    expect(screen.textContent).toContain("Consultar resultados finales");
    expect(screen.textContent).not.toContain("participaron menos de 5");
    expect(screen.textContent).not.toContain(String(HIDDEN_COUNT));
  });
  it.each(["options", "stats", "results"] as const)(
    "distingue el fallo de %s de una reserva real por participación insuficiente",
    async (failure) => {
      const { render, screen } = await createDOM();
      await render(
        <Example labels={["Avanzar", "Revisar"]} failure={failure} closed />,
      );
      expect(screen.querySelector('[role="alert"]')).toBeTruthy();
      expect(screen.textContent).not.toContain(String(HIDDEN_COUNT));
      if (failure !== "options") {
        expect(screen.textContent).toContain(
          "No pudimos cargar los resultados",
        );
        expect(screen.textContent).not.toContain("participaron menos de 5");
      }
      expect(screen.querySelectorAll('button[name="option_id"]')).toHaveLength(
        0,
      );
    },
  );
  it.each([
    ["Reordenar el tránsito", "Mantener el diseño actual"],
    ["Mantener el diseño actual", "Reordenar el tránsito"],
  ])(
    "presenta %s y %s con el mismo tratamiento aunque cambie el orden",
    async (first, second) => {
      const { render, screen } = await createDOM();
      await render(<Example labels={[first, second]} />);
      const buttons = Array.from(
        screen.querySelectorAll<HTMLButtonElement>('button[name="option_id"]'),
      );
      expect(buttons, screen.textContent ?? "").toHaveLength(2);
      expect(buttons[0].className).toBe(buttons[1].className);
      expect(buttons.map((button) => button.textContent?.trim())).toEqual([
        first,
        second,
      ]);
      expect(buttons.map((button) => button.value)).toEqual(optionIds);
      expect(buttons.every((button) => !button.disabled)).toBe(true);
      expect(
        buttons.every((button) => !/[👍👎]/u.test(button.textContent ?? "")),
      ).toBe(true);
      expect(screen.textContent).toContain("Los resultados están reservados");
      expect(screen.textContent).not.toContain(String(HIDDEN_COUNT));
    },
  );
  it("al vencer retira el voto y ofrece consultar sin inventar participación ni publicar recuentos locales", async () => {
    const { render, screen } = await createDOM();
    await render(<Example labels={["Avanzar", "Revisar"]} />);
    await vi.waitFor(() => expect(observePollDeadline).toHaveBeenCalled());
    const update = vi.mocked(observePollDeadline).mock.calls.at(-1)![2];
    update(Date.parse("2030-10-01T12:00:01Z"));
    await vi.waitFor(() =>
      expect(screen.querySelectorAll('button[name="option_id"]')).toHaveLength(
        0,
      ),
    );
    const refresh = Array.from(screen.querySelectorAll("a")).find(
      (link) => link.textContent?.trim() === "Consultar resultados finales",
    )!;
    expect(refresh.getAttribute("href")).toBe(
      `/encuestas/${pollId}#resultados`,
    );
    expect(screen.textContent).toContain("El plazo terminó.");
    expect(screen.textContent).not.toContain("participaron menos de 5");
    expect(screen.textContent).not.toContain(String(HIDDEN_COUNT));
  });
});

describe("primera visita después de publicar", () => {
  it("le cuenta a la autoría qué sigue, con el cierre y el mínimo de D68", async () => {
    const { render, screen } = await createDOM();
    await render(
      <Example labels={["Avanzar", "Revisar"]} author justPublished />,
    );
    const card = screen.querySelector(
      'section[aria-labelledby="publicado-titulo"]',
    );
    expect(card?.textContent).toContain("Tu encuesta ya está publicada");
    expect(card?.textContent).toContain("Cierra el");
    expect(card?.textContent).toContain("al menos 5 personas");
    expect(card?.textContent).not.toContain(String(HIDDEN_COUNT));
  });

  it.each([
    ["otra persona con el enlace compartido", false, true],
    ["la autoría en una visita posterior", true, false],
  ] as const)("no se muestra a %s", async (_, author, justPublished) => {
    const { render, screen } = await createDOM();
    await render(
      <Example
        labels={["Avanzar", "Revisar"]}
        author={author}
        justPublished={justPublished}
      />,
    );
    expect(screen.textContent).not.toContain("Tu encuesta ya está publicada");
  });
});

describe("opciones de sólo lectura", () => {
  const labels = ["Reordenar el tránsito", "Mantener el diseño actual"];
  const occurrences = (text: string | null, needle: string) =>
    (text ?? "").split(needle).length - 1;

  it.each([
    ["sin sesión", { visitor: true }],
    ["sin residencia en la comunidad", { nonMember: true }],
    ["después de votar", { voted: true }],
    ["con la ronda cerrada y los resultados reservados", { closed: true }],
    ["con los resultados en error", { closed: true, resultsVisible: true, failure: "results" as const }],
  ])("%s se leen las etiquetas, sin controles ni números", async (_, persona) => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} {...persona} />);
    const heading = Array.from(screen.querySelectorAll("h2")).find(
      (candidate) => candidate.textContent?.trim() === "Opciones",
    );
    expect(heading, screen.textContent ?? "").toBeTruthy();
    const list = screen.querySelector(
      `ul[aria-labelledby="${heading!.getAttribute("id")}"]`,
    )!;
    const items = Array.from(list.querySelectorAll("li"));
    expect(items.map((item) => item.textContent?.trim())).toEqual(labels);
    // Contenido ciudadano (D56): sin traducir y con su propia dirección.
    expect(items.every((item) => item.getAttribute("dir") === "auto")).toBe(true);
    // Voto secreto (D68): ni conteos ni nada que marque qué eligió la persona.
    expect(list.textContent).not.toMatch(/\d/);
    expect(
      list.querySelectorAll(
        "input, button, a, progress, [role], [aria-checked], [aria-selected], [aria-current]",
      ),
    ).toHaveLength(0);
    expect(screen.querySelectorAll('[name="option_id"]')).toHaveLength(0);
    expect(screen.textContent).not.toContain(String(HIDDEN_COUNT));
  });

  it("va encima de las salidas de cada persona", async () => {
    for (const [persona, next] of [
      [{ visitor: true }, "Crear cuenta"],
      [{ voted: true }, "Ya votaste en esta encuesta."],
    ] as const) {
      const { render, screen } = await createDOM();
      await render(<Example labels={labels} {...persona} />);
      const text = screen.textContent ?? "";
      expect(text.indexOf(labels[0])).toBeGreaterThan(-1);
      expect(text.indexOf(labels[0])).toBeLessThan(text.indexOf(next));
    }
  });

  it.each([
    ["binaria", {}],
    ["de una opción", { single: true }],
  ])("con la votación %s abierta no se duplican", async (_, kind) => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} {...kind} />);
    expect(screen.querySelectorAll('[name="option_id"]')).toHaveLength(2);
    for (const label of labels)
      expect(occurrences(screen.textContent, label)).toBe(1);
    expect(
      Array.from(screen.querySelectorAll("h2")).map((h) => h.textContent?.trim()),
    ).not.toContain("Opciones");
  });

  it("no repite lo que ya muestran los resultados", async () => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} closed resultsVisible />);
    expect(
      Array.from(screen.querySelectorAll("h2")).map((h) => h.textContent?.trim()),
    ).not.toContain("Opciones");
    expect(screen.textContent).toContain(labels[0]);
    expect(screen.querySelector("ul[aria-labelledby]")).toBeFalsy();
  });

  it.each([
    ["las opciones", "options"],
    ["la participación", "stats"],
  ] as const)("no se dibuja si no se pudo leer %s", async (_, failure) => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} visitor failure={failure} />);
    expect(screen.querySelector("ul[aria-labelledby]")).toBeFalsy();
    expect(
      Array.from(screen.querySelectorAll("h2")).map((h) => h.textContent?.trim()),
    ).not.toContain("Opciones");
  });
});

describe("salidas de quien no puede votar", () => {
  const labels = ["Avanzar", "Revisar"];
  const linkNamed = (root: Element, name: string) =>
    Array.from(root.querySelectorAll("a")).find(
      (anchor) => anchor.textContent?.trim() === name,
    );

  it("a una visitante le propone crear la cuenta primero y conserva la vuelta", async () => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} visitor />);
    const signUp = linkNamed(screen, "Crear cuenta")!;
    const signIn = linkNamed(screen, "Ingresar")!;
    expect(signUp.className).toBe(buttonClass("primary", "md"));
    expect(signIn.className).toBe(buttonClass("secondary", "md"));
    expect(signUp.getAttribute("href")).toContain("/registro");
    expect(signUp.getAttribute("href")).toContain(encodeURIComponent(`/encuestas/${pollId}`));
    expect(signIn.getAttribute("href")).toContain(encodeURIComponent(`/encuestas/${pollId}`));
    const text = screen.textContent ?? "";
    expect(text.indexOf("Crear cuenta")).toBeLessThan(text.indexOf("Ingresar"));
    expect(text).toContain("Para votar necesitás una cuenta y vivir en Barrio.");
  });

  it.each([
    ["sin sesión", { visitor: true }, "Para votar necesitás una cuenta y elegir dónde vivís."],
    ["sin residencia", { nonMember: true }, "Para votar, elegí dónde vivís desde"],
  ])("en la Tierra no pide vivir en ella %s", async (_, persona, expected) => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} earth {...persona} />);
    expect(screen.textContent).toContain(expected);
    expect(screen.textContent).not.toMatch(/viv(ir|en) en Tierra/);
  });

  it("otra residencia sigue viendo por qué no puede votar y dónde cambiarla", async () => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} nonMember />);
    expect(screen.textContent).toContain("votar sólo pueden quienes viven en Barrio");
    expect(linkNamed(screen, "tu perfil")?.getAttribute("href")).toBe("/perfil");
  });
});

describe("aviso antes de votar", () => {
  it.each([
    ["binaria", {}],
    ["de una opción", { single: true }],
  ])("en la votación %s describe la protección sin parecer una falla", async (_, kind) => {
    const { render, screen } = await createDOM();
    await render(<Example labels={["Avanzar", "Revisar"]} {...kind} />);
    expect(screen.textContent).not.toContain("⚠");
    const paragraph = (start: string) =>
      Array.from(screen.querySelectorAll("p")).find((candidate) =>
        candidate.textContent?.trim().startsWith(start),
      );
    const protection = paragraph("Tu elección no queda guardada")!;
    const irreversible = paragraph("Una vez enviada")!;
    expect(protection.textContent?.trim()).toBe(
      "Tu elección no queda guardada: sólo se suma al total y registramos que participaste.",
    );
    expect(protection.className).toContain("text-ink-muted");
    expect(protection.className).not.toContain("text-warn");
    expect(irreversible.textContent?.trim()).toBe("Una vez enviada, no se puede cambiar.");
    expect(irreversible.className).toContain("font-medium");
    expect(irreversible.className).not.toContain("text-warn");
  });
});

describe("columna lateral", () => {
  const labels = ["Avanzar", "Revisar"];
  const grid = (root: Element) => root.querySelector("article")!.parentElement!;
  const page = (root: Element) => grid(root).parentElement!;

  it("sin nada que mostrar no se dibuja y la columna queda acotada", async () => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} />);
    expect(screen.querySelector("aside")).toBeFalsy();
    expect(page(screen).className).toContain("lg:max-w-4xl");
    expect(grid(screen).className).not.toContain("lg:grid-cols-");
  });

  it.each([
    ["los resultados descargables", { closed: true, resultsVisible: true }, "Descargar resultados"],
    ["la generación de resúmenes", { aiEnabled: true }, "Resumen de IA"],
    ["un resumen ya generado", { aiSummary: true }, "Síntesis de prueba"],
  ])("con %s reserva la columna y la llena", async (_, props, expected) => {
    const { render, screen } = await createDOM();
    await render(<Example labels={labels} {...props} />);
    expect(screen.querySelector("aside")?.textContent).toContain(expected);
    expect(grid(screen).className).toContain("lg:grid-cols-[1fr_22rem]");
    expect(page(screen).className).not.toContain("lg:max-w-4xl");
  });
});
