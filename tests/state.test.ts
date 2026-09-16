import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadState, saveState } from '../src/lib/state.js';

describe('state persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'loops-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('returns empty state when file does not exist', async () => {
    const state = await loadState(join(tmpDir, 'nonexistent.json'));
    expect(state).toEqual({
      seenCommentIds: [],
      seenReviewIds: [],
      seenCIFailureIds: [],
    });
  });

  it('persists and reloads state correctly', async () => {
    const path = join(tmpDir, 'state.json');
    await saveState(path, {
      seenCommentIds: [1, 2, 3],
      seenReviewIds: [99],
      seenCIFailureIds: ['check:123'],
    });
    const loaded = await loadState(path);
    expect(loaded).toEqual({
      seenCommentIds: [1, 2, 3],
      seenReviewIds: [99],
      seenCIFailureIds: ['check:123'],
    });
  });

  it('loads state files created before CI failure tracking was added', async () => {
    const path = join(tmpDir, 'state.json');
    writeFileSync(path, JSON.stringify({ seenCommentIds: [1], seenReviewIds: [2] }));

    const loaded = await loadState(path);

    expect(loaded.seenCIFailureIds).toEqual([]);
  });

  it('persists seen comments and CI failures across process restarts', async () => {
    const path = join(tmpDir, 'state.json');
    await saveState(path, {
      seenCommentIds: [123, 456],
      seenReviewIds: [789],
      seenCIFailureIds: ['status:100'],
    });

    const reloaded = await loadState(path);
    expect(reloaded.seenCommentIds).toContain(123);
    expect(reloaded.seenCommentIds).toContain(456);
    expect(reloaded.seenReviewIds).toContain(789);
    expect(reloaded.seenCIFailureIds).toContain('status:100');
  });

  it('creates parent directories if they do not exist', async () => {
    const path = join(tmpDir, 'nested', 'deep', 'state.json');
    await saveState(path, {
      seenCommentIds: [1],
      seenReviewIds: [],
      seenCIFailureIds: [],
    });
    const loaded = await loadState(path);
    expect(loaded.seenCommentIds).toEqual([1]);
  });
});
