import { LLMClient, MissingConfigurationError } from '../client';
import { OpenAI } from 'openai';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

// Mock dependencies
jest.mock('openai');
jest.mock('@google/genai');
jest.mock('fs');

describe('LLMClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Configuration Exceptions', () => {
    it('throws MissingConfigurationError when OpenAI is requested but missing', async () => {
      delete process.env.OPENAI_API_KEY;
      const client = new LLMClient();
      await expect(client.ask('test', 'openai')).rejects.toThrow(MissingConfigurationError);
    });

    it('throws MissingConfigurationError when Gemini is requested but missing', async () => {
      delete process.env.GEMINI_API_KEY;
      const client = new LLMClient();
      await expect(client.ask('test', 'gemini')).rejects.toThrow(MissingConfigurationError);
    });
  });

  describe('Model Routing', () => {
    it('correctly routes to OpenAI and strips json blocks', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';
      
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: '```json\n{"test": true}\n```' } }]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      const client = new LLMClient();
      const res = await client.ask('hello', 'openai', 'fast');
      
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hello' }]
      }));
      expect(res).toBe('{"test": true}');
    });

    it('correctly routes to Gemini and uses strong models', async () => {
      process.env.GEMINI_API_KEY = 'mock-gemini';
      
      const mockGenerateContent = jest.fn().mockResolvedValue({
        text: 'hello from gemini'
      });
      (GoogleGenAI as unknown as jest.Mock).mockImplementation(() => ({
        models: { generateContent: mockGenerateContent }
      }));

      const client = new LLMClient();
      const res = await client.ask('hello', 'gemini', 'strong');
      
      expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({
        model: 'gemini-1.5-pro',
        contents: 'hello'
      }));
      expect(res).toBe('hello from gemini');
    });
  });

  describe('JSON Parsing & Context Loading', () => {
    it('gathers filesystem boundaries cleanly without crashing on missing files', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';
      
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: '[{\"title\":\"Spec 1\",\"specMarkdown\":\"# Feature: Spec 1\"}]' } }]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      (fs.existsSync as jest.Mock).mockImplementation((pathStr) => {
        const pathValue = String(pathStr);
        return pathValue.includes('AGENTS.md') || pathValue.includes('specs/templates/feature-spec.md');
      });
      (fs.readFileSync as jest.Mock).mockImplementation((pathStr) => {
        const pathValue = String(pathStr);
        if (pathValue.includes('specs/templates/feature-spec.md')) {
          return '# Feature: [Feature Name]\n\n## Goal';
        }
        return 'Mocked System Rules';
      });

      const client = new LLMClient();
      const res = await client.generateEpicSplit('Epic', 'Body');

      expect(res).toEqual([{ title: 'Spec 1', specMarkdown: '# Feature: Spec 1' }]);
      const sentPrompt = mockCreate.mock.calls[0][0].messages[0].content;
      
      expect(sentPrompt).toContain('Mocked System Rules');
      expect(sentPrompt).toContain('Required Specification Template');
      expect(sentPrompt).toContain('# Feature: [Feature Name]');
    });

    it('accepts the legacy object shape for epic splitting when spec markdown is present', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';

      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{"tasks":[{"title":"Spec A","specMarkdown":"# Feature: Spec A"}]}' } }]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation((pathStr) =>
        String(pathStr).includes('specs/templates/feature-spec.md')
          ? '# Feature: [Feature Name]'
          : 'Mocked System Rules'
      );

      const client = new LLMClient();
      const res = await client.generateEpicSplit('Epic', 'Body');

      expect(res).toEqual([{ title: 'Spec A', specMarkdown: '# Feature: Spec A' }]);
    });

    it('fails clearly when the specification template is missing', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';
      (fs.existsSync as jest.Mock).mockImplementation((pathStr) => String(pathStr).includes('AGENTS.md'));
      (fs.readFileSync as jest.Mock).mockReturnValue('Mocked System Rules');

      const client = new LLMClient();
      await expect(client.generateEpicSplit('Epic', 'Body')).rejects.toThrow(
        'Required template file is missing: specs/templates/feature-spec.md'
      );
    });

    it('throws explicit errors on malformed JSON responses', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [
          { message: { content: 'Not really JSON' } },
          { message: { content: 'Still not JSON' } }
        ]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
         chat: { completions: { create: mockCreate } }
      }));

      const client = new LLMClient();
      await expect(client.generateCode('Epic', 'Body')).rejects.toThrow('LLM output was not valid JSON');
    });

    it('sanitizes malformed JSON code output with raw newlines inside strings', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: '[{"path":"src/a.ts","content":"line 1\nline 2"}]' } }]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.readFileSync as jest.Mock).mockReturnValue('');

      const client = new LLMClient();
      const result = await client.generateCode('Epic', 'Body');

      expect(result).toEqual([{ path: 'src/a.ts', content: 'line 1\nline 2' }]);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('repairs malformed JSON with a second model pass when local parsing cannot recover it', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';
      const mockCreate = jest.fn().mockResolvedValueOnce({
        choices: [{ message: { content: 'Not valid JSON at all' } }]
      }).mockResolvedValueOnce({
        choices: [{ message: { content: '[{"path":"src/a.ts","content":"line 1\\nline 2"}]' } }]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.readFileSync as jest.Mock).mockReturnValue('');

      const client = new LLMClient();
      const result = await client.generateCode('Epic', 'Body');

      expect(result).toEqual([{ path: 'src/a.ts', content: 'line 1\nline 2' }]);
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockCreate.mock.calls[1][0].messages[0].content).toContain('Return ONLY valid JSON');
    });
  });
});
