import { spawnSync, type SpawnSyncReturns } from 'child_process';
import type { InvokePi } from '../types.js';

type HerdrError = {
  error?: {
    code?: string;
    message?: string;
  };
};

type HerdrAgentResponse = {
  result?: {
    agent?: {
      agent?: string;
      name?: string;
    };
  };
};

type HerdrTabResponse = {
  result?: {
    tab?: {
      tab_id?: string;
    };
    root_pane?: {
      pane_id?: string;
    };
  };
};

function parseJson<T>(command: string, value: string | null | undefined): T {
  try {
    return JSON.parse(value ?? '') as T;
  } catch {
    throw new Error(`${command} returned invalid JSON`);
  }
}

function assertSpawnSucceeded(command: string, result: SpawnSyncReturns<string>): void {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = parseJson<HerdrError>(command, result.stderr);
    throw new Error(error.error?.message ?? `${command} exited with status ${result.status ?? 'unknown'}`);
  }
}

export const invokePi: InvokePi = async (agentName, sessionId, skillName, prompt, cwd) => {
  const message = `/skill:${skillName} ${prompt}`;
  let createdTabId: string | undefined;
  const agentResult = spawnSync('herdr', ['agent', 'get', agentName], {
    cwd,
    encoding: 'utf8',
  });

  if (agentResult.error) throw agentResult.error;

  if (agentResult.status === 0) {
    const response = parseJson<HerdrAgentResponse>('herdr agent get', agentResult.stdout);
    if (response.result?.agent?.agent !== 'pi') {
      throw new Error(`Herdr agent ${agentName} is not a Pi agent`);
    }
  } else {
    const error = parseJson<HerdrError>('herdr agent get', agentResult.stderr);
    if (error.error?.code !== 'agent_not_found') {
      throw new Error(
        error.error?.message ??
          `herdr agent get exited with status ${agentResult.status ?? 'unknown'}`,
      );
    }

    const workspaceId = process.env.HERDR_WORKSPACE_ID;
    if (!workspaceId) {
      throw new Error('HERDR_WORKSPACE_ID is required to create a Pi agent');
    }

    const tabResult = spawnSync(
      'herdr',
      [
        'tab',
        'create',
        '--workspace',
        workspaceId,
        '--cwd',
        cwd,
        '--label',
        sessionId,
        '--no-focus',
      ],
      { cwd, encoding: 'utf8' },
    );
    assertSpawnSucceeded('herdr tab create', tabResult);

    const tab = parseJson<HerdrTabResponse>('herdr tab create', tabResult.stdout);
    const tabId = tab.result?.tab?.tab_id;
    const paneId = tab.result?.root_pane?.pane_id;
    if (!tabId || !paneId) {
      throw new Error('herdr tab create response did not include tab and root pane IDs');
    }
    createdTabId = tabId;

    const startResult = spawnSync(
      'herdr',
      [
        'agent',
        'start',
        agentName,
        '--kind',
        'pi',
        '--pane',
        paneId,
        '--',
        '--session-id',
        sessionId,
      ],
      { cwd, encoding: 'utf8' },
    );
    try {
      assertSpawnSucceeded('herdr agent start', startResult);
    } catch (error) {
      spawnSync('herdr', ['tab', 'close', tabId], { cwd, encoding: 'utf8' });
      throw error;
    }
  }

  const promptResult = spawnSync('herdr', ['agent', 'prompt', agentName, message], {
    cwd,
    encoding: 'utf8',
  });
  try {
    assertSpawnSucceeded('herdr agent prompt', promptResult);
  } catch (error) {
    if (createdTabId) {
      spawnSync('herdr', ['tab', 'close', createdTabId], { cwd, encoding: 'utf8' });
    }
    throw error;
  }
};
