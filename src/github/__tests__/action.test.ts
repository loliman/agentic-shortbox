import * as core from '@actions/core';
import * as github from '@actions/github';
import { BotController } from '../../bot/controller';
import { main } from '../action';

jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('../../bot/controller');

const MockBotController = BotController as unknown as jest.Mock;

describe('GitHub Action Router (main)', () => {
  let originalExit: NodeJS.Process['exit'];
  const mockExit = jest.fn() as unknown as NodeJS.Process['exit'];

  beforeEach(() => {
    jest.clearAllMocks();
    originalExit = process.exit;
    process.exit = mockExit;

    // Reset GitHub context mocks
    (github as any).context = {
      repo: { owner: 'org', repo: 'app' },
      eventName: '',
      payload: {}
    };
    (github as any).getOctokit = jest.fn();
    process.env.GITHUB_TOKEN = 'mock';
  });

  afterAll(() => {
    process.exit = originalExit;
    delete process.env.GITHUB_TOKEN;
  });

  it('routes correctly on issue opened (handleWelcome)', async () => {
    (github as any).context.eventName = 'issues';
    (github as any).context.payload = {
      action: 'opened',
      issue: { number: 10 }
    };

    await main();

    expect(BotController).toHaveBeenCalled();
    const mockControllerInstance = MockBotController.mock.instances[0];
    expect(mockControllerInstance.handleWelcome).toHaveBeenCalledWith(10);
  });

  it('routes correctly on issue_comment created (handleCommand)', async () => {
    (github as any).context.eventName = 'issue_comment';
    (github as any).context.payload = {
      action: 'created',
      issue: { number: 42, labels: [{ name: 'state:idle' }] },
      comment: { body: 'ready for planning', user: { login: 'octocat' } }
    };

    await main();

    const mockControllerInstance = MockBotController.mock.instances[0];
    expect(mockControllerInstance.handleCommand).toHaveBeenCalledWith(expect.objectContaining({
       number: 42,
       author: 'octocat',
       body: 'ready for planning',
       labels: ['state:idle'],
       isPR: false
    }));
  });

  it('ignores bot-authored issue comments', async () => {
    (github as any).context.eventName = 'issue_comment';
    (github as any).context.payload = {
      action: 'created',
      issue: { number: 42, labels: [{ name: 'state:idle' }] },
      comment: { body: 'ready for planning', user: { login: 'github-actions[bot]', type: 'Bot' } }
    };

    await main();

    const mockControllerInstance = MockBotController.mock.instances[0];
    expect(mockControllerInstance.handleCommand).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith('[Action] Ignoring bot-authored comment event.');
  });

  it('routes submitted pull request reviews to the command flow', async () => {
    (github as any).context.eventName = 'pull_request_review';
    (github as any).context.payload = {
      action: 'submitted',
      pull_request: { number: 77, labels: [{ name: 'state:in-review' }] },
      review: { body: 'ready for rework', user: { login: 'octocat', type: 'User' } }
    };

    await main();

    const mockControllerInstance = MockBotController.mock.instances[0];
    expect(mockControllerInstance.handleCommand).toHaveBeenCalledWith({
      number: 77,
      author: 'octocat',
      body: 'ready for rework',
      labels: ['state:in-review'],
      isPR: true
    });
  });

  it('ignores bot-authored submitted reviews', async () => {
    (github as any).context.eventName = 'pull_request_review';
    (github as any).context.payload = {
      action: 'submitted',
      pull_request: { number: 77, labels: [{ name: 'state:in-review' }] },
      review: { body: 'ready for rework', user: { login: 'github-actions[bot]', type: 'Bot' } }
    };

    await main();

    const mockControllerInstance = MockBotController.mock.instances[0];
    expect(mockControllerInstance.handleCommand).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith('[Action] Ignoring bot-authored review event.');
  });

  it('sets failed and exits 1 on catastrophic top-level errors', async () => {
    (github as any).context.eventName = 'issues';
    (github as any).context.payload = {
      action: 'opened',
      issue: { number: 99 }
    };

    // Force BotController initialization to throw
    MockBotController.mockImplementationOnce(() => {
       throw new Error('Fatal Configuration Fault');
    });

    await main();

    expect(core.setFailed).toHaveBeenCalledWith('[AI Bot Execution Error]: Fatal Configuration Fault');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
