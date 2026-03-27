import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import * as core from '@actions/core';
import { CodexRunner, MissingConfigurationError } from '../runner';

jest.mock('fs');
jest.mock('os');
jest.mock('child_process');
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
    (fs.mkdtempSync as jest.Mock).mockReturnValue('/tmp/codex-runner-123');
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
    (fs.rmSync as jest.Mock).mockImplementation(() => undefined);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
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
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('[{"title":"Spec 1","specMarkdown":"# Feature: Spec 1"}]');

    const runner = new CodexRunner();
    await runner.generateEpicSplit('Epic', 'Spec');

    const spawnCall = (spawnSync as jest.Mock).mock.calls[0];
    expect(spawnCall[2].input).toContain('You must always return at least 3 child features');
    expect(spawnCall[2].input).toContain('Do not return an empty array.');
    expect(spawnCall[2].input).toContain('The array must contain 3 to 5 items.');
    expect(spawnCall[2].input).toContain('Return only valid JSON with no markdown fences and no commentary.');
  });

  it('uses Codex CLI for structured planning prompts', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('{"action":"plan","content":"# Plan"}');

    const runner = new CodexRunner();
    const result = await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(result).toEqual({ action: 'plan', content: '# Plan' });
    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringContaining('node_modules/.bin/codex'),
      expect.arrayContaining(['exec', '-', '--output-last-message', '/tmp/codex-runner-123/output.json', '--model', 'codex-mini-latest']),
      expect.objectContaining({
        cwd: process.cwd(),
        env: expect.objectContaining({
          OPENAI_API_KEY: 'test-key',
          PATH: '/usr/bin',
        }),
        input: expect.stringContaining('You must read and obey `AGENTS.md`'),
      })
    );
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Prompt begin');
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Command: ready for planning'));
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Prompt end');
  });

  it('asks Codex to gather repository context itself for implementation', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('{"summary":"Done","changedFiles":["src/foo.ts"]}');

    const runner = new CodexRunner();
    const result = await runner.implementFeature('Feature', 'Spec body', '# Plan', 'strong');

    expect(result).toEqual({ summary: 'Done', changedFiles: ['src/foo.ts'] });
    const spawnCall = (spawnSync as jest.Mock).mock.calls[0];
    expect(spawnCall[2].input).toContain('Gather the context you need from the local repository');
    expect(spawnCall[2].input).toContain('=== FEATURE SPEC ===');
    expect(spawnCall[2].input).toContain('=== IMPLEMENTATION PLAN ===');
    expect(spawnCall[2].input).toContain('# Plan');
    expect(spawnCall[2].input).toContain('Implement the feature directly in the local repository');
  });

  it('surfaces Codex execution failures', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 1, stdout: '', stderr: 'codex failed hard' });

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow('codex failed hard');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Codex stderr begin');
    expect(core.info).toHaveBeenCalledWith('codex failed hard');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Codex stderr end');
  });

  it('surfaces only the tail of long Codex logs', async () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n');
    (spawnSync as jest.Mock).mockReturnValue({ status: 1, stdout: lines, stderr: '' });

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      Array.from({ length: 20 }, (_, index) => `line ${index + 11}`).join('\n')
    );
  });

  it('surfaces Codex spawn failures with the underlying error message', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: null, stdout: '', stderr: '', error: new Error('spawn ENOENT') });

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow('Failed to start Codex CLI: spawn ENOENT');
  });

  it('falls back to the packaged codex.js entrypoint when .bin/codex is unavailable', async () => {
    (fs.existsSync as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('{"action":"plan","content":"# Plan"}');

    const runner = new CodexRunner();
    await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([expect.stringContaining('node_modules/@openai/codex/bin/codex.js'), 'exec', '-']),
      expect.any(Object)
    );
  });

  it('fails clearly when Codex CLI is not installed in the checkout', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      'Codex CLI is not available in this checkout. Ensure project dependencies are installed and `@openai/codex` is present before running the action.'
    );
  });

  it('fails clearly when Codex returns a non-JSON final message', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('not json');

    const runner = new CodexRunner();
    await expect(runner.generateImplementationPlan('Feature', 'Body', false, 'fast')).rejects.toThrow(
      'Codex returned a non-JSON final message.'
    );
  });

  it('falls back to JSON found in stdout when the final message file is empty', async () => {
    (spawnSync as jest.Mock).mockReturnValue({
      status: 0,
      stdout: 'Some logs before\n[{"title":"Spec 1","specMarkdown":"# Feature: Spec 1"}]\n',
      stderr: '',
    });
    (fs.readFileSync as jest.Mock).mockReturnValue('');

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).resolves.toEqual([
      { title: 'Spec 1', specMarkdown: '# Feature: Spec 1' },
    ]);
  });

  it('extracts JSON from fenced output when present', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('```json\n{"action":"plan","content":"# Plan"}\n```');

    const runner = new CodexRunner();
    await expect(runner.generateImplementationPlan('Feature', 'Body', false, 'fast')).resolves.toEqual({
      action: 'plan',
      content: '# Plan',
    });
  });

  it('fills in sensible environment defaults for the Codex subprocess', async () => {
    process.env = { OPENAI_API_KEY: 'test-key' } as NodeJS.ProcessEnv;
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('{"action":"plan","content":"# Plan"}');

    const runner = new CodexRunner();
    await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(spawnSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          OPENAI_API_KEY: 'test-key',
          PATH: expect.stringContaining('/usr/bin'),
          HOME: '/home/tester',
          TMPDIR: '/tmp',
          TMP: '/tmp',
          TEMP: '/tmp',
          CODEX_HOME: '/home/tester/.codex',
          NO_COLOR: '1',
        }),
      })
    );
  });

  it('fails clearly when Codex does not write the output-last-message file', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: 'codex ran', stderr: '' });
    (fs.existsSync as jest.Mock)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    const runner = new CodexRunner();
    await expect(runner.generateImplementationPlan('Feature', 'Body', false, 'fast')).rejects.toThrow(
      'Codex finished without writing the expected output-last-message file.'
    );
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Codex stdout begin');
    expect(core.info).toHaveBeenCalledWith('codex ran');
    expect(core.info).toHaveBeenCalledWith('[CodexRunner] Codex stdout end');
  });

  it('rejects empty arrays for epic split results', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('[]');

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      'Codex returned an empty result array.'
    );
  });

  it('rejects empty required strings in array items', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('[{"title":"","specMarkdown":"# Feature: Spec 1"}]');

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(
      'Codex returned an invalid array item: `title` must be a non-empty string.'
    );
  });
});
