import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { Tables } from "~/lib/database.types.helpers";
import { ClaimTimeline, type ClaimTimelineEvent } from "./ClaimTimeline";
import type {
  useAddClaimEvent,
  useAssignClaimOrganization,
} from "~/routes/reclamos/[id]";

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const idleAssign = { value: undefined, isRunning: false } as ReturnType<
  typeof useAssignClaimOrganization
>;
const idleAction = { value: undefined, isRunning: false } as ReturnType<
  typeof useAddClaimEvent
>;

const events: Omit<Tables<"claim_events">, "actor_id">[] = [
  ["created", "Apertura"],
  ["official_response", "Respuesta de la municipalidad"],
  ["evidence", "Foto adicional"],
  ["status_change", "Nueva etapa"],
].map(([event_type, title], index) => ({
  id: String(index),
  event_type,
  title,
  claim_id: "claim-id",
  body: null,
  created_at: "2026-10-01T12:00:00Z",
  event_date: "2026-10-01",
  evidence_url: null,
  organization_id: null,
  status: null,
}));

const Example = component$<{ permission?: "none" | "author" | "official" }>(
  ({ permission = "none" }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <ClaimTimeline
        assign={idleAssign}
        addEvent={idleAction}
        claimId="claim-id"
        events={events}
        organizations={[]}
        responsible={null}
        canManage={false}
        canUpdate={permission !== "none"}
        canRespondOfficially={permission === "official"}
        canChangeStatus={permission === "official"}
      />
    );
  },
);

const historyEvents: ClaimTimelineEvent[] = [
  {
    ...events[1],
    id: "first",
    organization_id: "previous-org",
    organization: { id: "previous-org", name: "Organismo anterior" },
  },
  {
    ...events[2],
    id: "second",
    organization_id: "another-org",
    organization: { id: "another-org", name: "Otra institución histórica" },
  },
  {
    ...events[3],
    id: "hidden",
    organization_id: "hidden-org",
    organization: null,
  },
  { ...events[0], id: "resident", organization_id: null, organization: null },
];
const HistoricalExample = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <ClaimTimeline
      assign={idleAssign}
      addEvent={idleAction}
      claimId="claim-id"
      events={historyEvents}
      organizations={[{ id: "current-org", name: "Responsable actual" }]}
      responsible={{ id: "current-org", name: "Responsable actual" }}
      canManage={false}
      canUpdate={false}
    />
  );
});

const ResolutionExample = component$(() => {
  useContextProvider(LocaleContext, "es");
  const resolutions: ClaimTimelineEvent[] = [
    {
      ...events[1],
      id: "citizen-resolution",
      event_type: "resolution",
      title: "Resolución del autor",
      organization_id: null,
    },
    {
      ...events[1],
      id: "official-resolution",
      event_type: "resolution",
      title: "Resolución de la institución",
      organization_id: "institution-id",
    },
    events[1],
  ];
  return (
    <ClaimTimeline
      assign={idleAssign}
      addEvent={idleAction}
      claimId="claim-id"
      events={resolutions}
      organizations={[]}
      responsible={null}
      canManage={false}
      canUpdate={false}
    />
  );
});

describe("filtros accesibles del seguimiento público", () => {
  it("la resolución ciudadana sigue en avances y no se cuenta ni presenta como respuesta oficial", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<ResolutionExample />);
    expect(screen.querySelector("ol")?.textContent).toContain(
      "Resolución ciudadana",
    );
    expect(screen.querySelector("ol")?.textContent).toContain(
      "Resolución institucional",
    );
    const official = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Respuestas oficiales"),
    )!;
    await userEvent(official, "click");
    expect(screen.querySelectorAll("ol li")).toHaveLength(2);
    expect(screen.querySelector("ol")?.textContent).not.toContain(
      "Resolución del autor",
    );
    const progress = Array.from(screen.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Avances y estado"),
    )!;
    await userEvent(progress, "click");
    expect(screen.querySelectorAll("ol li")).toHaveLength(1);
    expect(screen.querySelector("ol")?.textContent).toContain(
      "Resolución del autor",
    );
  });
  it("identifica cada institución histórica sin usar el responsable actual ni inventar nombres ocultos por RLS", async () => {
    const { render, screen } = await createDOM();
    await render(<HistoricalExample />);
    const items = Array.from(screen.querySelectorAll("ol li"));
    expect(items[0].textContent).toContain("Institución: Organismo anterior");
    expect(items[1].textContent).toContain(
      "Institución: Otra institución histórica",
    );
    expect(items[2].textContent).toContain("Institución no disponible");
    expect(items[3].textContent).not.toContain("Institución");
    expect(screen.querySelector("ol")?.textContent).not.toContain(
      "Responsable actual",
    );
    expect(items[0].querySelector("bdi")?.getAttribute("dir")).toBe("auto");
  });
  it.each(["author", "official"] as const)(
    "muestra sólo acciones permitidas para %s",
    async (permission) => {
      const { render, screen } = await createDOM();
      await render(<Example permission={permission} />);
      const types = screen.querySelector<HTMLSelectElement>(
        'select[name="event_type"]',
      )!;
      expect(types).toBeTruthy();
      expect(!!types.querySelector('option[value="official_response"]')).toBe(
        permission === "official",
      );
      expect(!!screen.querySelector('select[name="status"]')).toBe(
        permission === "official",
      );
    },
  );
  it("expone el filtro activo y anuncia cuántos eventos muestra al cambiarlo", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const group = screen.querySelector('[role="group"]')!;
    const label = screen.querySelector(
      `#${group.getAttribute("aria-labelledby")}`,
    )!;
    expect(label.textContent).toBe("Filtrar eventos:");
    const buttons = Array.from(group.querySelectorAll("button"));
    const all = buttons.find((b) => b.textContent?.includes("Todos"))!;
    const official = buttons.find((b) =>
      b.textContent?.includes("Respuestas oficiales"),
    )!;
    const evidence = buttons.find((b) =>
      b.textContent?.includes("Evidencia vecinal"),
    )!;
    const status = group.querySelector('[role="status"]')!;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe("Mostrando 4 de 4 eventos.");
    expect(all.getAttribute("aria-pressed")).toBe("true");

    await userEvent(official, "click");
    expect(official.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(status.textContent).toBe("Mostrando 1 de 4 eventos.");
    expect(screen.querySelectorAll("ol li").length).toBe(1);
    expect(screen.querySelector("ol")?.textContent).toContain(
      "Respuesta de la municipalidad",
    );

    await userEvent(evidence, "click");
    expect(evidence.getAttribute("aria-pressed")).toBe("true");
    expect(official.getAttribute("aria-pressed")).toBe("false");
    expect(screen.querySelector("ol")?.textContent).toContain("Foto adicional");

    await userEvent(all, "click");
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toBe("Mostrando 4 de 4 eventos.");
    expect(screen.querySelectorAll("ol li").length).toBe(4);
  });
});
