import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { CodexRunner, MissingConfigurationError } from '../runner';

jest.mock('fs');
jest.mock('os');
jest.mock('child_process');

describe('CodexRunner', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
    (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
    (fs.mkdtempSync as jest.Mock).mockReturnValue('/tmp/codex-runner-123');
    (fs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
    (fs.rmSync as jest.Mock).mockImplementation(() => undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails clearly when no OpenAI key is configured', async () => {
    delete process.env.OPENAI_API_KEY;

    const runner = new CodexRunner();
    await expect(runner.generateEpicSplit('Epic', 'Spec')).rejects.toThrow(MissingConfigurationError);
  });

  it('uses Codex CLI for structured planning prompts', async () => {
    (spawnSync as jest.Mock).mockReturnValue({ status: 0, stdout: '', stderr: '' });
    (fs.readFileSync as jest.Mock).mockReturnValue('{"action":"plan","content":"# Plan"}');

    const runner = new CodexRunner();
    const result = await runner.generateImplementationPlan('Feature', 'Body', false, 'fast');

    expect(result).toEqual({ action: 'plan', content: '# Plan' });
    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringContaining('node_modules/.bin/codex'),
      expect.arrayContaining(['exec', '-', '--output-schema', '/tmp/codex-runner-123/schema.json', '--output-last-message', '/tmp/codex-runner-123/output.json', '--model', 'codex-mini-latest']),
      expect.objectContaining({
        cwd: process.cwd(),
        input: expect.stringContaining('You must read and obey `AGENTS.md`'),
      })
    );
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
  });
});
