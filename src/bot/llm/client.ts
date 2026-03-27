import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

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

  async generateEpicSplit(title: string, body: string): Promise<{ tasks: any[] }> {
    const sys = this.gatherSystemContext();
    const prompt = `\n\n${sys}\n\n=== TASK: EPIC SPLITTING ===\nYou are a Product Owner breaking down an epic into sub-issues.\nEpic Title: ${title}\nEpic Body: ${body}\n\nReturn EXACTLY a JSON array mapping to: [{ title: string, description: string, affectedFiles: string[] }] (no markdown wrapping).`;
    return this.askJSON(prompt);
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
    const prompt = `\n\n${sys}\n\n=== TASK: CODE GENERATION ===\nYou are an Engineer writing code to implement an issue/fix. Do not write markdown blocks.\nIssue: ${title}\nInstructions: ${body}\n\nReturn EXACTLY a JSON array: [{ path: string, content: string }] (no markdown wrapping).`;
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
    try {
      return JSON.parse(raw) as T;
    } catch (e: any) {
      throw new Error(`LLM output was not valid JSON. Response excerpt: ${raw.slice(0, 100)}`);
    }
  }
}
