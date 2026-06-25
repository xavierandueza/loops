import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { State } from '../types.js';

const EMPTY_STATE: State = { seenCommentIds: [], seenReviewIds: [] };

export async function loadState(path: string): Promise<State> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as State;
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}
