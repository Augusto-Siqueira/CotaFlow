// Armazenamento do celular para o modo offline (IndexedDB), sem dependências.
// Duas "gavetas":
//   kv     dados de apoio guardados para uso sem sinal (placas, cargas...)
//   outbox fila de lançamentos aguardando envio (com as fotos)

const DB_NAME = "cotaflow-offline";
const DB_VERSION = 1;
export type Store = "kv" | "outbox";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador não guarda dados offline."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Falha ao abrir o armazenamento."));
    };
  });
  return dbPromise;
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error("Falha ao gravar no armazenamento."));
        tx.onabort = () => reject(tx.error ?? new Error("Gravação cancelada (sem espaço?)."));
      })
  );
}

export const idbGet = <T>(store: Store, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: Store, value: unknown) => run(store, "readwrite", (s) => s.put(value));
export const idbDelete = (store: Store, key: string) => run(store, "readwrite", (s) => s.delete(key));
export const idbAll = <T>(store: Store) => run<T[]>(store, "readonly", (s) => s.getAll());
