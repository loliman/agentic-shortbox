import { BotController } from '../controller';
import { LLMClient, MissingConfigurationError } from '../llm/client';
import { GitManager } from '../git/manager';
import * as core from '@actions/core';
import fs from 'fs';

jest.mock('../llm/client');
jest.mock('../git/manager');
jest.mock('@actions/core');
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn(actualFs.existsSync),
    readFileSync: jest.fn(actualFs.readFileSync),
  };
});

describe('BotController', () => {
  let mockOctokit: any;
  let controller: BotController;
  const mockCtx = { owner: 'test-org', repo: 'test-repo' };
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1712345678901);
    
    // Setup generic mock for Octokit
    mockOctokit = {
      rest: {
        issues: {
          createComment: jest.fn().mockResolvedValue({}),
          addLabels: jest.fn().mockResolvedValue({}),
          removeLabel: jest.fn().mockResolvedValue({}),
          get: jest.fn().mockResolvedValue({ data: { title: 'Test', body: 'Body' } }),
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          create: jest.fn().mockResolvedValue({ data: { number: 42 } })
        },
        pulls: {
          create: jest.fn().mockResolvedValue({ data: { number: 99 } }),
          get: jest.fn().mockResolvedValue({ data: { head: { ref: 'existing-branch' } } }),
          listReviewComments: jest.fn().mockResolvedValue({ data: [] }),
          listReviews: jest.fn().mockResolvedValue({ data: [] }),
          listFiles: jest.fn().mockResolvedValue({ data: [] }),
        }
      },
      graphql: jest.fn().mockResolvedValue({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: []
            }
          }
        }
      })
    };

    controller = new BotController(mockOctokit, mockCtx);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
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

    it('adds actionable guidance for GitHub PR permission failures', async () => {
      const payload = { number: 7, author: 'tester', body: 'ready for implementation', labels: ['state:planned'], isPR: false };

      (LLMClient as jest.Mock).mockImplementation(() => ({
        generateCode: jest.fn().mockResolvedValue([{ path: 'foo.ts', content: 'bar' }])
      }));
      (GitManager as jest.Mock).mockImplementation(() => ({
        checkoutNewBranch: jest.fn(),
        applyFileSystemChanges: jest.fn(),
        commitAndPush: jest.fn()
      }));
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
        data: [{ body: '**Implementation Plan**\n\n# Plan' }]
      });
      mockOctokit.rest.pulls.create.mockRejectedValueOnce(
        new Error('GitHub Actions is not permitted to create or approve pull requests.')
      );

      await expect(controller.handleCommand(payload)).rejects.toThrow(
        'GitHub Actions is not permitted to create or approve pull requests.'
      );

      const postCall = mockOctokit.rest.issues.createComment.mock.calls.at(-1)?.[0].body;
      expect(postCall).toContain('Allow GitHub Actions to create and approve pull requests');
      expect(postCall).toContain('Settings -> Actions -> General -> Workflow permissions');
    });

    it('rejects implementation when no plan comment exists yet', async () => {
      const payload = { number: 8, author: 'tester', body: 'ready for implementation', labels: ['state:planned'], isPR: false };

      await expect(controller.handleCommand(payload)).rejects.toThrow(
        'Cannot start implementation because no implementation plan exists yet.'
      );

      const postCall = mockOctokit.rest.issues.createComment.mock.calls.at(-1)?.[0].body;
      expect(postCall).toContain('does not have an approved implementation plan');
      expect(postCall).toContain('ready for planning');
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

  describe('handleSpecification', () => {
    it('creates child issues from an epic split array response', async () => {
      (LLMClient as jest.Mock).mockImplementation(() => ({
        generateEpicSplit: jest.fn().mockResolvedValue([
          { title: 'Spec 1', specMarkdown: '# Feature: Spec 1\n\n## Goal\nDetail' },
          { title: 'Spec 2', specMarkdown: '# Feature: Spec 2' }
        ])
      }));

      mockOctokit.rest.issues.create
        .mockResolvedValueOnce({ data: { number: 41 } })
        .mockResolvedValueOnce({ data: { number: 42 } });

      const payload = { number: 12, author: 'alice', body: 'ready for specification', labels: ['state:idle'], isPR: false };
      await controller.handleCommand(payload);

      expect(mockOctokit.rest.issues.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
        title: 'Spec 1',
        body: '# Feature: Spec 1\n\n## Goal\nDetail'
      }));
      expect(mockOctokit.rest.issues.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
        title: 'Spec 2',
        body: '# Feature: Spec 2'
      }));
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.stringContaining('Epic split completed')
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
       mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
          data: [{ body: '**Implementation Plan**\n\n# Architectural Plan' }]
       });

       const payload = { number: 7, author: 'eve', body: 'ready for implementation', labels: ['state:planned'], isPR: false };
       await controller.handleCommand(payload);

       expect(mockGit.checkoutNewBranch).toHaveBeenCalledWith('codex/issue-7-test-lun2elv9');
       expect(mockGit.applyFileSystemChanges).toHaveBeenCalledWith([{ path: 'foo.ts', content: 'bar' }]);
       expect(mockGit.commitAndPush).toHaveBeenCalledWith('Fix #7: Auto implementation', 'codex/issue-7-test-lun2elv9');

       expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(expect.objectContaining({
          title: 'AI Implementation for #7',
          head: 'codex/issue-7-test-lun2elv9',
          base: 'main'
       }));
       expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
          issue_number: 99,
          body: expect.stringContaining('ready for rework')
       }));
       expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
          labels: ['state:in-review']
       }));
    });

    it('uses PR review feedback as the rework source', async () => {
      const mockGit = {
        checkoutNewBranch: jest.fn(),
        applyFileSystemChanges: jest.fn(),
        commitAndPush: jest.fn()
      };
      (GitManager as jest.Mock).mockImplementation(() => mockGit);
      (LLMClient as jest.Mock).mockImplementation(() => ({
        generateCode: jest.fn().mockResolvedValue([{ path: 'foo.ts', content: 'bar' }])
      }));

      mockOctokit.rest.pulls.get.mockResolvedValueOnce({ data: { head: { ref: 'existing-branch' } } });
      mockOctokit.rest.pulls.get.mockResolvedValueOnce({ data: 'diff --git a/foo.ts b/foo.ts' });
      mockOctokit.graphql.mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  isResolved: false,
                  isOutdated: false,
                  comments: {
                    nodes: [
                      {
                        body: 'Please simplify this message.',
                        path: 'src/foo.ts',
                        line: 12,
                        originalLine: 12,
                        diffHunk: '@@ -12 +12 @@',
                        author: { login: 'bob' }
                      }
                    ]
                  }
                },
                {
                  isResolved: true,
                  isOutdated: false,
                  comments: {
                    nodes: [
                      {
                        body: 'Old resolved comment.',
                        path: 'src/old.ts',
                        line: 5,
                        originalLine: 5,
                        diffHunk: '@@ -5 +5 @@',
                        author: { login: 'alice' }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      });
      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [{ filename: 'src/foo.ts', patch: '@@ -1 +1 @@' }]
      });
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
        data: [{ user: { type: 'User', login: 'bob' }, body: 'ready for rework' }]
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('const message = "hello";\n');

      const payload = { number: 99, author: 'bob', body: 'ready for rework', labels: [], isPR: true };
      await controller.handleCommand(payload);

      const mockClient = (LLMClient as jest.Mock).mock.results.at(-1)?.value;
      expect(mockClient.generateCode).toHaveBeenCalledWith(
        'PR Rework for #99',
        expect.stringContaining('Prefer the exact files and lines referenced'),
        expect.stringContaining('1: const message = "hello";')
      );
      expect(mockClient.generateCode).toHaveBeenCalledWith(
        'PR Rework for #99',
        expect.any(String),
        expect.not.stringContaining('Old resolved comment.')
      );
      expect(mockClient.generateCode).toHaveBeenCalledWith(
        'PR Rework for #99',
        expect.any(String),
        expect.stringContaining('Please simplify this message.')
      );
      expect(mockGit.checkoutNewBranch).toHaveBeenCalledWith('existing-branch');
      expect(mockGit.commitAndPush).toHaveBeenCalledWith('PR Rework: address review feedback', 'existing-branch');
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
        issue_number: 99,
        body: expect.stringContaining('🛠️ **Rework applied**')
      }));
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
        issue_number: 99,
        body: expect.stringContaining('`foo.ts`')
      }));
    });

    it('uses same-comment instructions for refinement requests', async () => {
      const mockGit = {
        checkoutNewBranch: jest.fn(),
        applyFileSystemChanges: jest.fn(),
        commitAndPush: jest.fn()
      };
      (GitManager as jest.Mock).mockImplementation(() => mockGit);
      (LLMClient as jest.Mock).mockImplementation(() => ({
        generateCode: jest.fn().mockResolvedValue([{ path: 'src/foo.ts', content: 'bar' }])
      }));

      mockOctokit.rest.pulls.get.mockResolvedValueOnce({ data: { head: { ref: 'existing-branch' } } });
      mockOctokit.graphql.mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: []
            }
          }
        }
      });
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
        data: [{ user: { type: 'User', login: 'bob' }, body: 'General discussion about copy tone.' }]
      });
      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({
        data: [{ filename: 'src/foo.ts', patch: '@@ -1 +1 @@' }]
      });
      mockOctokit.rest.pulls.get.mockResolvedValueOnce({ data: 'diff --git a/src/foo.ts b/src/foo.ts' });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('const message = "hello";\n');

      const payload = {
        number: 99,
        author: 'bob',
        body: 'ready for refinement make the bot tone friendlier and more concise',
        labels: ['state:in-review'],
        isPR: true
      };
      await controller.handleCommand(payload);

      const mockClient = (LLMClient as jest.Mock).mock.results.at(-1)?.value;
      expect(mockClient.generateCode).toHaveBeenCalledWith(
        'PR Refinement for #99',
        expect.stringContaining('make the bot tone friendlier and more concise'),
        expect.stringContaining('General discussion about copy tone.')
      );
      expect(mockGit.commitAndPush).toHaveBeenCalledWith('PR Refinement: apply requested polish', 'existing-branch');
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
        issue_number: 99,
        body: expect.stringContaining('✨ **Refinement applied**')
      }));
    });

    it('requires inline instructions for refinement requests', async () => {
      const payload = {
        number: 99,
        author: 'bob',
        body: 'ready for refinement',
        labels: ['state:in-review'],
        isPR: true
      };

      await expect(controller.handleCommand(payload)).rejects.toThrow(
        '`ready for refinement` requires an instruction in the same comment.'
      );
    });

    it('fails when no open review threads or discussion feedback remain', async () => {
      const mockGit = {
        checkoutNewBranch: jest.fn(),
        applyFileSystemChanges: jest.fn(),
        commitAndPush: jest.fn()
      };
      (GitManager as jest.Mock).mockImplementation(() => mockGit);
      (LLMClient as jest.Mock).mockImplementation(() => ({
        generateCode: jest.fn()
      }));

      mockOctokit.rest.pulls.get.mockResolvedValueOnce({ data: { head: { ref: 'existing-branch' } } });
      mockOctokit.graphql.mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  isResolved: true,
                  isOutdated: false,
                  comments: {
                    nodes: [
                      {
                        body: 'Already handled',
                        path: 'src/foo.ts',
                        line: 1,
                        originalLine: 1,
                        diffHunk: '@@ -1 +1 @@',
                        author: { login: 'bob' }
                      }
                    ]
                  }
                }
              ]
            }
          }
        }
      });
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({
        data: [{ user: { type: 'User', login: 'bob' }, body: 'ready for rework' }]
      });
      mockOctokit.rest.pulls.listFiles.mockResolvedValueOnce({ data: [] });
      mockOctokit.rest.pulls.get.mockResolvedValueOnce({ data: '' });

      const payload = { number: 99, author: 'bob', body: 'ready for rework', labels: [], isPR: true };
      await expect(controller.handleCommand(payload)).rejects.toThrow('No open PR feedback was found');
    });
  });
});
