import { describe, expect, it } from "vitest";
import { projectIdFromRoute } from "./project-route-id";

const id = "1b72752c-4fe9-4a5d-a70b-5fb187bd3a5a";
const url = (path: string) => new URL(path, "https://agorbis.test");
describe("identidad del detalle de proyecto", () => {
  it("recupera el UUID de la ruta en POST nativo y cambios de query sin params", () => {
    expect(projectIdFromRoute({ id }, url(`/proyectos/${id}`))).toBe(id);
    expect(
      projectIdFromRoute({}, url(`/proyectos/${id}/?qaction=guardar`)),
    ).toBe(id);
    expect(
      projectIdFromRoute({ id: "" }, url(`/proyectos/${id}?qa_id=otra-pagina`)),
    ).toBe(id);
  });
  it("rechaza rutas y UUID inválidos, sin aceptar identificadores del body o query", () => {
    expect(
      projectIdFromRoute({ id: "invalido" }, url(`/proyectos/${id}`)),
    ).toBeNull();
    for (const path of [
      `/proyectos/invalido?project_id=${id}`,
      `/encuestas/${id}`,
      `/proyectos/%ZZ`,
      `/proyectos/${id}%2Fotro`,
    ]) {
      expect(projectIdFromRoute({}, url(path))).toBeNull();
    }
  });
});
