import { component$, useContextProvider, useStore } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  useAddClaimEvent,
  useAssignClaimOrganization,
} from "~/routes/reclamos/[id]";
import { LocaleContext } from "~/lib/i18n";
import { ClaimTimeline } from "./ClaimTimeline";

const idleAssign = { value: undefined, isRunning: false } as ReturnType<
  typeof useAssignClaimOrganization
>;
beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const claimId = "a0000000-0000-4000-8000-000000000001";
const eventId = "b0000000-0000-4000-8000-000000000001";
const fixtureLabels = {
  pending: "Preparar envío",
  success: "Confirmar envío",
  reject: "Rechazar envío",
  reload: "Revalidar",
};
type Result =
  | { added: true; eventId: string; claimId: string }
  | { failed: true; message: string };
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  const action = useStore({
    value: undefined as Result | undefined,
    formData: undefined as FormData | undefined,
    isRunning: false,
  });
  return (
    <>
      <button
        id="pending"
        onClick$={() => {
          const data = new FormData();
          for (const [key, value] of Object.entries({
            claim_id: claimId,
            event_type: "update",
            event_date: "",
            title: "Título enviado",
            body: "Texto enviado",
            evidence_url: "",
            status: "",
          }))
            data.set(key, value);
          action.formData = data;
          action.isRunning = true;
        }}
      >
        {fixtureLabels.pending}
      </button>
      <button
        id="success"
        onClick$={() => {
          action.isRunning = false;
          action.value = { added: true, eventId, claimId };
        }}
      >
        {fixtureLabels.success}
      </button>
      <button
        id="reject"
        onClick$={() => {
          action.isRunning = false;
          action.value = {
            failed: true,
            message: "No pudimos agregar la actualización.",
          };
        }}
      >
        {fixtureLabels.reject}
      </button>
      <button
        id="reload"
        onClick$={() => {
          action.value = action.value ? { ...action.value } : undefined;
        }}
      >
        {fixtureLabels.reload}
      </button>
      <ClaimTimeline
        assign={idleAssign}
        addEvent={action as ReturnType<typeof useAddClaimEvent>}
        claimId={claimId}
        events={[]}
        organizations={[]}
        responsible={null}
        canManage={false}
        canUpdate
      />
    </>
  );
});

async function setup() {
  const dom = await createDOM();
  await dom.render(<Example />);
  const title = dom.screen.querySelector<HTMLInputElement>(
    'input[name="title"]',
  )!;
  const body = dom.screen.querySelector<HTMLTextAreaElement>(
    'textarea[name="body"]',
  )!;
  title.value = "Título enviado";
  await dom.userEvent(title, "input");
  body.value = "Texto enviado";
  await dom.userEvent(body, "input");
  await dom.userEvent(dom.screen.querySelector("#pending"), "click");
  return { ...dom, title, body };
}

describe("confirmación y borrador del seguimiento", () => {
  it("limpia sólo lo enviado, conserva ediciones posteriores y procesa cada confirmación una vez", async () => {
    const { screen, userEvent, title, body } = await setup();
    body.value = "Texto posterior al envío";
    await userEvent(body, "input");
    await userEvent(screen.querySelector("#success"), "click");
    expect(title.value).toBe("");
    expect(body.value).toBe("Texto posterior al envío");
    expect(screen.textContent).toContain(
      "La actualización se publicó en el seguimiento.",
    );
    title.value = "Un borrador nuevo";
    await userEvent(title, "input");
    await userEvent(screen.querySelector("#reload"), "click");
    expect(title.value).toBe("Un borrador nuevo");
    expect(body.value).toBe("Texto posterior al envío");
  });
  it("un rechazo conserva el texto y nunca anuncia publicación", async () => {
    const { screen, userEvent, title, body } = await setup();
    await userEvent(screen.querySelector("#reject"), "click");
    expect(title.value).toBe("Título enviado");
    expect(body.value).toBe("Texto enviado");
    expect(screen.textContent).toContain(
      "No pudimos agregar la actualización.",
    );
    expect(screen.textContent).not.toContain(
      "La actualización se publicó en el seguimiento.",
    );
  });
});
