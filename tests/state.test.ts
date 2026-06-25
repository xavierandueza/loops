import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
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
    expect(state).toEqual({ seenCommentIds: [], seenReviewIds: [] });
  });

  it('persists and reloads state correctly', async () => {
    const path = join(tmpDir, 'state.json');
    await saveState(path, { seenCommentIds: [1, 2, 3], seenReviewIds: [99] });
    const loaded = await loadState(path);
    expect(loaded).toEqual({ seenCommentIds: [1, 2, 3], seenReviewIds: [99] });
  });

  it('does not re-process seen comments after process restart', async () => {
    const path = join(tmpDir, 'state.json');
    await saveState(path, { seenCommentIds: [123, 456], seenReviewIds: [789] });

    // Simulate a restart by reloading from disk
    const reloaded = await loadState(path);
    expect(reloaded.seenCommentIds).toContain(123);
    expect(reloaded.seenCommentIds).toContain(456);
    expect(reloaded.seenReviewIds).toContain(789);
  });

  it('creates parent directories if they do not exist', async () => {
    const path = join(tmpDir, 'nested', 'deep', 'state.json');
    await saveState(path, { seenCommentIds: [1], seenReviewIds: [] });
    const loaded = await loadState(path);
    expect(loaded.seenCommentIds).toEqual([1]);
  });
});
