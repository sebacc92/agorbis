/**
 * Punto de entrada del catálogo inglés para el navegador.
 *
 * No lo importa ningún módulo de la app: `i18n.ts` lo referencia con
 * `?worker&url`, así Vite lo compila como un archivo aparte y sólo nos da su
 * URL. Ver el porqué en `i18n.ts`. Como Vite puede emitirlo en formato IIFE
 * (el formato por defecto de los workers), no exporta nada: deja el catálogo
 * en una global que `i18n.ts` lee y borra apenas termina de cargarlo.
 */
import { enMessages } from "../i18n/en";
import { CATALOG_GLOBAL } from "./i18n-catalogs";

(globalThis as Record<string, unknown>)[CATALOG_GLOBAL.en] = enMessages;
