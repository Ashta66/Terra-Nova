import { calculateZoomTilePlan } from "./terrain-preload-worker.js";

export function createTerrainPreloadCoordinator(options = {}) {
  const createWorker = options.createWorker ?? (() => {
    if (typeof Worker !== "function") return null;
    return new Worker(new URL("./terrain-preload-worker.js", import.meta.url), { type: "module" });
  });
  let worker = null;
  let disabled = false;
  let sequence = 0;
  let latestRequestId = 0;
  let latestRequest = null;

  function runFallback(request) {
    if (!request || request.requestId !== latestRequestId) return;
    try {
      request.onPlan(request.calculate(request.input), request.requestId);
    } catch (error) {
      request.onError?.(error);
    }
  }

  function disableWorker(error) {
    disabled = true;
    worker?.terminate?.();
    worker = null;
    if (error) options.onWorkerError?.(error);
    runFallback(latestRequest);
  }

  function ensureWorker() {
    if (disabled) return null;
    if (worker) return worker;
    try {
      worker = createWorker();
      if (!worker) {
        disabled = true;
        return null;
      }
      worker.addEventListener("message", event => {
        const message = event.data ?? {};
        const request = latestRequest;
        if (!request || message.requestId !== request.requestId
          || message.requestId !== latestRequestId) return;
        if (!Array.isArray(message.tileIds)) {
          disableWorker(new Error("Réponse invalide du worker de préchargement."));
          return;
        }
        request.onPlan(message.tileIds, request.requestId);
      });
      worker.addEventListener("error", error => disableWorker(error));
      return worker;
    } catch (error) {
      disabled = true;
      options.onWorkerError?.(error);
      return null;
    }
  }

  function request(input, onPlan, onError = null) {
    const requestId = ++sequence;
    latestRequestId = requestId;
    const requestData = {
      requestId, input, onPlan, onError,
      calculate: options.calculate ?? calculateZoomTilePlan
    };
    latestRequest = requestData;
    const activeWorker = ensureWorker();
    if (!activeWorker) {
      runFallback(requestData);
      return requestId;
    }
    try {
      activeWorker.postMessage({ requestId, input });
    } catch (error) {
      disableWorker(error);
    }
    return requestId;
  }

  return {
    request,
    isCurrent: requestId => requestId === latestRequestId,
    get workerActive() { return Boolean(worker) && !disabled; },
    dispose() {
      latestRequestId = ++sequence;
      latestRequest = null;
      worker?.terminate?.();
      worker = null;
      disabled = true;
    }
  };
}
