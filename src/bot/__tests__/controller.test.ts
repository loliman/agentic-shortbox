import { BotController } from '../controller';
import { CodexRunner } from '../codex/runner';
import { GitManager } from '../git/manager';

jest.mock('../codex/runner');
jest.mock('../git/manager');
jest.mock('@actions/core');

describe('BotController', () => {
  let mockOctokit: any;
  let controller: BotController;
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    jest.clearAllMocks();
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1712345678901);

    mockOctokit = {
      rest: {
        issues: {
          createComment: jest.fn().mockResolvedValue({}),
          updateComment: jest.fn().mockResolvedValue({}),
          addLabels: jest.fn().mockResolvedValue({}),
          removeLabel: jest.fn().mockResolvedValue({}),
          get: jest.fn().mockResolvedValue({ data: { title: 'Test', body: 'Body' } }),
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          create: jest.fn().mockResolvedValue({ data: { number: 42 } }),
        },
        pulls: {
          create: jest.fn().mockResolvedValue({ data: { number: 99 } }),
          get: jest.fn().mockResolvedValue({ data: { title: 'PR title', body: 'Issue #7', head: { ref: 'existing-branch' } } }),
        },
      },
      graphql: jest.fn().mockResolvedValue({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [],
            },
          },
        },
      }),
    };

    controller = new BotController(mockOctokit, { owner: 'test-org', repo: 'test-repo' });
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('posts an offline welcome when no OpenAI key is configured', async () => {
    delete process.env.OPENAI_API_KEY;

    await controller.handleWelcome(1);

    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 1,
      body: expect.stringContaining('No `OPENAI_API_KEY` was found'),
    }));
  });

  it('posts a Codex welcome when OpenAI is configured', async () => {
    process.env.OPENAI_API_KEY = 'mock';

    await controller.handleWelcome(1);

    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 1,
      body: expect.stringContaining('configured to run **Codex** through OpenAI'),
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 1,
      body: expect.stringContaining('ready for breakdown'),
    }));
  });

  it('uses Codex for planning and updates the state label', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      generateImplementationPlan: jest.fn().mockResolvedValue({ action: 'plan', content: '# Architectural Plan' }),
    }));

    await controller.handleCommand({
      number: 10,
      author: 'bob',
      body: 'ready for planning without questions',
      labels: ['state:idle', 'model:fast'],
      isPR: false,
    });

    const runner = (CodexRunner as jest.Mock).mock.results.at(-1)?.value;
    expect(runner.generateImplementationPlan).toHaveBeenCalledWith('Test', 'Body', true, 'fast');
    expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(expect.objectContaining({
      labels: ['state:planned'],
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('🤖 **Planning started**'),
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 10,
      body: expect.stringContaining('**What you can do next**'),
    }));
  });

  it('uses Codex for specification splitting', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      generateEpicSplit: jest.fn().mockResolvedValue([
        { title: 'Spec 1', specMarkdown: '# Feature: Spec 1' },
        { title: 'Spec 2', specMarkdown: '# Feature: Spec 2' },
      ]),
    }));

    await controller.handleCommand({
      number: 12,
      author: 'alice',
      body: 'ready for specification',
      labels: ['state:idle'],
      isPR: false,
    });

    const runner = (CodexRunner as jest.Mock).mock.results.at(-1)?.value;
    expect(runner.generateEpicSplit).toHaveBeenCalledWith('Test', 'Body', 'strong');
    expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(2);
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 42,
      body: expect.stringContaining('Hello! I am your AI Developer Bot.'),
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 12,
      body: expect.stringContaining('✅ **Breakdown completed.**'),
    }));
  });

  it('accepts ready for breakdown as the child-spec command alias', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      generateEpicSplit: jest.fn().mockResolvedValue([
        { title: 'Spec 1', specMarkdown: '# Feature: Spec 1' },
      ]),
    }));

    await controller.handleCommand({
      number: 12,
      author: 'alice',
      body: 'ready for breakdown',
      labels: ['state:idle'],
      isPR: false,
    });

    const runner = (CodexRunner as jest.Mock).mock.results.at(-1)?.value;
    expect(runner.generateEpicSplit).toHaveBeenCalledWith('Test', 'Body', 'strong');
  });

  it('fails specification splitting instead of posting an empty success message', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      generateEpicSplit: jest.fn().mockResolvedValue([]),
    }));

    await expect(controller.handleCommand({
      number: 12,
      author: 'alice',
      body: 'ready for specification',
      labels: ['state:idle'],
      isPR: false,
    })).rejects.toThrow('Codex returned no child specifications.');

    expect(mockOctokit.rest.issues.create).not.toHaveBeenCalled();
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('Codex returned no child specifications'),
    }));
  });

  it('uses Codex for implementation and then opens a PR', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      implementFeature: jest.fn().mockResolvedValue({
        summary: 'Implemented the feature in the local repository.',
        changedFiles: ['src/foo.ts'],
      }),
    }));

    const mockGit = {
      checkoutNewBranch: jest.fn(),
      applyMissingFileSystemChanges: jest.fn().mockResolvedValue(['specs/07-test.md', 'plans/07-test-plan.md']),
      hasWorkingTreeChanges: jest.fn().mockResolvedValue(true),
      commitAndPush: jest.fn().mockResolvedValue(true),
    };
    (GitManager as jest.Mock).mockImplementation(() => mockGit);
    mockOctokit.rest.issues.listComments
      .mockResolvedValueOnce({ data: [{ body: '**Implementation Plan**\n\n# Plan' }] })
      .mockResolvedValueOnce({ data: [{ body: '**Implementation Plan**\n\n# Plan' }] });

    await controller.handleCommand({
      number: 7,
      author: 'eve',
      body: 'ready for implementation',
      labels: ['state:planned', 'model:strong'],
      isPR: false,
    });

    const runner = (CodexRunner as jest.Mock).mock.results.at(-1)?.value;
    expect(runner.implementFeature).toHaveBeenCalledWith('Test', 'Body', '**Implementation Plan**\n\n# Plan', 'strong');
    expect(mockGit.checkoutNewBranch).toHaveBeenCalledWith('codex/issue-7-test-lun2elv9');
    expect(mockGit.applyMissingFileSystemChanges).toHaveBeenCalledWith([
      { path: 'specs/07-test.md', content: 'Body\n' },
      { path: 'plans/07-test-plan.md', content: '# Plan\n' },
    ]);
    expect(mockGit.commitAndPush).toHaveBeenCalledWith('Fix #7: Auto implementation', 'codex/issue-7-test-lun2elv9');
    expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith(expect.objectContaining({
      head: 'codex/issue-7-test-lun2elv9',
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 7,
      body: expect.stringContaining('🤖 **Implementation started**'),
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 7,
      body: expect.stringContaining('**Persisted artifacts:**'),
    }));
  });

  it('uses only open review threads for Codex rework', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      applyReviewRework: jest.fn().mockResolvedValue({
        summary: 'Addressed the requested review changes.',
        changedFiles: ['src/foo.ts'],
      }),
    }));

    const mockGit = {
      checkoutNewBranch: jest.fn(),
      applyMissingFileSystemChanges: jest.fn().mockResolvedValue(['specs/07-feature-title.md', 'plans/07-feature-title-plan.md']),
      hasWorkingTreeChanges: jest.fn().mockResolvedValue(true),
      commitAndPush: jest.fn().mockResolvedValue(true),
    };
    (GitManager as jest.Mock).mockImplementation(() => mockGit);
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
                      author: { login: 'bob' },
                    },
                  ],
                },
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
                      author: { login: 'alice' },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    mockOctokit.rest.issues.get.mockResolvedValueOnce({ data: { title: 'Feature Title', body: 'Feature Spec' } });
    mockOctokit.rest.issues.listComments.mockResolvedValueOnce({ data: [{ body: '**Implementation Plan**\n\n# Plan' }] });

    await controller.handleCommand({
      number: 99,
      author: 'bob',
      body: 'ready for rework',
      labels: ['state:in-review', 'model:fast'],
      isPR: true,
    });

    const runner = (CodexRunner as jest.Mock).mock.results.at(-1)?.value;
    expect(runner.applyReviewRework).toHaveBeenCalledWith(
      'Feature Title',
      'Feature Spec',
      '**Implementation Plan**\n\n# Plan',
      expect.stringContaining('Please simplify this message.'),
      'fast'
    );
    expect(runner.applyReviewRework).toHaveBeenCalledWith(
      'Feature Title',
      'Feature Spec',
      '**Implementation Plan**\n\n# Plan',
      expect.not.stringContaining('Old resolved comment.'),
      'fast'
    );
    expect(mockGit.hasWorkingTreeChanges).toHaveBeenCalled();
    expect(mockGit.applyMissingFileSystemChanges).toHaveBeenCalledWith([
      { path: 'specs/07-feature-title.md', content: 'Feature Spec\n' },
      { path: 'plans/07-feature-title-plan.md', content: '# Plan\n' },
    ]);
    expect(mockGit.commitAndPush).toHaveBeenCalledWith('PR Rework: address review feedback', 'existing-branch');
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 99,
      body: expect.stringContaining('Only unresolved review feedback will be addressed.'),
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 99,
      body: expect.stringContaining('If everything looks good, merge the PR.'),
    }));
  });

  it('passes same-comment instruction to Codex refinement', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      applyReviewRefinement: jest.fn().mockResolvedValue({
        summary: 'Applied the requested refinement.',
        changedFiles: ['src/foo.ts'],
      }),
    }));

    const mockGit = {
      checkoutNewBranch: jest.fn(),
      applyMissingFileSystemChanges: jest.fn().mockResolvedValue(['specs/07-feature-title.md', 'plans/07-feature-title-plan.md']),
      hasWorkingTreeChanges: jest.fn().mockResolvedValue(true),
      commitAndPush: jest.fn().mockResolvedValue(true),
    };
    (GitManager as jest.Mock).mockImplementation(() => mockGit);
    mockOctokit.rest.issues.get.mockResolvedValueOnce({ data: { title: 'Feature Title', body: 'Feature Spec' } });
    mockOctokit.rest.issues.listComments.mockResolvedValueOnce({ data: [{ body: '**Implementation Plan**\n\n# Plan' }] });

    await controller.handleCommand({
      number: 99,
      author: 'bob',
      body: 'ready for refinement make the bot tone friendlier and more concise',
      labels: ['state:in-review', 'model:strong'],
      isPR: true,
    });

    const runner = (CodexRunner as jest.Mock).mock.results.at(-1)?.value;
    expect(runner.applyReviewRefinement).toHaveBeenCalledWith(
      'Feature Title',
      'Feature Spec',
      '**Implementation Plan**\n\n# Plan',
      'make the bot tone friendlier and more concise',
      'strong'
    );
    expect(mockGit.hasWorkingTreeChanges).toHaveBeenCalled();
    expect(mockGit.applyMissingFileSystemChanges).toHaveBeenCalledWith([
      { path: 'specs/07-feature-title.md', content: 'Feature Spec\n' },
      { path: 'plans/07-feature-title-plan.md', content: '# Plan\n' },
    ]);
    expect(mockGit.commitAndPush).toHaveBeenCalledWith('PR Refinement: apply requested polish', 'existing-branch');
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 99,
      body: expect.stringContaining('🤖 **Refinement started**'),
    }));
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 99,
      body: expect.stringContaining('If everything looks good, merge the PR.'),
    }));
  });

  it('fails rework instead of claiming success when no commit is produced', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      applyReviewRework: jest.fn().mockResolvedValue({
        summary: 'Applied the requested review changes.',
        changedFiles: ['src/foo.ts'],
      }),
    }));

    const mockGit = {
      checkoutNewBranch: jest.fn(),
      applyMissingFileSystemChanges: jest.fn().mockResolvedValue([]),
      hasWorkingTreeChanges: jest.fn().mockResolvedValue(false),
      commitAndPush: jest.fn().mockResolvedValue(false),
    };
    (GitManager as jest.Mock).mockImplementation(() => mockGit);
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
                      author: { login: 'bob' },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    mockOctokit.rest.issues.get.mockResolvedValueOnce({ data: { title: 'Feature Title', body: 'Feature Spec' } });
    mockOctokit.rest.issues.listComments.mockResolvedValueOnce({ data: [{ body: '**Implementation Plan**\n\n# Plan' }] });

    await expect(controller.handleCommand({
      number: 99,
      author: 'bob',
      body: 'ready for rework',
      labels: ['state:in-review', 'model:fast'],
      isPR: true,
    })).rejects.toThrow('Codex reported file changes (src/foo.ts), but git status stayed clean. Aborting before commit.');

    expect(mockOctokit.rest.issues.createComment).not.toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 99,
      body: expect.stringContaining('✅ Addressed feedback pushed'),
    }));
    expect(mockGit.applyMissingFileSystemChanges).not.toHaveBeenCalled();
    expect(mockGit.commitAndPush).not.toHaveBeenCalled();
  });

  it('rejects unsupported non-codex agent labels', async () => {
    await expect(controller.handleCommand({
      number: 1,
      author: 'tester',
      body: 'ready for planning',
      labels: ['state:idle', 'agent:gemini'],
      isPR: false,
    })).rejects.toThrow('Only `agent:codex` is supported in this repository.');
  });

  it('posts command help for common near-miss commands', async () => {
    await controller.handleCommand({
      number: 15,
      author: 'tester',
      body: 'ready for planning!',
      labels: ['state:idle'],
      isPR: false,
    });

    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 15,
      body: expect.stringContaining('ready for planning without questions'),
    }));
  });

  it('creates artifact index comment on rework when marker is missing', async () => {
    (CodexRunner as jest.Mock).mockImplementation(() => ({
      applyReviewRework: jest.fn().mockResolvedValue({
        summary: 'Addressed feedback.',
        changedFiles: ['src/foo.ts'],
      }),
    }));

    const mockGit = {
      checkoutNewBranch: jest.fn(),
      applyFileSystemChanges: jest.fn().mockResolvedValue(undefined),
      hasWorkingTreeChanges: jest.fn().mockResolvedValue(true),
      commitAndPush: jest.fn().mockResolvedValue(true),
    };
    (GitManager as jest.Mock).mockImplementation(() => mockGit);
    mockOctokit.graphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [{
              isResolved: false,
              isOutdated: false,
              comments: { nodes: [{ body: 'Fix this.', path: 'src/foo.ts', line: 2, originalLine: 2, diffHunk: '@@', author: { login: 'bob' } }] },
            }],
          },
        },
      },
    });
    mockOctokit.rest.issues.get.mockResolvedValueOnce({ data: { title: 'Feature', body: 'Spec' } });
    mockOctokit.rest.issues.listComments
      .mockResolvedValueOnce({ data: [{ body: '**Implementation Plan**\n\n# Plan' }] })
      .mockResolvedValueOnce({ data: [{ id: 1, body: 'human note', user: { type: 'User' } }] });

    await controller.handleCommand({ number: 99, author: 'bob', body: 'ready for rework', labels: ['state:in-review'], isPR: true });

    expect(mockOctokit.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(expect.objectContaining({
      issue_number: 99,
      body: expect.stringContaining('<!-- ai-artifact-index:bot -->'),
    }));
  });
});
