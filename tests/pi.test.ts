import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import { invokePi } from '../src/lib/pi.js';

vi.mock('child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('invokePi', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
  });

  it('dispatches a pix window with a session ID and the named skill prompt', async () => {
    await invokePi(
      'loops-pr-acme-myapp-42',
      'loops-pr-acme-myapp-42',
      'address-pr-comments',
      'Fix the thing',
      '/repo',
    );

    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'pix',
      [
        '--session-id',
        'loops-pr-acme-myapp-42',
        'loops-pr-acme-myapp-42',
        '/skill:address-pr-comments Fix the thing',
      ],
      { cwd: '/repo', stdio: 'inherit', encoding: 'utf8' },
    );
  });

  it('posts the skill prompt to an existing tmux window instead of creating another one', async () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0, stdout: 'other-window\nloops-pr-acme-myapp-42\n' } as ReturnType<typeof spawnSync>)
      .mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    await invokePi(
      'loops-pr-acme-myapp-42',
      'loops-pr-acme-myapp-42',
      'address-pr-comments',
      'Fix the thing',
      '/repo',
    );

    expect(spawnSync).not.toHaveBeenCalledWith('pix', expect.anything(), expect.anything());
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'tmux',
      ['send-keys', '-l', '-t', 'loops-pr-acme-myapp-42', '/skill:address-pr-comments Fix the thing'],
      { cwd: '/repo', stdio: 'inherit', encoding: 'utf8' },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      'tmux',
      ['send-keys', '-t', 'loops-pr-acme-myapp-42', 'Enter'],
      { cwd: '/repo', stdio: 'inherit', encoding: 'utf8' },
    );
  });

  it('throws spawn errors', async () => {
    const error = new Error('pix not found');
    vi.mocked(spawnSync).mockReturnValue({ error } as ReturnType<typeof spawnSync>);

    await expect(invokePi('window', 'session', 'address-pr-comments', 'prompt', '/repo')).rejects.toThrow(error);
  });

  it('throws when pix exits unsuccessfully', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);

    await expect(invokePi('window', 'session', 'address-pr-comments', 'prompt', '/repo')).rejects.toThrow(
      'pix exited with status 1',
    );
  });
});
