/**
 * Crash recovery. The editor stashes the project JSON in IndexedDB every few
 * seconds while there are unsaved changes, so a closed tab, a crashed browser
 * or a dead battery does not destroy the work.
 *
 * The storage layer is a tiny interface so the logic is testable without a
 * browser and degrades to memory when IndexedDB is unavailable (private mode).
 */

export interface AutosaveStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface AutosaveSnapshot {
  name: string;
  savedAt: number;
  project: string;
}

export const AUTOSAVE_KEY = 'reoo:autosave';
/** Snapshots older than this are treated as abandoned and ignored. */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const AUTOSAVE_INTERVAL_MS = 20_000;

export function createMemoryStore(): AutosaveStore {
  const data = new Map<string, string>();
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

interface IdbStoreLike extends AutosaveStore {
  readonly kind: 'indexeddb';
}

function createIndexedDbStore(): IdbStoreLike | null {
  if (typeof indexedDB === 'undefined') return null;
  const dbName = 'reoo';
  const storeName = 'kv';
  let dbPromise: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    });
    return dbPromise;
  };

  const run = <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const transaction = db.transaction(storeName, mode);
          const request = action(transaction.objectStore(storeName));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
        }),
    );

  return {
    kind: 'indexeddb',
    get: (key) => run<string | undefined>('readonly', (store) => store.get(key)).then((v) => v ?? null),
    set: (key, value) => run('readwrite', (store) => store.put(value, key)).then(() => undefined),
    remove: (key) => run('readwrite', (store) => store.delete(key)).then(() => undefined),
  };
}

/** IndexedDB when it works, an in-memory map otherwise. */
export function createAutosaveStore(): AutosaveStore {
  try {
    return createIndexedDbStore() ?? createMemoryStore();
  } catch {
    return createMemoryStore();
  }
}

export async function writeAutosave(
  store: AutosaveStore,
  name: string,
  project: string,
  now: number = Date.now(),
): Promise<boolean> {
  const snapshot: AutosaveSnapshot = { name, savedAt: now, project };
  try {
    await store.set(AUTOSAVE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export async function readAutosave(
  store: AutosaveStore,
  now: number = Date.now(),
): Promise<AutosaveSnapshot | null> {
  let raw: string | null = null;
  try {
    raw = await store.get(AUTOSAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: Partial<AutosaveSnapshot>;
  try {
    parsed = JSON.parse(raw) as Partial<AutosaveSnapshot>;
  } catch {
    return null;
  }

  if (
    typeof parsed.project !== 'string' ||
    typeof parsed.name !== 'string' ||
    typeof parsed.savedAt !== 'number'
  ) {
    return null;
  }
  if (!Number.isFinite(parsed.savedAt) || now - parsed.savedAt > MAX_AGE_MS) return null;

  return { name: parsed.name, savedAt: parsed.savedAt, project: parsed.project };
}

export async function clearAutosave(store: AutosaveStore): Promise<void> {
  try {
    await store.remove(AUTOSAVE_KEY);
  } catch {
    // Losing the cleanup is harmless: stale snapshots expire on their own.
  }
}

/** Human-readable age used in the restore prompt. */
export function describeAge(savedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return 'a few seconds ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}
