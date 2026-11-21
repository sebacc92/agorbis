import { component$ } from "@qwik.dev/core";
import { Button, Input, Select } from "~/components/ui";
import { ORGANIZATION_TYPES } from "~/lib/organization-directory";
import { translate, useLocale } from "~/lib/i18n";

export const OrganizationSearch = component$<{ query: string; type: string }>(
  ({ query, type }) => {
    const locale = useLocale();
    return (
      <form
        key={JSON.stringify([query, type])}
        method="get"
        role="search"
        aria-label={translate(locale, "Buscar institución")}
        class="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]"
      >
        <div class="min-w-0">
          <label
            for="institution-query"
            class="mb-1.5 block text-sm font-medium text-ink-strong"
          >
            {translate(locale, "Buscar institución")}
          </label>
          <Input
            id="institution-query"
            name="q"
            type="search"
            value={query}
            maxLength={120}
            placeholder={translate(locale, "Ej: Municipalidad, Defensoría…")}
            class="min-h-11"
          />
        </div>
        <div>
          <label
            for="institution-type"
            class="mb-1.5 block text-sm font-medium text-ink-strong"
          >
            {translate(locale, "Tipo de institución")}
          </label>
          <Select
            id="institution-type"
            name="tipo"
            value={type}
            class="min-h-11"
          >
            <option value="" selected={!type}>
              {translate(locale, "Todos los tipos")}
            </option>
            {Object.entries(ORGANIZATION_TYPES).map(([value, label]) => (
              <option key={value} value={value} selected={type === value}>
                {translate(locale, label)}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" class="min-h-11 w-full sm:w-auto">
          {translate(locale, "Buscar")}
        </Button>
      </form>
    );
  },
);
