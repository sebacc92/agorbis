export type PollFormType = "single" | "multiple" | "binary";

/** Cada modo conserva su lista; explorar una binaria no descarta opciones. */
export function changePollOptionMode(
  current: PollFormType,
  next: PollFormType,
  options: string[],
  listOptions: string[],
  binaryOptions: string[],
  defaults: [string, string],
) {
  const list = current === "binary" ? [...listOptions] : [...options];
  const binary =
    current === "binary" ? options.slice(0, 2) : [...binaryOptions];
  let selected =
    next === "binary"
      ? binary.length
        ? [...binary]
        : options.slice(0, 2)
      : list.length
        ? [...list]
        : [...options];
  if (next === "binary") {
    if (!selected[0]?.trim() && !selected[1]?.trim()) selected = [...defaults];
    while (selected.length < 2) selected.push("");
  } else {
    while (selected.length < 3) selected.push("");
  }
  return { options: selected, listOptions: list, binaryOptions: binary };
}
