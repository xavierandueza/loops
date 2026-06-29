import { spawnSync } from 'child_process';
import type { InvokePi } from '../types.js';

export const invokePi: InvokePi = async (windowName, skillName, prompt, cwd) => {
  const result = spawnSync(
    'pix',
    [windowName, `/skill:${skillName} ${prompt}`],
    { cwd, stdio: 'inherit', encoding: 'utf8' },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pix exited with status ${result.status ?? 'unknown'}`);
  }
};
