import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import * as core from '@actions/core';

export interface EpicSplitTask {
  title: string;
  specMarkdown: string;
}

export interface PlanResult {
  action: 'plan' | 'question';
  content: string;
}

export interface CodexEditResult {
  summary: string;
  changedFiles: string[];
}

export class MissingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingConfigurationError';
  }
}

interface CodexTaskContext {
  commandName: string;
  featureTitle: string;
  featureSpec: string;
  implementationPlan?: string;
  commandInstruction: string;
  outputContract: string;
}

interface CodexCliCommand {
  executable: string;
  args: string[];
}

export class CodexRunner {
  async generateEpicSplit(title: string, body: string, modelConf: string = 'strong'): Promise<EpicSplitTask[]> {
    return this.runStructuredTask<EpicSplitTask[]>(
      {
        commandName: 'ready for specification',
        featureTitle: title,
        featureSpec: body || 'No issue body provided.',
        commandInstruction: [
          'Split this parent issue into 3 to 5 isolated child features.',
          'For each child feature, produce a GitHub issue title and a markdown body that follows `specs/templates/feature-spec.md` exactly.',
          'Do not implement code and do not modify repository files.',
        ].join('\n'),
        outputContract: [
          'Return a JSON array.',
          'Each item must include:',
          '- `title`: string',
          '- `specMarkdown`: string following `specs/templates/feature-spec.md`',
        ].join('\n'),
      },
      {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'specMarkdown'],
          properties: {
            title: { type: 'string' },
            specMarkdown: { type: 'string' },
          },
        },
      },
      modelConf
    );
  }

  async generateImplementationPlan(title: string, body: string, force: boolean, modelConf: string = 'strong'): Promise<PlanResult> {
    return this.runStructuredTask<PlanResult>(
      {
        commandName: 'ready for planning',
        featureTitle: title,
        featureSpec: body || 'No issue body provided.',
        commandInstruction: force
          ? [
              'Create a complete implementation plan now.',
              'Read `plans/templates/implementation-plan.md` and follow its structure.',
              'Do not ask clarifying questions.',
            ].join('\n')
          : [
              'Decide whether the feature is specific enough to plan.',
              'If it is specific enough, create a complete implementation plan using `plans/templates/implementation-plan.md`.',
              'If it is not specific enough, ask concise clarifying questions instead.',
            ].join('\n'),
        outputContract: [
          'Return a JSON object with:',
          '- `action`: either `plan` or `question`',
          '- `content`: the markdown plan or the clarification questions',
        ].join('\n'),
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'content'],
        properties: {
          action: { type: 'string', enum: ['plan', 'question'] },
          content: { type: 'string' },
        },
      },
      modelConf
    );
  }

  async implementFeature(title: string, featureSpec: string, implementationPlan: string, modelConf: string = 'strong'): Promise<CodexEditResult> {
    return this.runStructuredTask<CodexEditResult>(
      {
        commandName: 'ready for implementation',
        featureTitle: title,
        featureSpec,
        implementationPlan,
        commandInstruction: [
          'Implement the feature directly in the local repository.',
          'You are responsible for gathering your own code context from the repository before editing anything.',
          'Inspect the existing code, understand the relevant modules, and then make the smallest coherent set of code changes needed.',
          'Do not edit `specs/`, `plans/`, `docs/`, or `AGENTS.md` unless the feature explicitly requires it.',
        ].join('\n'),
        outputContract: [
          'Return a JSON object with:',
          '- `summary`: short summary of what you implemented',
          '- `changedFiles`: array of relative file paths you changed',
        ].join('\n'),
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'changedFiles'],
        properties: {
          summary: { type: 'string' },
          changedFiles: { type: 'array', items: { type: 'string' } },
        },
      },
      modelConf
    );
  }

  async applyReviewRework(title: string, featureSpec: string, implementationPlan: string, feedback: string, modelConf: string = 'strong'): Promise<CodexEditResult> {
    return this.runStructuredTask<CodexEditResult>(
      {
        commandName: 'ready for rework',
        featureTitle: title,
        featureSpec,
        implementationPlan,
        commandInstruction: [
          'Apply only the open review feedback listed below.',
          'Resolve the requested changes in the local repository.',
          'Do not make unrelated edits.',
          '',
          'Open Review Feedback:',
          feedback,
        ].join('\n'),
        outputContract: [
          'Return a JSON object with:',
          '- `summary`: short summary of the review changes you applied',
          '- `changedFiles`: array of relative file paths you changed',
        ].join('\n'),
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'changedFiles'],
        properties: {
          summary: { type: 'string' },
          changedFiles: { type: 'array', items: { type: 'string' } },
        },
      },
      modelConf
    );
  }

  async applyReviewRefinement(title: string, featureSpec: string, implementationPlan: string, instruction: string, modelConf: string = 'strong'): Promise<CodexEditResult> {
    return this.runStructuredTask<CodexEditResult>(
      {
        commandName: 'ready for refinement',
        featureTitle: title,
        featureSpec,
        implementationPlan,
        commandInstruction: [
          'Apply the following refinement request in the local repository.',
          'You must inspect the repository yourself and make only the changes needed for this refinement.',
          '',
          'Refinement Instruction:',
          instruction,
        ].join('\n'),
        outputContract: [
          'Return a JSON object with:',
          '- `summary`: short summary of the refinement you applied',
          '- `changedFiles`: array of relative file paths you changed',
        ].join('\n'),
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'changedFiles'],
        properties: {
          summary: { type: 'string' },
          changedFiles: { type: 'array', items: { type: 'string' } },
        },
      },
      modelConf
    );
  }

  private async runStructuredTask<T>(task: CodexTaskContext, schema: Record<string, unknown>, modelConf: string): Promise<T> {
    if (!process.env.OPENAI_API_KEY) {
      throw new MissingConfigurationError('Codex requires `OPENAI_API_KEY`, but no OpenAI API key is configured for this repository.');
    }

    const prompt = this.buildPrompt(task);
    const codexCommand = this.resolveCodexCommand();
    const codexEnv = this.buildCodexEnv();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-runner-'));
    const outputPath = path.join(tempDir, 'output.json');

    core.info(`[CodexRunner] Launching Codex CLI via ${codexCommand.executable}`);
    core.info(`[CodexRunner] OPENAI_API_KEY present: ${codexEnv.OPENAI_API_KEY ? 'yes' : 'no'}`);

    const result = spawnSync(
      codexCommand.executable,
      [
        ...codexCommand.args,
        'exec',
        '-',
        '--full-auto',
        '--sandbox',
        'workspace-write',
        '--color',
        'never',
        '--output-last-message',
        outputPath,
        '--model',
        this.resolveModel(modelConf),
      ],
      {
        cwd: process.cwd(),
        env: codexEnv,
        input: prompt,
        encoding: 'utf8',
      }
    );

    try {
      if (result.error) {
        throw new Error(`Failed to start Codex CLI: ${result.error.message}`);
      }

      if (result.status !== 0) {
        throw new Error(this.formatCodexFailure(result.stderr, result.stdout));
      }

      const raw = fs.readFileSync(outputPath, 'utf8').trim();
      return this.parseStructuredOutput<T>(raw, schema);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private buildPrompt(task: CodexTaskContext): string {
    return [
      'You are Codex, the repository-native implementation agent for this project.',
      'This repository is AI-first. Before deciding anything, inspect the repository yourself and follow its governance documents.',
      'You must read and obey `AGENTS.md`, relevant files under `docs/`, and any relevant templates or prior artifacts under `plans/` and `specs/`.',
      'Do not ask for repository context to be pasted to you. Gather the context you need from the local repository.',
      '',
      `Command: ${task.commandName}`,
      '',
      '=== FEATURE SPEC ===',
      `Title: ${task.featureTitle}`,
      task.featureSpec || 'No feature specification provided.',
      '',
      '=== IMPLEMENTATION PLAN ===',
      task.implementationPlan || 'No implementation plan is currently available.',
      '',
      '=== TASK INSTRUCTION ===',
      task.commandInstruction,
      '',
      '=== OUTPUT CONTRACT ===',
      task.outputContract,
      '',
      'Return only the final structured output that matches the required schema.',
    ].join('\n');
  }

  private resolveCodexCommand(): CodexCliCommand {
    const directBinary = path.resolve(process.cwd(), 'node_modules/.bin/codex');
    if (fs.existsSync(directBinary)) {
      return {
        executable: directBinary,
        args: [],
      };
    }

    const packagedEntrypoint = path.resolve(process.cwd(), 'node_modules/@openai/codex/bin/codex.js');
    if (fs.existsSync(packagedEntrypoint)) {
      return {
        executable: process.execPath,
        args: [packagedEntrypoint],
      };
    }

    throw new Error(
      'Codex CLI is not available in this checkout. Ensure project dependencies are installed and `@openai/codex` is present before running the action.'
    );
  }

  private formatCodexFailure(stderr?: string | null, stdout?: string | null): string {
    const combined = [stderr, stdout]
      .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0)
      .join('\n')
      .trim();

    if (!combined) {
      return 'Codex execution failed.';
    }

    const lines = combined
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);

    const tail = lines.slice(-20).join('\n').trim();
    return tail || 'Codex execution failed.';
  }

  private parseStructuredOutput<T>(raw: string, schema: Record<string, unknown>): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      const schemaSummary = JSON.stringify(schema, null, 2);
      throw new Error(
        [
          'Codex returned a non-JSON final message.',
          'Expected the final message to be valid JSON matching this schema:',
          schemaSummary,
          'Actual final message:',
          raw,
        ].join('\n')
      );
    }
  }

  private buildCodexEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      TMP: process.env.TMP,
      TEMP: process.env.TEMP,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
      OPENAI_PROJECT: process.env.OPENAI_PROJECT,
      CODEX_HOME: process.env.CODEX_HOME,
      CI: process.env.CI,
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
      NO_COLOR: process.env.NO_COLOR ?? '1',
    };

    return Object.fromEntries(
      Object.entries(env).filter(([, value]) => typeof value === 'string' && value.length > 0)
    );
  }

  private resolveModel(modelConf: string): string {
    return modelConf === 'fast' ? 'codex-mini-latest' : 'gpt-5.3-codex';
  }
}
