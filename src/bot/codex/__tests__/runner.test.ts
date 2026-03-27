import fs from 'fs';
import os from 'os';
import * as core from '@actions/core';
import { CodexRunner, MissingConfigurationError } from '../runner';

jest.mock('fs');
jest.mock('os');
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
      finalResponse: '[{"title":"Spec 1","specMarkdown":"# Feature: Spec 1"}]',
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
    expect(executeSpy.mock.calls[0][0]).toContain('The array must contain 3 to 5 items.');
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
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Structured output source: output-last-message');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_API_KEY length: 8');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_API_KEY prefix looks like OpenAI key: no');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] OPENAI_BASE_URL: https://adesso-ai-hub.3asabc.de/v1');
  });

  it('asks Codex to gather repository context itself for implementation', async () => {
    const runner = new CodexRunner();
    const executeSpy = jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '{"summary":"Done","changedFiles":["src/foo.ts"]}',
      items: [],
    });
    const result = await runner.implementFeature('Feature', 'Spec body', '# Plan', 'strong');

    expect(result).toEqual({ summary: 'Done', changedFiles: ['src/foo.ts'] });
    expect(executeSpy.mock.calls[0][0]).toContain('Gather the context you need from the local repository');
    expect(executeSpy.mock.calls[0][0]).toContain('=== FEATURE SPEC ===');
    expect(executeSpy.mock.calls[0][0]).toContain('=== IMPLEMENTATION PLAN ===');
    expect(executeSpy.mock.calls[0][0]).toContain('# Plan');
    expect(executeSpy.mock.calls[0][0]).toContain('Implement the feature directly in the local repository');
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
      finalResponse: '```json\n[{"title":"Spec 1","specMarkdown":"# Feature: Spec 1"}]\n```',
      items: [],
    });
    await expect(runner.generateEpicSplit('Epic', 'Spec')).resolves.toEqual([
      { title: 'Spec 1', specMarkdown: '# Feature: Spec 1' },
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

  it('rejects empty arrays for epic split results', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '[]',
      items: [],
    });
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      'Codex returned an empty result array.'
    );
  });

  it('rejects empty required strings in array items', async () => {
    const runner = new CodexRunner();
    jest.spyOn(runner as any, 'executeStructuredTurn').mockResolvedValue({
      finalResponse: '[{"title":"","specMarkdown":"# Feature: Spec 1"}]',
      items: [],
    });
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      'Codex returned an invalid array item: `title` must be a non-empty string.'
    );
  });
});
