/** Conserva el texto de un POST rechazado también cuando no hay borrador local. */
export function postedText(
  formData: FormData | undefined,
  name: string,
  fallback = "",
): string {
  const value = formData?.get(name);
  return typeof value === "string" ? value : fallback;
}

export function postedTexts(
  formData: FormData | undefined,
  name: string,
  fallback: string[],
): string[] {
  const values = formData
    ?.getAll(name)
    .filter((value) => typeof value === "string");
  return values?.length ? values : [...fallback];
}
