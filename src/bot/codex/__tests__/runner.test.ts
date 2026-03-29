import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';
import * as core from '@actions/core';
import { CodexRunner, MissingConfigurationError } from '../runner';

jest.mock('fs');
jest.mock('os');
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
}));
jest.mock('@actions/core', () => ({
  info: jest.fn(),
}));

describe('CodexRunner', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key', PATH: '/usr/bin' };
    (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
    (os.homedir as jest.Mock).mockReturnValue('/home/tester');
    (fs.mkdirSync as jest.Mock).mockImplementation(() => undefined);
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (spawnSync as jest.Mock).mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails clearly when no OpenAI key is configured', async () => {
    delete process.env.OPENAI_API_KEY;

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(MissingConfigurationError);
  });

  it('uses a stricter specification prompt for epic splitting', async () => {
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse:
        '{"tasks":[{"title":"Spec 1: Data Model","specMarkdown":"# Feature: Data Model"},{"title":"Spec 2: Output Marker","specMarkdown":"# Feature: Output Marker"},{"title":"Spec 3: Verification","specMarkdown":"# Feature: Verification"}]}',
      items: [],
    });
    await runner.generateEpicSplit('Epic', 'Spec');

    expect(executeSpy).toHaveBeenCalledWith(
      expect.stringContaining('You must always return at least 3 child features'),
      expect.any(Object),
      'strong',
      expect.any(Object)
    );
    expect(executeSpy.mock.calls[0][0]).toContain('Do not return an empty array.');
    expect(executeSpy.mock.calls[0][0]).toContain('The `tasks` array must contain 3 to 5 items.');
    expect(executeSpy.mock.calls[0][0]).toContain('Use this visible issue title pattern exactly: "Epic / Spec NN: <Short Child Scope>"');
    expect(executeSpy.mock.calls[0][0]).toContain('ready to be stored under `specs/`');
    expect(executeSpy.mock.calls[0][0]).toContain('Do not merely restate or lightly rephrase the parent issue.');
    expect(executeSpy.mock.calls[0][0]).toContain('Each child spec must include binary acceptance criteria that can be judged as satisfied or not satisfied.');
    expect(executeSpy.mock.calls[0][0]).toContain('If a child spec includes conditional work, you must explicitly define the no-op condition.');
    expect(executeSpy.mock.calls[0][0]).toContain('Each `specMarkdown` must contain explicit verification expectations.');
    expect(executeSpy.mock.calls[0][0]).toContain('Return only valid JSON with no markdown fences and no commentary.');
  });

  it('uses Codex CLI for structured planning prompts', async () => {
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"action":"plan","content":"# Plan"}',
      items: [{ type: 'agent_message' }],
    });
    const result = await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(result).toEqual({ action: 'plan', content: '# Plan' });
    expect(executeSpy).toHaveBeenCalledWith(
      expect.stringContaining('You must read and obey `AGENTS.md`'),
      expect.any(Object),
      'fast',
      expect.objectContaining({
        OPENAI_API_KEY: 'test-key',
        PATH: '/usr/bin',
      })
    );
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Prompt begin');
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Command: ready for planning'));
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Prompt end');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Turn items begin');
    expect(core.info).toHaveBeenCalledWith(JSON.stringify({ type: 'agent_message' }));
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Turn items end');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Final response begin');
    expect(core.info).toHaveBeenCalledWith('{"action":"plan","content":"# Plan"}');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Final response end');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Structured output source: output-last-message');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_API_KEY length: 8');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_API_KEY prefix looks like OpenAI key: no');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_BASE_URL: https://adesso-ai-hub.3asabc.de/v1');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Resolved model: gpt-5-mini');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Resolved sandbox: workspace-write');
    expect(executeSpy.mock.calls[0][0]).toContain('ready to be stored under `plans/`');
  });

  it('asks Codex to gather repository context itself for implementation', async () => {
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse:
        '{"status":"completed","summary":"Done","changedFiles":["src/foo.ts"],"acceptanceCriteria":[{"criterion":"Feature fully implemented","status":"satisfied","evidence":"All in-scope changes completed"}],"verification":[{"command":"npm test","status":"passed","details":"All required checks passed"}],"remainingWork":[],"blockers":[]}',
      items: [],
    });
    const result = await runner.implementFeature('Feature', 'Spec body', '# Plan', 'strong');

    expect(result).toEqual({
      status: 'completed',
      summary: 'Done',
      changedFiles: ['src/foo.ts'],
      acceptanceCriteria: [{ criterion: 'Feature fully implemented', status: 'satisfied', evidence: 'All in-scope changes completed' }],
      verification: [{ command: 'npm test', status: 'passed', details: 'All required checks passed' }],
      remainingWork: [],
      blockers: [],
    });
    expect(executeSpy.mock.calls[0][0]).toContain('Gather the context you need from the local repository');
    expect(executeSpy.mock.calls[0][0]).toContain('=== FEATURE SPEC ===');
    expect(executeSpy.mock.calls[0][0]).toContain('=== IMPLEMENTATION PLAN ===');
    expect(executeSpy.mock.calls[0][0]).toContain('# Plan');
    expect(executeSpy.mock.calls[0][0]).toContain('Implement the feature directly in the local repository');
    expect(executeSpy.mock.calls[0][0]).toContain('implement the full in-scope feature');
    expect(executeSpy.mock.calls[0][0]).toContain('A partial implementation is not a successful implementation.');
    expect(executeSpy.mock.calls[0][0]).toContain('Missing verification tools do not excuse skipping implementable code changes.');
    expect(executeSpy.mock.calls[0][0]).toContain('You must complete all unblocked in-scope implementation work before returning `status` = `blocked`.');
    expect(executeSpy.mock.calls[0][0]).toContain('You must evaluate the acceptance criteria one by one before finishing.');
    expect(executeSpy.mock.calls[0][0]).toContain('- `status`: one of `completed`, `partial`, or `blocked`');
    expect(executeSpy.mock.calls[0][0]).toContain('- `acceptanceCriteria`: array of objects with `criterion`, `status`, and `evidence`');
  });

  it('retries edit tasks once when Codex only returns agent messages without workspace activity', async () => {
    const runner = new CodexRunner();
    const executeSpy = jest
      .spyOn(runner as any, 'executeStructuredTurn')
      .mockResolvedValueOnce({
        finalResponse:
          '{"status":"completed","summary":"Claimed","changedFiles":["src/foo.ts"],"acceptanceCriteria":[{"criterion":"Feature fully implemented","status":"satisfied","evidence":"Claimed only"}],"verification":[{"command":"npm test","status":"not_run","details":"Not shown"}],"remainingWork":[],"blockers":[]}',
        items: [{ type: 'agent_message', text: 'I changed src/foo.ts' }],
      })
      .mockResolvedValueOnce({
        finalResponse:
          '{"status":"completed","summary":"Done","changedFiles":["src/foo.ts"],"acceptanceCriteria":[{"criterion":"Feature fully implemented","status":"satisfied","evidence":"Implemented in workspace"}],"verification":[{"command":"git status --short","status":"passed","details":"Workspace change confirmed"}],"remainingWork":[],"blockers":[]}',
        items: [
          { type: 'command', command: 'git status --short' },
          {
            type: 'agent_message',
            text: '{"status":"completed","summary":"Done","changedFiles":["src/foo.ts"],"acceptanceCriteria":[{"criterion":"Feature fully implemented","status":"satisfied","evidence":"Implemented in workspace"}],"verification":[{"command":"git status --short","status":"passed","details":"Workspace change confirmed"}],"remainingWork":[],"blockers":[]}',
          },
        ],
      });

    const result = await runner.implementFeature('Feature', 'Spec body', '# Plan', 'strong');

    expect(result).toEqual({
      status: 'completed',
      summary: 'Done',
      changedFiles: ['src/foo.ts'],
      acceptanceCriteria: [{ criterion: 'Feature fully implemented', status: 'satisfied', evidence: 'Implemented in workspace' }],
      verification: [{ command: 'git status --short', status: 'passed', details: 'Workspace change confirmed' }],
      remainingWork: [],
      blockers: [],
    });
    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(executeSpy.mock.calls[1][0]).toContain('=== RETRY GUARD ===');
    expect(executeSpy.mock.calls[1][0]).toContain('You must inspect and edit files directly in the workspace before returning the final JSON.');
    expect(core.info).toHaveBeenCalledWith(
      '[CodexRunner] Edit run produced only agent messages. Retrying once with a stricter workspace-edit instruction.'
    );
  });

  it('forbids follow-up questions during rework and refinement flows', async () => {
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"summary":"Done","changedFiles":["src/foo.ts"]}',
      items: [{ type: 'command', command: 'git status --short' }],
    });

    await runner.applyReviewRework('Feature', 'Spec body', '# Plan', 'file=src/foo.ts line=12: simplify this', 'fast');
    await runner.applyReviewRefinement('Feature', 'Spec body', '# Plan', 'make the message warmer', 'fast');

    expect(executeSpy.mock.calls[0][0]).toContain('If the review feedback targets persisted repository artifacts under `plans/` or `specs/`, those files are explicitly in scope for this run and should be edited directly.');
    expect(executeSpy.mock.calls[0][0]).toContain('Do not summarize the branch, the PR, or the planned work.');
    expect(executeSpy.mock.calls[0][0]).toContain('Make the requested file edits directly in the workspace.');
    expect(executeSpy.mock.calls[0][0]).toContain('array of relative file paths you actually changed during this run');
    expect(executeSpy.mock.calls[0][0]).toContain('Do not ask clarifying questions.');
    expect(executeSpy.mock.calls[0][0]).toContain('If the feedback is insufficient or ambiguous, fail instead of asking follow-up questions.');
    expect(executeSpy.mock.calls[1][0]).toContain('If the refinement instruction targets persisted repository artifacts under `plans/` or `specs/`, those files are explicitly in scope for this run and should be edited directly.');
    expect(executeSpy.mock.calls[1][0]).toContain('Do not summarize the branch, the PR, or the planned work.');
    expect(executeSpy.mock.calls[1][0]).toContain('Make the requested file edits directly in the workspace.');
    expect(executeSpy.mock.calls[1][0]).toContain('array of relative file paths you actually changed during this run');
    expect(executeSpy.mock.calls[1][0]).toContain('Do not ask clarifying questions.');
    expect(executeSpy.mock.calls[1][0]).toContain('If the refinement instruction is insufficient or ambiguous, fail instead of asking follow-up questions.');
  });

  it('surfaces Codex SDK failures', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockRejectedValue(new Error('codex failed hard'));

    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow('codex failed hard');
  });

  it('fails clearly when Codex returns a non-JSON final message', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: 'not json',
      items: [],
    });
    await expect(runner.generateImplementationPlan('Feature', 'Body', false, 'fast')).rejects.toThrow(
      'Codex returned a non-JSON final message.'
    );
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Raw output-last-message begin');
    expect(core.info).toHaveBeenCalledWith('not json');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Raw output-last-message end');
  });

  it('accepts fenced JSON from the final response', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse:
        '```json\n{"tasks":[{"title":"Spec 1: Data Model","specMarkdown":"# Feature: Data Model"},{"title":"Spec 2: Output Marker","specMarkdown":"# Feature: Output Marker"},{"title":"Spec 3: Verification","specMarkdown":"# Feature: Verification"}]}\n```',
      items: [],
    });
    await expect(runner.generateEpicSplit('Epic', 'Spec')).resolves.toEqual([
      { title: 'Epic / Spec 01: Data Model', specMarkdown: '# Feature: Data Model' },
      { title: 'Epic / Spec 02: Output Marker', specMarkdown: '# Feature: Output Marker' },
      { title: 'Epic / Spec 03: Verification', specMarkdown: '# Feature: Verification' },
    ]);
  });

  it('normalizes generated child issue titles into a visible shared pattern', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse:
        '{"tasks":[{"title":"Spec 7: Add Banner Rendering","specMarkdown":"# Feature: Add Banner Rendering"},{"title":"Verification","specMarkdown":"# Feature: Verification"},{"title":"Test feature","specMarkdown":"# Feature: Cleanup"}]}',
      items: [],
    });

    await expect(runner.generateEpicSplit('Test feature', 'Spec')).resolves.toEqual([
      { title: 'Test feature / Spec 01: Add Banner Rendering', specMarkdown: '# Feature: Add Banner Rendering' },
      { title: 'Test feature / Spec 02: Verification', specMarkdown: '# Feature: Verification' },
      { title: 'Test feature / Spec 03: Cleanup', specMarkdown: '# Feature: Cleanup' },
    ]);
  });

  it('extracts JSON from fenced output when present', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '```json\n{"action":"plan","content":"# Plan"}\n```',
      items: [],
    });
    await expect(runner.generateImplementationPlan('Feature', 'Body', false, 'fast')).resolves.toEqual({
      action: 'plan',
      content: '# Plan',
    });
  });

  it('fills in sensible environment defaults for the Codex subprocess', async () => {
    process.env = { OPENAI_API_KEY: 'test-key' } as NodeJS.ProcessEnv;
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"action":"plan","content":"# Plan"}',
      items: [],
    });
    await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(executeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      'fast',
      expect.objectContaining({
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'https://adesso-ai-hub.3asabc.de/v1',
        PATH: expect.stringContaining('/usr/bin'),
        HOME: '/home/tester',
        TMPDIR: '/tmp',
        TMP: '/tmp',
        TEMP: '/tmp',
        CODEX_HOME: '/home/tester/.codex',
        NO_COLOR: '1',
      })
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true });
    expect(fs.mkdirSync).toHaveBeenCalledWith('/home/tester/.codex', { recursive: true });
  });

  it('preserves an explicitly configured OpenAI base URL', async () => {
    process.env = {
      OPENAI_API_KEY: 'sk-test-key',
      OPENAI_BASE_URL: 'https://custom.example/v1',
      PATH: '/usr/bin',
    } as NodeJS.ProcessEnv;
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"action":"plan","content":"# Plan"}',
      items: [],
    });
    await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(executeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      'fast',
      expect.objectContaining({
        OPENAI_BASE_URL: 'https://custom.example/v1',
      })
    );
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_BASE_URL: https://custom.example/v1');
  });

  it('trims the OpenAI API key before passing it to Codex', async () => {
    process.env = { OPENAI_API_KEY: '  sk-test-key  ', PATH: '/usr/bin' } as NodeJS.ProcessEnv;
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"action":"plan","content":"# Plan"}',
      items: [],
    });
    await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(executeSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      'fast',
      expect.objectContaining({
        OPENAI_API_KEY: 'sk-test-key',
      })
    );
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_API_KEY prefix looks like OpenAI key: yes');
  });

  it('surfaces empty final responses as non-json failures', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '',
      items: [],
    });
    await expect(runner.generateImplementationPlan('Feature', 'Body', false, 'fast')).rejects.toThrow(
      'Codex returned a non-JSON final message.'
    );
  });

  it('maps configured model tiers to allowed Adesso model ids', () => {
    const runner = new CodexRunner() as any;
    expect(runner.resolveModel('fast')).toBe('gpt-5-mini');
    expect(runner.resolveModel('strong')).toBe('US-gpt-5.3-codex');
  });

  it('uses an explicit sandbox override when configured', async () => {
    process.env = {
      OPENAI_API_KEY: 'test-key',
      PATH: '/usr/bin',
      CODEX_SANDBOX_MODE: 'danger-full-access',
    } as NodeJS.ProcessEnv;
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"action":"plan","content":"# Plan"}',
      items: [],
    });

    await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(executeSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Object), 'fast', expect.any(Object));
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Resolved sandbox: danger-full-access');
    expect((runner as any).resolveSandboxMode()).toBe('danger-full-access');
  });

  it('rejects empty arrays for epic split results', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"tasks":[]}',
      items: [],
    });
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      'Codex returned an empty result array.'
    );
  });

  it('rejects empty required strings in array items', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"tasks":[{"title":"","specMarkdown":"# Feature: Spec 1"}]}',
      items: [],
    });
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      'Codex returned an invalid array item: `title` must be a non-empty string.'
    );
  });

  it('uses a locally available Codex CLI when present', () => {
    (fs.existsSync as jest.Mock).mockImplementation((value: string) => value === '/repo/node_modules/@openai/codex/bin/codex.js');
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/repo');
    const runner = new CodexRunner() as any;

    expect(runner.ensureCodexCliAvailable({ OPENAI_API_KEY: 'test-key' })).toBe('/repo/node_modules/@openai/codex/bin/codex.js');
    expect(spawnSync).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Using Codex CLI at /repo/node_modules/@openai/codex/bin/codex.js');

    cwdSpy.mockRestore();
  });

  it('provisions a temp Codex CLI runtime when no local binary is available', () => {
    let runtimeCliSeen = false;
    (fs.existsSync as jest.Mock).mockImplementation((value: string) => {
      if (value === '/tmp/agentic-shortbox-codex-cli/0.117.0/node_modules/@openai/codex/bin/codex.js') {
        if (!runtimeCliSeen) {
          runtimeCliSeen = true;
          return false;
        }
        return true;
      }
      return false;
    });
    const runner = new CodexRunner() as any;

    expect(runner.ensureCodexCliAvailable({ OPENAI_API_KEY: 'test-key', PATH: '/usr/bin' })).toBe(
      '/tmp/agentic-shortbox-codex-cli/0.117.0/node_modules/@openai/codex/bin/codex.js'
    );
    expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/agentic-shortbox-codex-cli/0.117.0', { recursive: true });
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['install', '--no-save', '--prefix', '/tmp/agentic-shortbox-codex-cli/0.117.0', '@openai/codex@0.117.0'],
      expect.objectContaining({
        encoding: 'utf8',
        env: expect.objectContaining({
          OPENAI_API_KEY: 'test-key',
          PATH: '/usr/bin',
          npm_config_registry: 'https://registry.npmjs.org',
        }),
      })
    );
    expect(core.info).toHaveBeenCalledWith(
      '[CodexRunner] Using provisioned Codex CLI at /tmp/agentic-shortbox-codex-cli/0.117.0/node_modules/@openai/codex/bin/codex.js'
    );
  });
});
