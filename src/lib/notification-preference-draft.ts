import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCES,
} from "./notifications";

/** Un checkbox ausente en el POST es una elección apagada, no el valor guardado. */
export function notificationPreferenceDraft(
  saved: typeof DEFAULT_NOTIFICATION_PREFERENCES,
  posted?: FormData,
) {
  if (!posted) return { ...saved };
  const draft = { ...saved };
  for (const { key } of NOTIFICATION_PREFERENCES) draft[key] = posted.has(key);
  return draft;
}
