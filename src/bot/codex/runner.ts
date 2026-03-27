import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import * as core from '@actions/core';

const DEFAULT_OPENAI_BASE_URL = 'https://adesso-ai-hub.3asabc.de/v1';

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
          'You must always return at least 3 child features when the parent issue describes a software change request.',
          'Do not return an empty array.',
          'If the parent issue feels too small to split cleanly, decompose it into setup, implementation, and verification oriented child features anyway.',
          'Each child feature must be specific, reviewable, and narrow enough to become its own GitHub issue.',
          'For each child feature, produce a GitHub issue title and a markdown body that follows `specs/templates/feature-spec.md` exactly.',
          'Every `specMarkdown` must be a complete filled-out spec, not a template stub and not a summary.',
          'Do not implement code and do not modify repository files.',
        ].join('\n'),
        outputContract: [
          'Return a JSON array.',
          'The array must contain 3 to 5 items.',
          'An empty array is invalid.',
          'Each item must include:',
          '- `title`: string',
          '- `specMarkdown`: string following `specs/templates/feature-spec.md`',
          'Return only valid JSON with no markdown fences and no commentary.',
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
    core.info(`[CodexRunner] OPENAI_API_KEY length: ${codexEnv.OPENAI_API_KEY?.length ?? 0}`);
    core.info(
      `[CodexRunner] OPENAI_API_KEY prefix looks like OpenAI key: ${codexEnv.OPENAI_API_KEY?.startsWith('sk-') ? 'yes' : 'no'}`
    );
    core.info(`[CodexRunner] OPENAI_BASE_URL: ${codexEnv.OPENAI_BASE_URL ?? '(not set)'}`);
    core.info('[CodexRunner] Prompt begin');
    core.info(prompt);
    core.info('[CodexRunner] Prompt end');

    const result = spawnSync(
      codexCommand.executable,
      [
        ...codexCommand.args,
        'exec',
        '-',
        '-c',
        `base_url=${JSON.stringify(codexEnv.OPENAI_BASE_URL)}`,
        '-c',
        'preferred_auth_method="apikey"',
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
        this.logCodexStreams(result.stdout, result.stderr);
        throw new Error(this.formatCodexFailure(result.stderr, result.stdout));
      }

      if (!fs.existsSync(outputPath)) {
        this.logCodexStreams(result.stdout, result.stderr);
        throw new Error(
          'Codex finished without writing the expected output-last-message file.'
        );
      }

      const raw = fs.readFileSync(outputPath, 'utf8').trim();
      try {
        return this.parseStructuredOutput<T>(raw, schema, result.stdout, result.stderr);
      } catch (error) {
        this.logRawOutputFile(raw);
        this.logCodexStreams(result.stdout, result.stderr);
        throw error;
      }
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

  private logCodexStreams(stdout?: string | null, stderr?: string | null): void {
    if (typeof stdout === 'string' && stdout.trim().length > 0) {
      core.info('[CodexRunner] Codex stdout begin');
      core.info(stdout);
      core.info('[CodexRunner] Codex stdout end');
    }

    if (typeof stderr === 'string' && stderr.trim().length > 0) {
      core.info('[CodexRunner] Codex stderr begin');
      core.info(stderr);
      core.info('[CodexRunner] Codex stderr end');
    }
  }

  private parseStructuredOutput<T>(
    raw: string,
    schema: Record<string, unknown>,
    stdout?: string | null,
    stderr?: string | null
  ): T {
    const directCandidate = this.extractJsonCandidate(raw, schema, true);
    if (directCandidate) {
      core.info('[CodexRunner] Structured output source: output-last-message');
      this.logStructuredCandidate(directCandidate);
      return this.validateStructuredOutput<T>(JSON.parse(directCandidate), schema);
    }

    const fallbackCandidate = this.extractJsonCandidate(
      [stdout, stderr]
        .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0)
        .join('\n'),
      schema,
      false
    );

    if (fallbackCandidate) {
      core.info('[CodexRunner] Structured output source: stdout/stderr fallback');
      this.logStructuredCandidate(fallbackCandidate);
      return this.validateStructuredOutput<T>(JSON.parse(fallbackCandidate), schema);
    }

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

  private logStructuredCandidate(candidate: string): void {
    core.info('[CodexRunner] Structured output candidate begin');
    core.info(candidate);
    core.info('[CodexRunner] Structured output candidate end');
  }

  private logRawOutputFile(raw: string): void {
    core.info('[CodexRunner] Raw output-last-message begin');
    core.info(raw);
    core.info('[CodexRunner] Raw output-last-message end');
  }

  private extractJsonCandidate(
    content?: string | null,
    schema?: Record<string, unknown>,
    allowLooseExtraction: boolean = true
  ): string | null {
    if (!content) {
      return null;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }

    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fencedMatch?.[1]) {
        const fenced = fencedMatch[1].trim();
        try {
          JSON.parse(fenced);
          return fenced;
        } catch {
          // Keep searching.
        }
      }

      if (!allowLooseExtraction) {
        return null;
      }

      const preferredStarter = schema?.type === 'array' ? '[' : schema?.type === 'object' ? '{' : null;
      const candidates = this.collectBalancedJsonCandidates(trimmed).sort((left, right) => {
        const leftPreferred = preferredStarter !== null && left.startsWith(preferredStarter) ? 1 : 0;
        const rightPreferred = preferredStarter !== null && right.startsWith(preferredStarter) ? 1 : 0;
        return rightPreferred - leftPreferred || right.length - left.length;
      });

      for (const candidate of candidates) {
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // Try the next candidate.
        }
      }

      return null;
    }
  }

  private collectBalancedJsonCandidates(content: string): string[] {
    const candidates: string[] = [];

    for (let start = 0; start < content.length; start += 1) {
      const opener = content[start];
      if (opener !== '{' && opener !== '[') {
        continue;
      }

      const stack = [opener];
      let inString = false;
      let escaped = false;

      for (let end = start + 1; end < content.length; end += 1) {
        const char = content[end];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        if (inString) {
          continue;
        }

        if (char === '{' || char === '[') {
          stack.push(char);
          continue;
        }

        if (char === '}' || char === ']') {
          const last = stack.at(-1);
          if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
            stack.pop();
            if (stack.length === 0) {
              candidates.push(content.slice(start, end + 1));
              break;
            }
          } else {
            break;
          }
        }
      }
    }

    return candidates;
  }

  private validateStructuredOutput<T>(value: unknown, schema: Record<string, unknown>): T {
    if (schema.type === 'array') {
      if (!Array.isArray(value)) {
        throw new Error('Codex returned JSON, but it was not the expected array result.');
      }

      if (value.length === 0) {
        throw new Error('Codex returned an empty result array. Refusing to treat that as a successful structured response.');
      }

      const itemSchema = this.asRecord(schema.items);
      const required = Array.isArray(itemSchema?.required) ? itemSchema.required : [];

      for (const item of value) {
        if (!this.isRecord(item)) {
          throw new Error('Codex returned an array item that is not an object.');
        }

        for (const key of required) {
          const field = item[key];
          if (typeof field !== 'string' || field.trim().length === 0) {
            throw new Error(`Codex returned an invalid array item: \`${key}\` must be a non-empty string.`);
          }
        }
      }

      return value as T;
    }

    if (schema.type === 'object') {
      if (!this.isRecord(value)) {
        throw new Error('Codex returned JSON, but it was not the expected object result.');
      }

      const required = Array.isArray(schema.required) ? schema.required : [];
      for (const key of required) {
        const field = value[key];
        if (field === undefined || field === null) {
          throw new Error(`Codex returned an invalid object result: missing required field \`${key}\`.`);
        }

        if (typeof field === 'string' && field.trim().length === 0) {
          throw new Error(`Codex returned an invalid object result: \`${key}\` must not be empty.`);
        }
      }

      return value as T;
    }

    return value as T;
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private asRecord(value: unknown): Record<string, any> | null {
    return this.isRecord(value) ? value : null;
  }

  private buildCodexEnv(): NodeJS.ProcessEnv {
    const fallbackPath = ['/usr/local/bin', '/usr/bin', '/bin'].join(path.delimiter);
    const homeDir = process.env.HOME || os.homedir();
    const tempDir = process.env.TMPDIR || process.env.TMP || process.env.TEMP || os.tmpdir();
    const codexHome = process.env.CODEX_HOME || path.join(homeDir, '.codex');
    const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
    const openAiBaseUrl = process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL;

    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });

    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || fallbackPath,
      HOME: homeDir,
      TMPDIR: process.env.TMPDIR || tempDir,
      TMP: process.env.TMP || tempDir,
      TEMP: process.env.TEMP || tempDir,
      OPENAI_API_KEY: openAiApiKey,
      OPENAI_BASE_URL: openAiBaseUrl,
      OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
      OPENAI_PROJECT: process.env.OPENAI_PROJECT,
      CODEX_HOME: codexHome,
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
