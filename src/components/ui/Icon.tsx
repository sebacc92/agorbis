import { component$ } from "@qwik.dev/core";
import { cx } from "./cx";

/**
 * Íconos propios de la interfaz (D123).
 *
 * Los emojis hacían de íconos en pestañas, tipos de publicación, métricas y
 * estados vacíos: cada sistema operativo los dibuja distinto, no se tiñen con
 * el texto y pesan como juguete al lado de una palabra. Acá va un set chico
 * de trazos a 24 px, color heredado (`currentColor`), sin terceros ni CDN.
 * El emoji queda sólo donde es identidad elegida por la gente: comunidades
 * y perfiles.
 */
export type IconName =
  | "megaphone"
  | "ballot"
  | "chat"
  | "hammer"
  | "handshake"
  | "info"
  | "users"
  | "receipt"
  | "layers"
  | "map"
  | "map-pin"
  | "search"
  | "compass"
  | "home"
  | "plus"
  | "arrow-right"
  | "chevron-right"
  | "chevron-down"
  | "check"
  | "trophy"
  | "clock"
  | "sparkles"
  | "lock"
  | "alert"
  | "wrench"
  | "building"
  | "scale"
  | "globe"
  | "list"
  | "inbox"
  | "scroll"
  | "chart"
  | "utensils"
  | "masks"
  | "bulb"
  | "share"
  | "copy"
  | "send"
  | "bookmark"
  | "book-open"
  | "projector"
  | "flag"
  | "more"
  | "x"
  | "settings"
  | "star"
  | "bell"
  | "file-text"
  | "link"
  | "leaf"
  | "heart"
  | "bus"
  | "ball"
  | "shield"
  | "tag"
  | "cone"
  | "home-group"
  | "arrow-left"
  | "chevron-left"
  | "filter"
  | "droplet"
  | "printer"
  | "pin"
  | "quote"
  | "newspaper"
  | "image"
  | "truck"
  | "stamp"
  | "accessibility"
  | "minus"
  | "user"
  | "moon"
  | "corner-down-left"
  | "volume"
  | "stop";

/* Trazos propios en una grilla de 24, ancho de trazo 2, puntas redondeadas. */
const PATHS: Record<IconName, string> = {
  megaphone:
    "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm12-2.5a4 4 0 0 1 0 7M14 19l-2-4M8 14v4a1 1 0 0 0 1 1h1",
  ballot:
    "M4 10h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10Zm4 0 1.2-4.8A1 1 0 0 1 10.2 4.5h3.6a1 1 0 0 1 1 .7L16 10M3 14h18M9.5 7.5h5",
  chat: "M20 12a8 8 0 0 1-11.6 7.1L4 20l1.1-3.9A8 8 0 1 1 20 12ZM8.5 12h.01M12 12h.01M15.5 12h.01",
  hammer:
    "m14 6 4 4M3 21l8-8m2.5-9.5 3 3a2 2 0 0 1 0 2.8l-1.2 1.2-5.8-5.8 1.2-1.2a2 2 0 0 1 2.8 0ZM11 13l-3-3",
  handshake:
    "M4 11.5 7.5 8h3l2 2m-8.5 1.5 4 4a1.4 1.4 0 0 0 2-2l1 1a1.4 1.4 0 0 0 2-2l1 1a1.4 1.4 0 0 0 2-2l-4.5-4.5M20 11.5 16.5 8h-3M20 11.5l-3 3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5m0-8.5h.01",
  users:
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8.5v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.6a3.5 3.5 0 0 1 0 6.8",
  receipt:
    "M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Zm3 6h6m-6 4h6m-6 4h3",
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5",
  map: "M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4Zm0 0v14m6-11.5v14",
  "map-pin":
    "M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm10.5 3-5-5",
  compass:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5L14 14l-5.5 1.5L10 10l5.5-1.5Z",
  home: "m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9Z",
  plus: "M12 5v14M5 12h14",
  "arrow-right": "M4 12h16m-6-6 6 6-6 6",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
  check: "m5 12.5 4.5 4.5L19 7",
  trophy:
    "M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4m-4 3v3m-3.5 4h7M9 20l.5-3h5l.5 3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  sparkles:
    "m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 11 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6L5 15Z",
  lock: "M6 11h12v9a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-9Zm2 0V8a4 4 0 0 1 8 0v3m-4 4v2",
  alert:
    "M12 9v4m0 3.5h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
  wrench:
    "M14.5 6.5a4 4 0 0 0 5 5L21 10a6 6 0 0 1-8 8l-7.5 3-2.5-2.5 3-7.5a6 6 0 0 1 8-8l-2.5 2.5Z",
  building:
    "M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16m0-11h5a1 1 0 0 1 1 1v10M3 21h18M8 8h2m-2 4h2m-2 4h2m6-3h2m-2 4h2",
  scale:
    "M12 3v18m-7 0h14M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7Zm10 0-3 7a3 3 0 0 0 6 0l-3-7Z",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.5 3.5-5.5 3.5-9S14.5 5.5 12 3m0 18c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3M3 12h18",
  list: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01",
  inbox:
    "M4 13h4l1.5 2.5h5L16 13h4M4 13l2.5-7h11L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z",
  scroll:
    "M8 3h11a2 2 0 0 1 2 2v2H8m0-4a2 2 0 0 0-2 2v12m2-14v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1h3m2-9h8m-8 4h8",
  chart: "M4 20h16M7 16V9m5 7V4m5 12v-6",
  utensils: "M6 3v7a3 3 0 0 0 6 0V3M9 3v18m9-18c-1.7 0-3 2.7-3 6v4h3m0-10v18",
  masks:
    "M3 5c3 0 5-1 8-1v9a4 4 0 0 1-8 0V5Zm10-1c3 0 5 1 8 1v8a4 4 0 0 1-8 0V4ZM5.5 8h2m2.5 4.5c-.6.6-1.4 1-2.5 1s-1.9-.4-2.5-1M16.5 8h2m-3 4.5c.6.6 1.4 1 2.5 1s1.9-.4 2.5-1",
  bulb: "M9 18h6m-5 3h4M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.3 1 2.5h6c0-1.2.3-1.9 1-2.5A6 6 0 0 0 12 3Z",
  share: "M12 3v12m0-12 4 4m-4-4-4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6",
  copy: "M9 9h10v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9Zm-3 7H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  send: "m21 3-9 9m9-9-6 18-3-9-9-3 18-6Z",
  bookmark: "M6 4h12v17l-6-4-6 4V4Z",
  "book-open":
    "M12 6c-2-1.5-4.5-2-8-2v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2V4c-3.5 0-6 .5-8 2Zm0 0v14",
  projector:
    "M4 7h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm12 5a2 2 0 1 0 0-.01M6 12h4M7 17l-1 3m11-3 1 3",
  flag: "M5 21V4m0 0h13l-3 4.5L18 13H5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  x: "M6 6l12 12M18 6 6 18",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7.4 7.4 0 0 0-2-1.2L14.6 3H9.4L9 5.6a7.4 7.4 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7.4 7.4 0 0 0 2 1.2l.4 2.6h5.2l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z",
  bell: "M18 8.5a6 6 0 1 0-12 0c0 4.5-1.5 5.5-2 6.5h16c-.5-1-2-2-2-6.5ZM10 19a2 2 0 0 0 4 0",
  "file-text":
    "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M9 13h6m-6 4h6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1m2 7.7a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  leaf: "M5 20c0-9 5-15 15-15 0 10-5 15-14 15m-1 0c2-6 5-10 10-13",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z",
  bus: "M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12H5V5Zm0 6h14M8 20v-3m8 3v-3M8 14h.01M16 14h.01",
  ball: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13 3.5 2.5-1.3 4.2h-4.4L8.5 10.5 12 8Zm0-5v5m-3.5 2.5L4 9m11.5 1.5L20 9m-10.2 5.7L7.5 19m6.3-4.3L16.5 19",
  shield: "M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Zm-3 9 2 2 4-4",
  tag: "M3 12V4h8l9 9-8 8-9-9Zm4.5-4.5h.01",
  cone: "M9 4h6l4 14H5L9 4Zm-6 17h18M7.5 10h9M6.2 14.5h11.6",
  "home-group":
    "m2 12 5-4 5 4v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7Zm10 0 5-4 5 4v7a1 1 0 0 1-1 1h-8M6 20v-4h2v4",
  // Cuarta ronda (D126): la vuelta atrás y la paginación dejan el "←"
  // tipográfico; el resto reemplaza emojis de interfaz.
  "arrow-left": "M20 12H4m6-6-6 6 6 6",
  "chevron-left": "m15 6-6 6 6 6",
  filter: "M4 6h16M7 12h10M10 18h4",
  droplet: "M12 3.5C9.2 7 6 10.6 6 14a6 6 0 0 0 12 0c0-3.4-3.2-7-6-10.5Z",
  printer:
    "M7 9V4h10v5M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v6H7v-6Z",
  pin: "M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Zm3 10v7",
  quote: "M6 7h4v4c0 3-1.3 5-4 6M14 7h4v4c0 3-1.3 5-4 6M6 7v4h4m4-4v4h4",
  newspaper:
    "M4 5h13v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm13 4h3v10a1 1 0 0 1-1 1h-3M7 8.5h7V12H7V8.5ZM7 15h7m-7 2.5h4",
  image:
    "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 11 5-5 4 4 3-3 6 6M15.5 9.5h.01",
  truck:
    "M3 6h11v10H3V6Zm11 4h4l3 3v3h-7v-6ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  stamp: "M9 4h6v4l-1 4h5a1 1 0 0 1 1 1v3H4v-3a1 1 0 0 1 1-1h5l-1-4V4ZM5 20h14",
  // Controles globales: el ♿ del pie, la paleta y la bandeja de avisos.
  // `moon` y `user` son los trazos que ThemeToggle y BottomNav dibujaban a mano.
  accessibility:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM7.5 10.5l4.5 1 4.5-1M12 11.5v3m0 0-2 3.5m2-3.5 2 3.5",
  minus: "M5 12h14",
  user: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 10v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
  moon: "M20.4 14.2A8.4 8.4 0 0 1 9.8 3.6a8.4 8.4 0 1 0 10.6 10.6Z",
  "corner-down-left": "M20 5v7a3 3 0 0 1-3 3H5m4-4-4 4 4 4",
  volume: "M11 5 6 9H3v6h3l5 4V5Zm4.5 3.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13",
  stop: "M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z",
};

export const Icon = component$<{
  name: IconName;
  class?: string;
  /** Ancho de trazo: 2 por defecto; 1.5 para tamaños grandes. */
  stroke?: 1.5 | 2 | 2.5;
  /** Texto alternativo. Sin él, el ícono es decorativo. */
  label?: string;
}>(({ name, class: cls, stroke = 2, label }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width={stroke}
    stroke-linecap="round"
    stroke-linejoin="round"
    class={cx("inline-block size-[1em] shrink-0", cls)}
    role={label ? "img" : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : "true"}
  >
    <path d={PATHS[name]} />
  </svg>
));
