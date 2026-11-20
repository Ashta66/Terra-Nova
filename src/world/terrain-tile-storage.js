const DATABASE_NAME = "terra-nova-terrain";
const DATABASE_VERSION = 1;
const STORE_NAME = "physical-tiles";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Échec de lecture IndexedDB."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction IndexedDB annulée."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Erreur de transaction IndexedDB."));
  });
}

export async function createTerrainTilePersistence(options = {}) {
  const indexedDBApi = options.indexedDB ?? globalThis.indexedDB;
  if (!indexedDBApi?.open) return null;

  const request = indexedDBApi.open(options.databaseName ?? DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  const database = await requestResult(request);
  const pendingByTile = new Map();

  async function loadAll(grid, tileSize) {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    await transactionDone(transaction);
    return records
      .filter(record => record.schemaVersion === 1 && record.gridWidth === grid.width
        && record.gridHeight === grid.height && record.tileSize === tileSize
        && record.values instanceof ArrayBuffer)
      .map(record => ({
        id: record.id, x: record.x, y: record.y, width: record.width, height: record.height,
        revision: record.revision, values: new Int16Array(record.values)
      }));
  }

  function saveTile(snapshot, grid, tileSize) {
    const previous = pendingByTile.get(snapshot.id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(async () => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(STORE_NAME).put({
        schemaVersion: 1,
        gridWidth: grid.width,
        gridHeight: grid.height,
        tileSize,
        id: snapshot.id,
        x: snapshot.x,
        y: snapshot.y,
        width: snapshot.width,
        height: snapshot.height,
        revision: snapshot.revision,
        values: snapshot.values.slice().buffer
      });
      await done;
      return snapshot.revision;
    });
    pendingByTile.set(snapshot.id, current);
    current.finally(() => {
      if (pendingByTile.get(snapshot.id) === current) pendingByTile.delete(snapshot.id);
    }).catch(() => {});
    return current;
  }

  async function flush() {
    await Promise.all([...pendingByTile.values()]);
  }

  return {
    loadAll,
    saveTile,
    flush,
    close() { database.close(); }
  };
}
