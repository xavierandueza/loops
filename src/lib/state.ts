import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { State } from '../types.js';

const EMPTY_STATE: State = {
  seenCommentIds: [],
  seenReviewIds: [],
  seenCIFailureIds: [],
};

export async function loadState(path: string): Promise<State> {
  try {
    const raw = await readFile(path, 'utf8');
    const state = JSON.parse(raw) as State;
    return {
      seenCommentIds: state.seenCommentIds ?? [],
      seenReviewIds: state.seenReviewIds ?? [],
      seenCIFailureIds: state.seenCIFailureIds ?? [],
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}
