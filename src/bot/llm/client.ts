import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { generateCodePrompt, generateDefinePrompt } from './prompts';

export interface EpicSplitTask {
  title: string;
  description?: string;
  specMarkdown?: string;
  affectedFiles?: string[];
}

export class MissingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingConfigurationError';
  }
}

export class LLMClient {
  private openai?: OpenAI;
  private gemini?: GoogleGenAI;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: "https://adesso-ai-hub.3asabc.de/v1"
      });
    }
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }

  /**
   * Builds the strict system context boundary reading AGENTS.md, README.md, docs/, specs/, and plans/.
   */
  private gatherSystemContext(): string {
    const cwd = process.cwd();
    let context = "=== SYSTEM ARCHITECTURE & GOVERNANCE ===\n";
    context += "You must strictly follow the rules defined in the following project documents. Do not hallucinate or bypass these constraints.\n\n";

    const loadSafely = (filePath: string) => {
      try {
        const fullPath = path.resolve(cwd, filePath);
        if (fs.existsSync(fullPath)) {
          context += `\n--- [${filePath}] ---\n`;
          context += fs.readFileSync(fullPath, 'utf-8');
          context += `\n-----------------------\n`;
        }
      } catch (e) {
        // ignore missing files silently
      }
    };

    loadSafely('README.md');
    loadSafely('AGENTS.md');
    loadSafely('AI_FIRST_AGENT_SPEC.md');

    // In a mature setup, we could glob all markdown files in /docs, /specs. 
    // Here we include template files forcefully to ensure formats are respected:
    loadSafely('specs/templates/feature-spec.md');
    loadSafely('plans/templates/implementation-plan.md');

    return context;
  }

  private readRequiredFile(filePath: string): string {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required template file is missing: ${filePath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  async generateEpicSplit(title: string, body: string): Promise<EpicSplitTask[]> {
    const sys = this.gatherSystemContext();
    const specTemplate = this.readRequiredFile('specs/templates/feature-spec.md');
    const prompt = `${sys}\n\n${generateDefinePrompt(`Epic Title: ${title}\n\nEpic Body:\n${body}`, specTemplate)}`;
    const result = await this.askJSON<EpicSplitTask[] | { tasks: EpicSplitTask[] }>(prompt);
    const tasks = Array.isArray(result) ? result : result?.tasks;

    if (!Array.isArray(tasks)) {
      throw new Error('Epic split response must be a JSON array or an object with a tasks array.');
    }

    for (const task of tasks) {
      if (!task.title || !task.specMarkdown) {
        throw new Error('Epic split tasks must include both title and specMarkdown following specs/templates/feature-spec.md.');
      }
    }

    return tasks;
  }

  async generateImplementationPlan(title: string, body: string, force: boolean): Promise<{ action: 'plan' | 'question', content: string }> {
    const sys = this.gatherSystemContext();
    const instruction = force
      ? "You MUST return a completed Implementation Plan. Do not ask questions."
      : "If the issue is too vague to plan technically, return action: 'question' with your clarification questions. If it is clear enough, return action: 'plan' and generate the full architecture markdown plan.";

    const prompt = `\n\n${sys}\n\n=== TASK: IMPLEMENTATION PLANNING ===\nYou are an Architect creating an implementation plan.\nIssue Title: ${title}\nIssue Body: ${body}\n\nINSTRUCTION: ${instruction}\n\nReturn EXACTLY a JSON object mapping to: { action: 'plan' | 'question', content: string }.`;
    return this.askJSON(prompt);
  }

  async generateCode(title: string, body: string): Promise<{ path: string, content: string }[]> {
    const sys = this.gatherSystemContext();
    const prompt = `${sys}\n\n${generateCodePrompt(title, body)}`;
    return this.askJSON(prompt);
  }

  async ask(prompt: string, agentConf: string = 'openai', modelConf: string = 'strong'): Promise<string> {
    const finalPrompt = prompt;

    // Use Gemini
    if (agentConf === 'gemini') {
      if (!this.gemini) throw new MissingConfigurationError('Google Gemini was requested (`agent:gemini`), but the `GEMINI_API_KEY` is missing in the repository secrets.');
      const modelName = modelConf === 'strong' ? 'gemini-1.5-pro' : 'gemini-1.5-flash';
      const response = await this.gemini.models.generateContent({
        model: modelName,
        contents: finalPrompt
      });
      return response.text || '';
    }

    // Default OpenAI
    if (!this.openai) throw new MissingConfigurationError('OpenAI was requested (`agent:codex` or default), but the `OPENAI_API_KEY` is missing in the repository secrets.');
    const modelName = modelConf === 'strong' ? 'gpt-4o' : 'gpt-4o-mini';
    const response = await this.openai.chat.completions.create({
      model: modelName,
      messages: [{ role: 'user', content: finalPrompt }]
    });

    let result = response.choices[0].message.content || '';
    result = result.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');
    return result.trim();
  }

  async askJSON<T>(prompt: string, agentConf: string = 'openai', modelConf: string = 'strong'): Promise<T> {
    const raw = await this.ask(prompt, agentConf, modelConf);
    const parsed = this.tryParseJSON(raw);
    if (parsed !== null) {
      return parsed as T;
    }

    const repaired = await this.tryRepairJSON(raw, agentConf, modelConf);
    if (repaired !== null) {
      return repaired as T;
    }

    throw new Error(`LLM output was not valid JSON. Response excerpt: ${raw.slice(0, 100)}`);
  }

  private async tryRepairJSON(raw: string, agentConf: string, modelConf: string): Promise<unknown | null> {
    const repairPrompt = `The following text was intended to be valid JSON but failed to parse.
Return ONLY valid JSON.
Do not add explanations.
Do not change the structure or meaning.
Escape all embedded newlines and quotes correctly.

Broken JSON:
${raw}`;

    const repairedRaw = await this.ask(repairPrompt, agentConf, modelConf);

    return this.tryParseJSON(repairedRaw);
  }

  private tryParseJSON(raw: string): unknown | null {
    const candidates = [
      raw,
      this.extractJSONCandidate(raw),
      this.sanitizeJSONStringLiterals(raw),
      this.sanitizeJSONStringLiterals(this.extractJSONCandidate(raw)),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // try next candidate
      }
    }

    return null;
  }

  private extractJSONCandidate(raw: string): string {
    const arrayStart = raw.indexOf('[');
    const objectStart = raw.indexOf('{');
    const starts = [arrayStart, objectStart].filter((index) => index >= 0);
    if (starts.length === 0) {
      return raw;
    }

    const start = Math.min(...starts);
    const arrayEnd = raw.lastIndexOf(']');
    const objectEnd = raw.lastIndexOf('}');
    const end = Math.max(arrayEnd, objectEnd);

    if (end <= start) {
      return raw.slice(start);
    }

    return raw.slice(start, end + 1);
  }

  private sanitizeJSONStringLiterals(raw: string): string {
    let sanitized = '';
    let inString = false;
    let escaping = false;

    for (const char of raw) {
      if (escaping) {
        sanitized += char;
        escaping = false;
        continue;
      }

      if (char === '\\') {
        sanitized += char;
        escaping = true;
        continue;
      }

      if (char === '"') {
        sanitized += char;
        inString = !inString;
        continue;
      }

      if (inString) {
        if (char === '\n') {
          sanitized += '\\n';
          continue;
        }
        if (char === '\r') {
          sanitized += '\\r';
          continue;
        }
        if (char === '\t') {
          sanitized += '\\t';
          continue;
        }
      }

      sanitized += char;
    }

    return sanitized;
  }
}
