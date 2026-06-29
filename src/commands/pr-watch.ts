import { homedir } from 'os';
import { join } from 'path';
import { createFetcher, parsePRUrl } from '../lib/github.js';
import { loadState, saveState } from '../lib/state.js';
import { processPollCycle } from '../lib/poll-cycle.js';
import { invokePi } from '../lib/pi.js';

const POLL_INTERVAL_MS = 30_000;

function stateFilePath(owner: string, repo: string, number: number): string {
  return join(homedir(), '.loops', 'state', `pr-${owner}-${repo}-${number}.json`);
}

export async function prWatch(prUrl: string): Promise<void> {
  const { owner, repo, number } = parsePRUrl(prUrl);
  const fetcher = createFetcher();
  const statePath = stateFilePath(owner, repo, number);
  const cwd = process.cwd();

  const prInfo = await fetcher.getPR(owner, repo, number);
  console.log(`Watching PR #${number}: ${prInfo.title}`);
  console.log(`State: ${statePath}`);
  console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s — Ctrl+C to stop\n`);

  const poll = async () => {
    let state = await loadState(statePath);
    try {
      const result = await processPollCycle(fetcher, prInfo, state, invokePi, cwd);
      console.log(`Found ${result.newCommentCount} new comment(s)`);
      if (result.dispatchedAgentCount > 0) {
        console.log(`Successfully sent ${result.dispatchedAgentCount} agent(s) out`);
      }
      if (result.state !== state) {
        await saveState(statePath, result.state);
        state = result.state;
      }
    } catch (err) {
      console.error('Poll cycle error:', err);
    }
  };

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}
