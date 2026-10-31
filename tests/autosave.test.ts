import { describe, expect, it } from 'vitest';
import {
  AUTOSAVE_KEY,
  MAX_AGE_MS,
  clearAutosave,
  createMemoryStore,
  describeAge,
  readAutosave,
  writeAutosave,
} from '../src/core/autosave';

describe('autosave', () => {
  it('round-trips a snapshot', async () => {
    const store = createMemoryStore();
    const written = await writeAutosave(store, 'poster', '{"app":"reoo"}', 1_000);
    expect(written).toBe(true);

    const snapshot = await readAutosave(store, 2_000);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.name).toBe('poster');
    expect(snapshot?.savedAt).toBe(1_000);
    expect(snapshot?.project).toBe('{"app":"reoo"}');
  });

  it('returns null when nothing was written', async () => {
    expect(await readAutosave(createMemoryStore())).toBeNull();
  });

  it('ignores corrupt data', async () => {
    const store = createMemoryStore();
    await store.set(AUTOSAVE_KEY, 'not json at all');
    expect(await readAutosave(store)).toBeNull();

    await store.set(AUTOSAVE_KEY, JSON.stringify({ name: 'x' }));
    expect(await readAutosave(store)).toBeNull();
  });

  it('ignores snapshots older than the maximum age', async () => {
    const store = createMemoryStore();
    await writeAutosave(store, 'old', '{"app":"reoo"}', 0);
    expect(await readAutosave(store, MAX_AGE_MS + 1)).toBeNull();
    expect(await readAutosave(store, MAX_AGE_MS - 1)).not.toBeNull();
  });

  it('clears a snapshot', async () => {
    const store = createMemoryStore();
    await writeAutosave(store, 'x', '{}');
    await clearAutosave(store);
    expect(await readAutosave(store)).toBeNull();
  });

  it('survives a storage that throws', async () => {
    const broken = {
      get: async () => {
        throw new Error('quota');
      },
      set: async () => {
        throw new Error('quota');
      },
      remove: async () => {
        throw new Error('quota');
      },
    };
    expect(await writeAutosave(broken, 'x', '{}')).toBe(false);
    expect(await readAutosave(broken)).toBeNull();
    await expect(clearAutosave(broken)).resolves.toBeUndefined();
  });

  it('describes the age of a snapshot', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    expect(describeAge(now - 5_000, now)).toBe('a few seconds ago');
    expect(describeAge(now - 60_000, now)).toBe('1 minute ago');
    expect(describeAge(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(describeAge(now - 2 * 3_600_000, now)).toBe('2 hours ago');
  });
});
