import { describe, expect, it } from "vitest";
import { clearRequestDraft, requestDraft } from "./request-draft";

const defaults = {
  name: "",
  type: "government",
  message: "",
  cuit_helper: "",
  phone_helper: "",
};
function posted() {
  const fields = new FormData();
  for (const [key, value] of Object.entries({
    name: "Club",
    type: "ngo",
    message: "Explicación original",
    cuit_helper: "30-12345678-9",
    phone_helper: "1123456789",
  }))
    fields.set(key, value);
  return fields;
}
describe("borrador de una solicitud", () => {
  it("recupera todos los auxiliares y el select de un POST rechazado", () => {
    expect(requestDraft(defaults, posted())).toEqual({
      name: "Club",
      type: "ngo",
      message: "Explicación original",
      cuit_helper: "30-12345678-9",
      phone_helper: "1123456789",
    });
  });
  it("un envío aceptado restablece campos sin cambios e impide reenviar intacta la solicitud", () => {
    const draft = requestDraft(defaults, posted());
    clearRequestDraft(draft, defaults, posted());
    expect(draft).toEqual(defaults);
  });
  it("conserva cada edición posterior al envío y limpia sólo valores confirmados", () => {
    const draft = requestDraft(defaults, posted());
    draft.name = "Club para el próximo envío";
    draft.phone_helper = "1199999999";
    clearRequestDraft(draft, defaults, posted());
    expect(draft.name).toBe("Club para el próximo envío");
    expect(draft.phone_helper).toBe("1199999999");
    expect(draft.message).toBe("");
    expect(draft.type).toBe("government");
  });
});
