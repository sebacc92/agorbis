import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const DEFAULT_TERMINATION_GRACE_MS = 5_000;

export class ExceptionalCutoverChildProcessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExceptionalCutoverChildProcessError";
    this.code = code;
  }
}

function childProcessError(code, message) {
  return new ExceptionalCutoverChildProcessError(code, message);
}

// This is deliberately only a process-lifecycle primitive. It does not decide
// whether a release command is authorized. The OPEN and recovery runners keep
// their exact-plan validation private and call this only after those checks.
export async function runExceptionalCutoverChildProcess({
  command,
  arguments: arguments_,
  stepId,
  env,
  cwd,
  spawnImpl = spawn,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  terminationGraceMs = DEFAULT_TERMINATION_GRACE_MS,
  abortSignal,
  killProcessGroupImpl = process.kill.bind(process),
  inheritedLockDescriptor,
} = {}) {
  if (
    typeof command !== "string" ||
    command.length === 0 ||
    !Array.isArray(arguments_) ||
    typeof stepId !== "string" ||
    stepId.length === 0 ||
    typeof cwd !== "string" ||
    cwd.length === 0 ||
    !env ||
    typeof env !== "object" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isFinite(terminationGraceMs) ||
    terminationGraceMs <= 0
  ) {
    throw childProcessError(
      "INVALID_CHILD_PROCESS_INPUT",
      "El proceso hijo excepcional recibió parámetros inválidos.",
    );
  }
  await new Promise((resolvePromise, rejectPromise) => {
    let child;
    try {
      if (
        inheritedLockDescriptor !== undefined &&
        (!Number.isSafeInteger(inheritedLockDescriptor) ||
          inheritedLockDescriptor < 3)
      ) {
        throw new Error();
      }
      child = spawnImpl(command, arguments_, {
        cwd,
        env,
        shell: false,
        stdio:
          inheritedLockDescriptor === undefined
            ? "ignore"
            : ["ignore", "ignore", "ignore", inheritedLockDescriptor],
        windowsHide: true,
        detached: true,
      });
    } catch {
      rejectPromise(childProcessError("STEP_FAILED", `Falló ${stepId}.`));
      return;
    }
    if (!Number.isSafeInteger(child?.pid) || child.pid <= 1) {
      try {
        child?.kill?.("SIGKILL");
      } catch {
        // El proceso queda incierto y nunca se habilita rollback concurrente.
      }
      rejectPromise(
        childProcessError(
          "PROCESS_GROUP_UNCERTAIN",
          `No se pudo aislar el grupo de ${stepId}.`,
        ),
      );
      return;
    }
    const processGroupId = -child.pid;
    let completed = false;
    let childClosed = false;
    let closeResult = null;
    let terminationReason = null;
    let terminationTimer = null;
    let groupPollTimer = null;
    const groupExists = () => {
      try {
        killProcessGroupImpl(processGroupId, 0);
        return true;
      } catch (error) {
        if (error?.code === "ESRCH") return false;
        return true;
      }
    };
    const clearTimers = () => {
      clearTimeout(timeoutTimer);
      if (terminationTimer !== null) clearTimeout(terminationTimer);
      if (groupPollTimer !== null) clearTimeout(groupPollTimer);
    };
    const finishIfQuiescent = () => {
      if (completed || !childClosed || groupExists()) return false;
      completed = true;
      clearTimers();
      abortSignal?.removeEventListener?.("abort", onAbort);
      if (terminationReason !== null) {
        rejectPromise(
          childProcessError(terminationReason.code, terminationReason.message),
        );
      } else if (closeResult.code === 0 && closeResult.signal === null) {
        resolvePromise();
      } else {
        rejectPromise(childProcessError("STEP_FAILED", `Falló ${stepId}.`));
      }
      return true;
    };
    const pollGroup = () => {
      if (finishIfQuiescent() || completed) return;
      groupPollTimer = setTimeout(pollGroup, 25);
    };
    const terminateGroup = (code, message) => {
      if (terminationReason === null) {
        terminationReason = { code, message };
        try {
          killProcessGroupImpl(processGroupId, "SIGTERM");
        } catch (error) {
          if (error?.code !== "ESRCH") {
            terminationReason = {
              code: "PROCESS_GROUP_UNCERTAIN",
              message: `No se pudo detener con certeza ${stepId}.`,
            };
          }
        }
        terminationTimer = setTimeout(() => {
          if (completed || !groupExists()) return;
          try {
            killProcessGroupImpl(processGroupId, "SIGKILL");
          } catch (error) {
            if (error?.code !== "ESRCH") {
              terminationReason = {
                code: "PROCESS_GROUP_UNCERTAIN",
                message: `No se pudo terminar con certeza ${stepId}.`,
              };
            }
          }
        }, terminationGraceMs);
      }
      pollGroup();
    };
    const onAbort = () => {
      terminateGroup("STEP_INTERRUPTED", `Se interrumpió ${stepId}.`);
    };
    const timeoutTimer = setTimeout(() => {
      if (completed) return;
      terminateGroup("STEP_TIMEOUT", `Timeout en ${stepId}.`);
    }, timeoutMs);
    timeoutTimer.unref?.();
    abortSignal?.addEventListener?.("abort", onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();
    child.once("error", () => {
      if (completed || terminationReason !== null) return;
      completed = true;
      clearTimers();
      abortSignal?.removeEventListener?.("abort", onAbort);
      rejectPromise(childProcessError("STEP_FAILED", `Falló ${stepId}.`));
    });
    child.once("close", (code, signal) => {
      if (completed) return;
      childClosed = true;
      closeResult = { code, signal };
      if (groupExists()) {
        terminateGroup(
          "STEP_DESCENDANTS_PRESENT",
          `${stepId} dejó procesos descendientes activos.`,
        );
      } else {
        finishIfQuiescent();
      }
    });
  });
}
