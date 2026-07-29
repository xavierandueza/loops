import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prompts an existing Herdr Pi agent', async () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          result: { agent: { name: 'loops-pr-42-a1b2c3d4', agent: 'pi' } },
        }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>);

    await invokePi(
      'loops-pr-42-a1b2c3d4',
      'loops-pr-acme-myapp-42',
      'address-pr-comments',
      'Fix the thing',
      '/repo',
    );

    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'herdr',
      ['agent', 'prompt', 'loops-pr-42-a1b2c3d4', '/skill:address-pr-comments Fix the thing'],
      { cwd: '/repo', encoding: 'utf8' },
    );
  });

  it('creates a Herdr tab and Pi agent when the named agent does not exist', async () => {
    vi.stubEnv('HERDR_WORKSPACE_ID', 'w1');
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 1,
        stderr: JSON.stringify({ error: { code: 'agent_not_found', message: 'not found' } }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          result: {
            tab: { tab_id: 'w1:t2' },
            root_pane: { pane_id: 'w1:p2' },
          },
        }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValue({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>);

    await invokePi(
      'loops-pr-42-a1b2c3d4',
      'loops-pr-acme-myapp-42',
      'address-pr-comments',
      'Fix the thing',
      '/repo',
    );

    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'herdr',
      [
        'tab',
        'create',
        '--workspace',
        'w1',
        '--cwd',
        '/repo',
        '--label',
        'loops-pr-acme-myapp-42',
        '--no-focus',
      ],
      { cwd: '/repo', encoding: 'utf8' },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      3,
      'herdr',
      [
        'agent',
        'start',
        'loops-pr-42-a1b2c3d4',
        '--kind',
        'pi',
        '--pane',
        'w1:p2',
        '--',
        '--session-id',
        'loops-pr-acme-myapp-42',
      ],
      { cwd: '/repo', encoding: 'utf8' },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      4,
      'herdr',
      ['agent', 'prompt', 'loops-pr-42-a1b2c3d4', '/skill:address-pr-comments Fix the thing'],
      { cwd: '/repo', encoding: 'utf8' },
    );
  });

  it('closes a newly created tab when Pi fails to start', async () => {
    vi.stubEnv('HERDR_WORKSPACE_ID', 'w1');
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 1,
        stderr: JSON.stringify({ error: { code: 'agent_not_found', message: 'not found' } }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          result: {
            tab: { tab_id: 'w1:t2' },
            root_pane: { pane_id: 'w1:p2' },
          },
        }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 1,
        stderr: JSON.stringify({ error: { code: 'agent_start_failed', message: 'start failed' } }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>);

    await expect(
      invokePi(
        'loops-pr-42-a1b2c3d4',
        'loops-pr-acme-myapp-42',
        'address-pr-comments',
        'Fix the thing',
        '/repo',
      ),
    ).rejects.toThrow('start failed');

    expect(spawnSync).toHaveBeenNthCalledWith(
      4,
      'herdr',
      ['tab', 'close', 'w1:t2'],
      { cwd: '/repo', encoding: 'utf8' },
    );
  });

  it('closes a newly created tab when the initial prompt fails', async () => {
    vi.stubEnv('HERDR_WORKSPACE_ID', 'w1');
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 1,
        stderr: JSON.stringify({ error: { code: 'agent_not_found', message: 'not found' } }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify({
          result: {
            tab: { tab_id: 'w1:t2' },
            root_pane: { pane_id: 'w1:p2' },
          },
        }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 1,
        stderr: JSON.stringify({ error: { code: 'agent_prompt_failed', message: 'prompt failed' } }),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 0, stdout: '{}' } as ReturnType<typeof spawnSync>);

    await expect(
      invokePi(
        'loops-pr-42-a1b2c3d4',
        'loops-pr-acme-myapp-42',
        'address-pr-comments',
        'Fix the thing',
        '/repo',
      ),
    ).rejects.toThrow('prompt failed');

    expect(spawnSync).toHaveBeenNthCalledWith(
      5,
      'herdr',
      ['tab', 'close', 'w1:t2'],
      { cwd: '/repo', encoding: 'utf8' },
    );
  });

  it('requires a Herdr workspace when creating an agent', async () => {
    vi.stubEnv('HERDR_WORKSPACE_ID', '');
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stderr: JSON.stringify({ error: { code: 'agent_not_found', message: 'not found' } }),
    } as ReturnType<typeof spawnSync>);

    await expect(
      invokePi('loops-pr-42-a1b2c3d4', 'loops-pr-acme-myapp-42', 'address-pr-comments', 'prompt', '/repo'),
    ).rejects.toThrow('HERDR_WORKSPACE_ID is required');
  });

  it('refuses to prompt a named agent that is not Pi', async () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({
        result: { agent: { name: 'loops-pr-42-a1b2c3d4', agent: 'codex' } },
      }),
    } as ReturnType<typeof spawnSync>);

    await expect(
      invokePi('loops-pr-42-a1b2c3d4', 'loops-pr-acme-myapp-42', 'address-pr-comments', 'prompt', '/repo'),
    ).rejects.toThrow('is not a Pi agent');

    expect(spawnSync).toHaveBeenCalledTimes(1);
  });
});
