import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
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
      agent_status?: string;
      name?: string;
      pane_id?: string;
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

function readPiSubmitKey(): string {
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi', 'agent');
  const path = join(agentDir, 'keybindings.json');
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'enter';
    throw error;
  }

  const keybindings = parseJson<Record<string, unknown>>(path, contents);
  const submit = keybindings['tui.input.submit'];
  const keys = Array.isArray(submit) ? submit : [submit];
  const firstKey = keys.find((key): key is string => typeof key === 'string');
  if (!firstKey || keys.includes('enter')) return 'enter';
  return firstKey;
}

function submitPrompt(agentName: string, paneId: string | undefined, message: string, submitKey: string, cwd: string): void {
  if (submitKey === 'enter') {
    const promptResult = spawnSync('herdr', ['agent', 'prompt', agentName, message], {
      cwd,
      encoding: 'utf8',
    });
    assertSpawnSucceeded('herdr agent prompt', promptResult);
    return;
  }

  // `herdr agent prompt` always submits with Enter, so paste the text and send Pi's submit key ourselves.
  if (!paneId) throw new Error(`Herdr agent ${agentName} did not report a pane ID`);
  // Stripping ESC stops message content from ending the bracketed paste early.
  const pastedMessage = `\x1b[200~${message.replaceAll('\x1b', '')}\x1b[201~`;
  const textResult = spawnSync('herdr', ['pane', 'send-text', paneId, pastedMessage], {
    cwd,
    encoding: 'utf8',
  });
  assertSpawnSucceeded('herdr pane send-text', textResult);

  const keyResult = spawnSync('herdr', ['agent', 'send-keys', agentName, submitKey], {
    cwd,
    encoding: 'utf8',
  });
  assertSpawnSucceeded('herdr agent send-keys', keyResult);
}

export const invokePi: InvokePi = async (agentName, sessionId, skillName, prompt, cwd) => {
  const message = `/skill:${skillName} ${prompt}`;
  const submitKey = readPiSubmitKey();
  let createdTabId: string | undefined;
  let paneId: string | undefined;
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
    if (response.result.agent.agent_status === 'blocked') {
      throw new Error(`Herdr agent ${agentName} is blocked`);
    }
    paneId = response.result.agent.pane_id;
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
    paneId = tab.result?.root_pane?.pane_id;
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

  try {
    submitPrompt(agentName, paneId, message, submitKey, cwd);
  } catch (error) {
    if (createdTabId) {
      spawnSync('herdr', ['tab', 'close', createdTabId], { cwd, encoding: 'utf8' });
    }
    throw error;
  }
};
