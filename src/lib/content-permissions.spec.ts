import { describe, expect, it } from "vitest";
import { contentPermissions } from "./content-permissions";

const author = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const noManagement = { isAuthor: false, canManage: false };

describe("gestión que se ofrece en el detalle de una publicación", () => {
  it("sin sesión no se ofrece nada aunque la publicación no tenga autor", () => {
    expect(
      contentPermissions({ userId: null, isModerator: false }, null),
    ).toEqual(noManagement);
  });

  it("sin sesión no se ofrece nada en una publicación con autor", () => {
    expect(
      contentPermissions({ userId: null, isModerator: false }, author),
    ).toEqual(noManagement);
  });

  it.each([
    { title: "de otra persona", authorId: author },
    { title: "sin autor", authorId: null },
  ])("una sesión ajena no gestiona una publicación $title", ({ authorId }) => {
    expect(
      contentPermissions({ userId: other, isModerator: false }, authorId),
    ).toEqual(noManagement);
  });

  it("quien es autor gestiona lo suyo", () => {
    expect(
      contentPermissions({ userId: author, isModerator: false }, author),
    ).toEqual({ isAuthor: true, canManage: true });
  });

  // La baja y el aviso de recién publicado dependen de `isAuthor`: moderación
  // gestiona, pero eso no la vuelve autora.
  it.each([
    { title: "de otra persona", authorId: author },
    { title: "sin autor", authorId: null },
  ])("moderación gestiona una publicación $title sin ser autora", ({ authorId }) => {
    expect(
      contentPermissions({ userId: other, isModerator: true }, authorId),
    ).toEqual({ isAuthor: false, canManage: true });
  });
});
