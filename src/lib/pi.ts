import { spawnSync, type SpawnSyncReturns } from 'child_process';
import type { InvokePi } from '../types.js';

function assertSpawnSucceeded(command: string, result: SpawnSyncReturns<string>): void {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
  }
}

export const invokePi: InvokePi = async (windowName, sessionId, skillName, prompt, cwd) => {
  const message = `/skill:${skillName} ${prompt}`;
  const windows = spawnSync('tmux', ['list-windows', '-F', '#{window_name}'], {
    cwd,
    encoding: 'utf8',
  });

  if (windows.error) throw windows.error;
  const windowExists =
    windows.status === 0 && (windows.stdout ?? '').split('\n').some((name) => name === windowName);

  if (windowExists) {
    const sendMessage = spawnSync(
      'tmux',
      ['send-keys', '-l', '-t', windowName, message],
      { cwd, stdio: 'inherit', encoding: 'utf8' },
    );
    assertSpawnSucceeded('tmux send-keys', sendMessage);

    const submitMessage = spawnSync('tmux', ['send-keys', '-t', windowName, 'Enter'], {
      cwd,
      stdio: 'inherit',
      encoding: 'utf8',
    });
    assertSpawnSucceeded('tmux send-keys', submitMessage);
    return;
  }

  const result = spawnSync(
    'pix',
    ['--session-id', sessionId, windowName, message],
    { cwd, stdio: 'inherit', encoding: 'utf8' },
  );
  assertSpawnSucceeded('pix', result);
};
