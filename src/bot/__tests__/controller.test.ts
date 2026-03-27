import { BotController } from '../controller';
import { LLMClient, MissingConfigurationError } from '../llm/client';
import { GitManager } from '../git/manager';
import * as core from '@actions/core';

jest.mock('../llm/client');
jest.mock('../git/manager');
jest.mock('@actions/core');

describe('BotController', () => {
  let mockOctokit: any;
  let controller: BotController;
  const mockCtx = { owner: 'test-org', repo: 'test-repo' };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup generic mock for Octokit
    mockOctokit = {
      rest: {
        issues: {
          createComment: jest.fn().mockResolvedValue({}),
          addLabels: jest.fn().mockResolvedValue({}),
          removeLabel: jest.fn().mockResolvedValue({}),
          get: jest.fn().mockResolvedValue({ data: { title: 'Test', body: 'Body' } }),
          create: jest.fn().mockResolvedValue({ data: { number: 42 } })
        },
        pulls: {
          create: jest.fn().mockResolvedValue({ data: { number: 99 } }),
          get: jest.fn().mockResolvedValue({ data: { head: { ref: 'existing-branch' } } })
        }
      }
    };

    controller = new BotController(mockOctokit, mockCtx);
  });

  describe('handleWelcome', () => {
    it('posts missing secrets text when env is empty', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      await controller.handleWelcome(1);
      
      const postedMessage = mockOctokit.rest.issues.createComment.mock.calls[0][0].body;
      expect(postedMessage).toContain('⚠️ **I am currently offline.**');
    });

    it('posts functional configurations when keys are present', async () => {
      process.env.OPENAI_API_KEY = 'mock';
      process.env.GEMINI_API_KEY = 'mock';
      
      await controller.handleWelcome(1);

      const postedMessage = mockOctokit.rest.issues.createComment.mock.calls[0][0].body;
      expect(postedMessage).toContain('OpenAI');
      expect(postedMessage).toContain('Google Gemini');
      expect(postedMessage).toContain('agent:codex');
    });
  });

  describe('handleCommand & Exceptions', () => {
    it('catches MissingConfigurationError gracefully and posts to Issue', async () => {
       const payload = { number: 1, author: 'tester', body: 'ready for planning', labels: ['state:idle', 'agent:gemini'], isPR: false };
       
       const mockGeneratePlan = jest.fn().mockRejectedValue(new Error('Testing Missing Config'));
       (LLMClient as jest.Mock).mockImplementation(() => ({
         generateImplementationPlan: mockGeneratePlan
       }));

       try {
         await controller.handleCommand(payload);
       } catch (err) {} // Swallow the intentional throw

       const postCall = mockOctokit.rest.issues.createComment.mock.calls[1][0].body;
       expect(postCall).toContain('🚨 **System Error:**');
       expect(postCall).toContain('Testing Missing Config');
       expect(postCall).toContain('Testing Missing Config');
    });

    it('throws IllegalTransitionError for invalid state lifecycles', async () => {
       // Trying to 'plan' when state is 'in-review' (illegal transition)
       const payload = { number: 1, author: 'tester', body: 'ready for planning', labels: ['state:in-review', 'agent:codex'], isPR: false };
       
       await controller.handleCommand(payload); // Does not throw natively

       // Expect graceful catch in action parser
       const postCall = mockOctokit.rest.issues.createComment.mock.calls[0][0].body;
       expect(postCall).toContain('🤖 **Workflow Error**');
       expect(postCall).toContain("Cannot transition from state 'in-review' using command 'plan'");
    });
  });

  describe('handlePlanning (State Machine Flow)', () => {
    it('applies planned label and plan text on valid action', async () => {
       (LLMClient as jest.Mock).mockImplementation(() => ({
          generateImplementationPlan: jest.fn().mockResolvedValue({ action: 'plan', content: '# Architectural Plan' })
       }));

       const payload = { number: 10, author: 'bob', body: 'ready for planning!', labels: ['state:idle'], isPR: false };
       await controller.handleCommand(payload);

       expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
          body: expect.stringContaining('# Architectural Plan')
       }));
       expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
          labels: ['state:planned']
       }));
    });

    it('applies clarification_needed when LLM hesitates', async () => {
       (LLMClient as jest.Mock).mockImplementation(() => ({
          generateImplementationPlan: jest.fn().mockResolvedValue({ action: 'question', content: 'What DB should I use?' })
       }));

       const payload = { number: 10, author: 'bob', body: 'ready for planning', labels: ['state:idle'], isPR: false };
       await controller.handleCommand(payload);

       expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
          body: expect.stringContaining('What DB should I use?')
       }));
       expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
          labels: ['state:clarification_needed']
       }));
    });
  });

  describe('handleImplementation', () => {
    it('executes the full git cycle and spawns PR', async () => {
       (LLMClient as jest.Mock).mockImplementation(() => ({
          generateCode: jest.fn().mockResolvedValue([{ path: 'foo.ts', content: 'bar' }])
       }));

       const mockGit = {
          checkoutNewBranch: jest.fn(),
          applyFileSystemChanges: jest.fn(),
          commitAndPush: jest.fn()
       };
       (GitManager as jest.Mock).mockImplementation(() => mockGit);

       const payload = { number: 7, author: 'eve', body: 'ready for implementation', labels: ['state:planned'], isPR: false };
       await controller.handleCommand(payload);

       expect(mockGit.checkoutNewBranch).toHaveBeenCalled();
       expect(mockGit.applyFileSystemChanges).toHaveBeenCalledWith([{ path: 'foo.ts', content: 'bar' }]);
       expect(mockGit.commitAndPush).toHaveBeenCalled();

       expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(expect.objectContaining({
          title: 'AI Implementation for #7',
          base: 'main'
       }));
       expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
          labels: ['state:in-review']
       }));
    });
  });
});
