/**
 * Tipos de dominio que PostgreSQL representa como `text` con CHECK constraints.
 *
 * `database.types.ts` se genera íntegramente con Supabase y no se edita a mano.
 * Estos alias permanecen separados para que `pnpm db.types` sea reproducible y
 * no borre los tipos estrechos que usa la interfaz.
 */
import type {
  Database,
  Tables as GeneratedTables,
  TablesInsert,
  TablesUpdate,
} from "./database.types";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  GeneratedTables<T>;
export type InsertDto<T extends keyof Database["public"]["Tables"]> =
  TablesInsert<T>;
export type UpdateDto<T extends keyof Database["public"]["Tables"]> =
  TablesUpdate<T>;
export type FnReturns<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]["Returns"];

export type PollType = "single" | "multiple" | "binary";
export type PollCategory =
  | "comunidad"
  | "ambiente"
  | "salud"
  | "educacion"
  | "transporte"
  | "cultura"
  | "deportes"
  | "economia"
  | "tecnologia"
  | "seguridad";
export type PollStatus = "active" | "closed" | "removed";
export type ResultsVisibility = "after_close";
export type DebateStatus = "open" | "closed" | "removed";
export type ContentStatus = "visible" | "removed";
export type ClaimStatus =
  | "open"
  | "under_review"
  | "acknowledged"
  | "in_progress"
  | "resolved"
  | "rejected"
  | "removed";
export type ProjectStatus =
  "proposal" | "funding" | "in_progress" | "completed" | "removed";
export type UserRole = "user" | "moderator" | "admin";
export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";
export type ReportTargetType =
  "debate_comment" | "claim" | "project" | "poll" | "debate" | "agreement";
/** Los cuatro tipos que consumen cuota mensual. */
export type ContentType = "poll" | "debate" | "claim" | "project";
export type InfoCategory =
  | "historia"
  | "cultura"
  | "geografia"
  | "economia"
  | "gastronomia"
  | "simbolo"
  | "dato_curioso";
export type ClaimCategory =
  | "infraestructura"
  | "servicios"
  | "seguridad"
  | "salud"
  | "educacion"
  | "ambiente"
  | "transporte"
  | "otro";
