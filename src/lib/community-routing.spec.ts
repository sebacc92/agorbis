import { describe, expect, it } from "vitest";
import {
  communitySectionFromPath,
  communitySlugFromRoute,
  isCommunityCreationPath,
} from "./community";

describe("slug de comunidad con loaders de layout Qwik 2", () => {
  it.each([
    "/c/mar-del-plata/",
    "/c/mar-del-plata/reclamos/",
    "/c/mar-del-plata/reclamos/nuevo/",
  ])("recupera params vacíos en %s", (path) => {
    expect(
      communitySlugFromRoute({}, new URL(path, "https://agorbis.com")),
    ).toBe("mar-del-plata");
  });
  it("conserva el parámetro resuelto por el router", () => {
    expect(
      communitySlugFromRoute(
        { slug: "earth" },
        new URL("https://agorbis.com/c/earth/"),
      ),
    ).toBe("earth");
  });
  it.each(["/reclamos/c/earth/", "/c/", "/c/%ZZ/", "/c/earth%2Fadmin/"])(
    "no interpreta rutas inválidas %s",
    (path) => {
      expect(
        communitySlugFromRoute({}, new URL(path, "https://agorbis.com")),
      ).toBe("");
    },
  );
});

describe("sección activa de comunidad", () => {
  it.each(["reclamos", "encuestas", "debates", "proyectos", "presupuesto"])(
    "mantiene %s activa al crear contenido o entrar por una ruta profunda",
    (section) => {
      for (const suffix of ["", "/", "/nuevo", "/nuevo/", "/otra/ruta/"]) {
        expect(
          communitySectionFromPath(
            `/c/mar-del-plata/${section}${suffix}`,
            "mar-del-plata",
          ),
        ).toBe(section);
      }
    },
  );
  it.each([
    "/c/earth",
    "/c/earth/",
    "/c/earth-extra/reclamos/",
    "/c/mar-del-plata/reclamos/",
  ])("la raíz o una comunidad diferente no activan otra sección: %s", (path) =>
    expect(communitySectionFromPath(path, "earth")).toBe(""),
  );
});

describe("rutas de creación de una comunidad", () => {
  // Un `Link` puede llegar sin la barra final y el servidor la agrega: en la
  // navegación interna el layout ve las dos formas.
  it.each([
    "/c/mar-del-plata/reclamos/nuevo",
    "/c/mar-del-plata/reclamos/nuevo/",
    "/c/mar-del-plata/encuestas/nueva",
    "/c/mar-del-plata/encuestas/nueva/",
    "/c/buenos-aires/debates/nuevo",
    "/c/buenos-aires/debates/nuevo/",
    "/c/mar-del-plata/proyectos/nuevo",
    "/c/mar-del-plata/proyectos/nuevo/",
    "/c/mar-del-plata/presupuesto/nueva",
    "/c/mar-del-plata/presupuesto/nueva/",
  ])("%s es un formulario", (path) =>
    expect(isCommunityCreationPath(path)).toBe(true),
  );

  it.each([
    "/c/mar-del-plata",
    "/c/mar-del-plata/",
    "/c/mar-del-plata/reclamos",
    "/c/mar-del-plata/reclamos/",
    // Una comunidad que se llame así conserva su cabecera en todas sus secciones.
    "/c/nuevo",
    "/c/nueva/",
    "/c/nueva/reclamos/",
    "/c/mar-del-plata/nuevo/",
    "/c/mar-del-plata/reclamos/renuevo/",
    "/c/mar-del-plata/reclamos/nuevo/otra/",
    "/reclamos/nuevo/",
    "/inicio/c/mar-del-plata/reclamos/nuevo/",
  ])("%s no es un formulario", (path) =>
    expect(isCommunityCreationPath(path)).toBe(false),
  );
});
