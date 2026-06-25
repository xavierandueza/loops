import { spawnSync } from 'child_process';
import type { InvokePi } from '../types.js';

export const invokePi: InvokePi = async (sessionId, skillPath, prompt, cwd) => {
  const result = spawnSync(
    'pi',
    ['-p', '--session-id', sessionId, '--skill', skillPath, prompt],
    { cwd, stdio: 'inherit', encoding: 'utf8' },
  );

  if (result.error) throw result.error;
};
