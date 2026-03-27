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
        choices: [{ message: { content: '{"tasks": []}' } }]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: { completions: { create: mockCreate } }
      }));

      // Simulate AGENTS.md existing, others missing
      (fs.existsSync as jest.Mock).mockImplementation((pathStr) => pathStr.includes('AGENTS.md'));
      (fs.readFileSync as jest.Mock).mockImplementation(() => 'Mocked System Rules');

      const client = new LLMClient();
      const res = await client.generateEpicSplit('Epic', 'Body');

      expect(res).toEqual({ tasks: [] });
      const sentPrompt = mockCreate.mock.calls[0][0].messages[0].content;
      
      expect(sentPrompt).toContain('Mocked System Rules');
      expect(sentPrompt).toContain('=== SYSTEM ARCHITECTURE & GOVERNANCE ===');
      expect(sentPrompt).toContain('=== TASK: EPIC SPLITTING ===');
    });

    it('throws explicit errors on malformed JSON responses', async () => {
      process.env.OPENAI_API_KEY = 'mock-openai';
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Not really JSON' } }]
      });
      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
         chat: { completions: { create: mockCreate } }
      }));

      const client = new LLMClient();
      await expect(client.generateCode('Epic', 'Body')).rejects.toThrow('LLM output was not valid JSON');
    });
  });
});
