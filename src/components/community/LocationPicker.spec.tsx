import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { LocationPicker, type PickerOption } from "./LocationPicker";

const trail = [
  {
    id: "earth",
    slug: "earth",
    name: "Tierra",
    emoji: "🌍",
    level: 0,
    path: "earth",
  },
  {
    id: "argentina",
    slug: "argentina",
    name: "Argentina",
    emoji: "🇦🇷",
    level: 2,
    path: "earth.south-america.argentina",
  },
];

const options: PickerOption[] = [
  {
    id: "buenos-aires",
    slug: "buenos-aires",
    name: "Buenos Aires",
    emoji: "🌾",
    level: 3,
    path: "earth.south-america.argentina.buenos-aires",
    member_count: 4,
    has_children: true,
  },
];

const render = (
  overrides: Partial<Parameters<typeof LocationPicker>[0]> = {},
) =>
  renderWithLocale(
    <LocationPicker
      trail={trail}
      options={options}
      query=""
      navBase="/explorar?parent="
      searchAction="/explorar"
      confirmBase="/c/"
      {...overrides}
    />,
  );

describe("LocationPicker", () => {
  // D121, mejora 4: en la raíz del alta, los continentes se pliegan detrás
  // de un resumen y el buscador manda. Con una búsqueda, la lista vuelve.
  it("en la raíz del alta pliega los continentes detrás de un resumen", async () => {
    const { document } = await render({
      purpose: "residence",
      trail: trail.slice(0, 1),
      confirmBase: "/onboarding?paso=confirmar&c=",
      options: [
        {
          ...options[0],
          id: "south-america",
          slug: "south-america",
          name: "América del Sur",
          level: 1,
          path: "earth.south-america",
        },
      ],
    });
    const details = document.querySelector("details");
    expect(details?.querySelector("summary")?.textContent).toContain(
      "Explorar por continente",
    );
    expect(details?.textContent).toContain("América del Sur");
    expect(document.querySelector('form[role="search"]')).toBeTruthy();
  });

  it("con una búsqueda o un nivel abajo, la lista se muestra sin plegar", async () => {
    const searched = await render({
      purpose: "residence",
      trail: trail.slice(0, 1),
      query: "mira",
    });
    expect(searched.document.querySelector("details")).toBeFalsy();
    const deeper = await render({ purpose: "residence" });
    expect(deeper.document.querySelector("details")).toBeFalsy();
  });

  it("expone la cadena como navegación y marca el lugar actual", async () => {
    const { document } = await render();
    const breadcrumb = document.querySelector(
      'nav[aria-label="Cadena de comunidades"]',
    );

    expect(breadcrumb).toBeTruthy();
    expect(breadcrumb?.querySelector('[aria-current="page"]')?.textContent).toContain(
      "Argentina",
    );
    expect(
      breadcrumb?.querySelector('a[href="/explorar?parent=earth"]'),
    ).toBeTruthy();
  });

  it("hace explícitos los dos destinos de una comunidad", async () => {
    const { document } = await render();
    const open = document.querySelector('a[href="/c/buenos-aires"]');
    const descend = document.querySelector(
      'a[href="/explorar?parent=buenos-aires"]',
    );

    expect(open?.textContent).toContain("Abrir comunidad");
    expect(descend?.textContent).toContain("Ver ciudades y municipios");
    expect(descend?.getAttribute("aria-label")).toContain("Buenos Aires");
  });

  it("en explorar abre el nivel actual sin hablar de residencia", async () => {
    const { document } = await render();
    expect(document.body.textContent).toContain("Abrir comunidad de Argentina");
    expect(document.body.textContent).not.toContain(
      "Elegir Argentina como mi residencia",
    );
    expect(document.querySelector('a[href="/c/argentina"]')).toBeTruthy();
  });

  it("una comunidad hoja conserva migas y una salida útil", async () => {
    const { document } = await render({ options: [] });
    expect(document.body.textContent).toContain(
      "Argentina no tiene sub-comunidades todavía",
    );
    expect(document.body.textContent).toContain("Abrir comunidad de Argentina");
    expect(document.querySelector("nav")).toBeTruthy();
  });

  it("describe una búsqueda con consulta y cantidad", async () => {
    const { document } = await render({ query: "aires" });
    expect(document.body.textContent).toContain('1 resultado para “aires”');
    expect(
      document.querySelector('a[href="/explorar?parent=argentina"]'),
    ).toBeTruthy();
  });

  it("mantiene la elección territorial en modo residencia", async () => {
    const { document } = await render({
      purpose: "residence",
      confirmBase: "/perfil/residencia?c=",
    });
    expect(document.body.textContent).toContain(
      "Elegir Argentina como mi residencia",
    );
    expect(
      document.querySelector('a[href="/perfil/residencia?c=argentina"]'),
    ).toBeTruthy();
  });

  it("en una búsqueda global distingue homónimos por la comunidad que los contiene", async () => {
    const { document } = await render({
      query: "san martín",
      searchScope: "all",
      options: [
        {
          ...options[0],
          id: "san-martin-ba",
          slug: "san-martin-ba",
          name: "San Martín",
          level: 4,
          context: "Buenos Aires",
        },
        {
          ...options[0],
          id: "san-martin-mza",
          slug: "san-martin-mza",
          name: "San Martín",
          level: 4,
          context: "Mendoza",
        },
      ],
    });
    expect(document.body.textContent).toContain(
      "Resultados en todas las comunidades",
    );
    expect(document.querySelector('label[for^="location-search"]')?.textContent).toBe(
      "Buscar una comunidad por nombre",
    );
    expect(document.body.textContent).toContain("en Buenos Aires");
    expect(document.body.textContent).toContain("en Mendoza");
  });

  it("una búsqueda sin resultados ofrece pedir el lugar que falta", async () => {
    const { document } = await render({
      query: "villa inexistente",
      options: [],
      requestHref: "/comunidades/solicitar",
    });
    const request = Array.from(document.querySelectorAll("a")).find(
      (link) => link.textContent === "¿No está tu lugar? Pedí que lo sumemos",
    );
    expect(request?.getAttribute("href")).toBe("/comunidades/solicitar");
  });

  it("el último nivel ofrece pedir una localidad con su comunidad superior", async () => {
    const { document } = await render({
      options: [],
      requestHref: "/comunidades/solicitar",
    });
    const request = Array.from(document.querySelectorAll("a")).find((link) =>
      link.textContent?.startsWith("¿Falta una localidad de Argentina?"),
    );
    expect(request?.getAttribute("href")).toBe(
      "/comunidades/solicitar?superior=argentina",
    );
  });

  it("sin destino para pedir comunidades no ofrece el enlace", async () => {
    const { document } = await render({ query: "nada", options: [] });
    expect(document.body.textContent).not.toContain("Pedí que lo sumemos");
  });
});
