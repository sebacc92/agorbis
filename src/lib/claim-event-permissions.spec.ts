import { describe, expect, it } from "vitest";
import { claimEventPermissions } from "./claim-event-permissions";

describe("acciones públicas del seguimiento según la RPC vigente", () => {
  it("no invita a un residente ajeno a publicar una actualización rechazada", () => {
    expect(claimEventPermissions({ isAuthor: false, isModerator: false, representsResponsibleOrganization: false })).toEqual({ canUpdate: false, canRespondOfficially: false, canChangeStatus: false });
  });
  it("el autor puede documentar novedades sin cambiar estado ni firmar respuestas oficiales", () => {
    expect(claimEventPermissions({ isAuthor: true, isModerator: false, representsResponsibleOrganization: false })).toEqual({ canUpdate: true, canRespondOfficially: false, canChangeStatus: false });
  });
  it.each([
    { isAuthor: false, isModerator: true, representsResponsibleOrganization: false },
    { isAuthor: false, isModerator: false, representsResponsibleOrganization: true },
  ])("permite las acciones oficiales sólo a moderación o representación responsable", (input) => {
    expect(claimEventPermissions(input)).toEqual({ canUpdate: true, canRespondOfficially: true, canChangeStatus: true });
  });
});
