import type { RequestEventAction } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  supabase: vi.fn(),
  createAdminSupabase: vi.fn(),
  uploadImage: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  logFailure: vi.fn(),
}));

vi.mock("./session", () => ({
  requireUser: mocks.requireUser,
  supabase: mocks.supabase,
}));
vi.mock("./supabase", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));
vi.mock("./log", () => ({ logFailure: mocks.logFailure }));
vi.mock("./uploads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./uploads")>()),
  uploadImage: mocks.uploadImage,
}));

import { updateProfile } from "./profile-page";

const owner = "33333333-3333-4333-8333-333333333333";
const oldPath = `${owner}/11111111-1111-4111-8111-111111111111.png`;
const newPath = `${owner}/22222222-2222-4222-8222-222222222222.png`;
const ev = () =>
  ({
    locale: () => "es",
    fail: (status: number, payload: object) => ({ failed: true, status, ...payload }),
  }) as unknown as RequestEventAction;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({
    userId: owner,
    profile: { avatar_url: `/media/avatares/${oldPath}` },
  });
  mocks.supabase.mockReturnValue({ from: () => ({ update: mocks.update }) });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ single: mocks.single });
  mocks.single.mockResolvedValue({ data: { id: owner }, error: null });
  mocks.createAdminSupabase.mockReturnValue({
    storage: { from: () => ({ remove: mocks.remove }) },
    rpc: mocks.rpc,
  });
  mocks.uploadImage.mockResolvedValue({ url: null, path: null, error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("quitar y reemplazar el avatar del perfil", () => {
  it("confirma la actualización con RLS antes de limpiar el archivo propio", async () => {
    expect(await updateProfile({ username: "sofia_mdq", remove_avatar: "si" }, ev()))
      .toEqual({ saved: true });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: null }));
    expect(mocks.eq).toHaveBeenCalledWith("id", owner);
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(mocks.single.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0]);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith([oldPath]);
    expect(mocks.rpc).toHaveBeenCalledWith("release_avatar_upload", { p_owner: owner, p_path: oldPath });
  });

  it.each([
    { data: null, error: { code: "42501", message: "permission denied" } },
    { data: null, error: null },
  ])("conserva el archivo si la base rechaza o no confirma la fila: %j", async (result) => {
    mocks.single.mockResolvedValue(result);
    expect(await updateProfile({ username: "sofia_mdq", remove_avatar: "si" }, ev()))
      .toMatchObject({ failed: true });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("no borra archivos ajenos ni fotos externas", async () => {
    for (const url of [
      "/media/avatares/44444444-4444-4444-8444-444444444444/11111111-1111-4111-8111-111111111111.png",
      "https://example.com/provider-photo.png",
    ]) {
      mocks.requireUser.mockResolvedValue({ userId: owner, profile: { avatar_url: url } });
      expect(await updateProfile({ username: "sofia_mdq", remove_avatar: "si" }, ev()))
        .toEqual({ saved: true });
    }
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rechaza una petición que pide subir y quitar a la vez antes de tocar datos", async () => {
    expect(await updateProfile({
      username: "sofia_mdq",
      remove_avatar: "si",
      avatar: new File(["image"], "avatar.png", { type: "image/png" }),
    }, ev())).toMatchObject({
      failed: true,
      status: 400,
      message: "Elegí subir una foto nueva o quitar la actual, no ambas cosas.",
    });
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("mantiene la foto desvinculada aunque falle la limpieza y no libera la reserva", async () => {
    mocks.remove.mockResolvedValue({ error: { message: "Storage unavailable" } });
    expect(await updateProfile({ username: "sofia_mdq", remove_avatar: "si" }, ev()))
      .toEqual({ saved: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logFailure).toHaveBeenCalled();
  });

  it("limpia sólo el nuevo archivo al fallar un reemplazo", async () => {
    mocks.uploadImage.mockResolvedValue({ url: `/media/avatares/${newPath}`, path: newPath, error: null });
    mocks.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect(await updateProfile({ username: "sofia_mdq" }, ev()))
      .toMatchObject({
        failed: true,
        message: "Ese nombre de usuario ya está tomado.",
        fieldErrors: { username: "Ese nombre de usuario ya está tomado." },
      });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([newPath]);
    expect(mocks.rpc).toHaveBeenCalledWith("release_avatar_upload", { p_owner: owner, p_path: newPath });
  });
});
