import { GitManager } from '../manager';
import fs from 'fs';
import util from 'util';
import path from 'path';

// Mock dependencies
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn()
  };
});
jest.mock('util', () => {
  const originalUtil = jest.requireActual('util');
  return {
    ...originalUtil,
    promisify: jest.fn(),
  };
});
import { exec } from 'child_process';
jest.mock('child_process');

const execAsyncMock = jest.fn();
(util.promisify as unknown as jest.Mock).mockReturnValue(execAsyncMock);

// Needs to be required after mock setup to capture the mocked promisified exec
const { GitManager: MockedGitManager } = require('../manager');

describe('GitManager', () => {
  let git: GitManager;

  beforeEach(() => {
    jest.clearAllMocks();
    git = new MockedGitManager('mocked-token');
    
    // Simulate current cwd
    process.env.GITHUB_WORKSPACE = '/mock/workspace';
    jest.spyOn(process, 'cwd').mockReturnValue('/mock/workspace');
  });

  afterAll(() => {
    delete process.env.GITHUB_WORKSPACE;
  });

  describe('applyFileSystemChanges', () => {
    it('creates directories and writes files correctly', async () => {
      const operations = [
        { path: 'src/fileA.ts', content: 'contentA' },
        { path: 'fileB.json', content: 'contentB' }
      ];

      await git.applyFileSystemChanges(operations);

      expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringMatching(/.*[\\\/]src$/), { recursive: true });
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/.*[\\\/]src[\\\/]fileA\.ts$/), 'contentA', 'utf8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/.*[\\\/]fileB\.json$/), 'contentB', 'utf8');
    });
  });

  describe('checkoutNewBranch', () => {
    it('configures git bot and creates branch successfully', async () => {
      execAsyncMock.mockResolvedValueOnce({}); // user.name
      execAsyncMock.mockResolvedValueOnce({}); // user.email
      execAsyncMock.mockResolvedValueOnce({}); // fetch origin branch
      execAsyncMock.mockResolvedValueOnce({ stdout: '' }); // ls-remote no branch
      execAsyncMock.mockResolvedValueOnce({}); // checkout -b

      await git.checkoutNewBranch('ai-feat-branch');

      expect(execAsyncMock).toHaveBeenCalledTimes(5);
      expect(execAsyncMock).toHaveBeenNthCalledWith(1, 'git config user.name "AI Bot Orchestrator"', expect.any(Object));
      expect(execAsyncMock).toHaveBeenNthCalledWith(2, 'git config user.email "bot@github.actions"', expect.any(Object));
      expect(execAsyncMock).toHaveBeenNthCalledWith(3, 'git fetch origin ai-feat-branch', expect.any(Object));
      expect(execAsyncMock).toHaveBeenNthCalledWith(4, 'git ls-remote --heads origin ai-feat-branch', expect.any(Object));
      expect(execAsyncMock).toHaveBeenNthCalledWith(5, 'git checkout -b ai-feat-branch', expect.any(Object));
    });

    it('falls back to switching branch if it already exists', async () => {
      execAsyncMock.mockResolvedValueOnce({}); // user.name
      execAsyncMock.mockResolvedValueOnce({}); // user.email
      execAsyncMock.mockResolvedValueOnce({}); // fetch origin branch
      execAsyncMock.mockResolvedValueOnce({ stdout: '' }); // ls-remote no branch
      // Mock failure on checkout -b
      execAsyncMock.mockRejectedValueOnce(new Error('fatal: A branch named ai-feat-branch already exists.'));
      execAsyncMock.mockResolvedValueOnce({}); // checkout ai-feat-branch (fallback)

      await git.checkoutNewBranch('ai-feat-branch');

      expect(execAsyncMock).toHaveBeenCalledWith('git checkout ai-feat-branch', expect.any(Object));
    });

    it('tracks the remote branch when it already exists on origin', async () => {
      execAsyncMock.mockResolvedValueOnce({}); // user.name
      execAsyncMock.mockResolvedValueOnce({}); // user.email
      execAsyncMock.mockResolvedValueOnce({}); // fetch origin branch
      execAsyncMock.mockResolvedValueOnce({ stdout: 'abc123\trefs/heads/ai-feat-branch\n' }); // ls-remote found
      execAsyncMock.mockResolvedValueOnce({}); // checkout -B from remote

      await git.checkoutNewBranch('ai-feat-branch');

      expect(execAsyncMock).toHaveBeenCalledWith(
        'git checkout -B ai-feat-branch origin/ai-feat-branch',
        expect.any(Object)
      );
    });
  });

  describe('commitAndPush', () => {
    it('performs full commit and push lifecycle', async () => {
      execAsyncMock.mockResolvedValue({});
      
      await expect(git.commitAndPush('Test Commit', 'ai-branch')).resolves.toBe(true);

      expect(execAsyncMock).toHaveBeenCalledWith('git add .', expect.any(Object));
      expect(execAsyncMock).toHaveBeenCalledWith("git commit -m 'Test Commit'", expect.any(Object));
      expect(execAsyncMock).toHaveBeenCalledWith('git push -u origin HEAD:ai-branch', expect.any(Object));
    });

    it('escapes quotes safely in commit messages', async () => {
      execAsyncMock.mockResolvedValue({});

      await expect(git.commitAndPush(`PR Feedback Fix: change "we" to "I"`, 'ai-branch')).resolves.toBe(true);

      expect(execAsyncMock).toHaveBeenCalledWith(
        `git commit -m 'PR Feedback Fix: change "we" to "I"'`,
        expect.any(Object)
      );
    });

    it('bypasses push gracefully if nothing to commit', async () => {
      execAsyncMock.mockResolvedValueOnce({}); // git add
      execAsyncMock.mockRejectedValueOnce({ stdout: 'nothing to commit, working tree clean' }); // git commit fails

      await expect(git.commitAndPush('Test Commit', 'ai-branch')).resolves.toBe(false);

      expect(execAsyncMock).not.toHaveBeenCalledWith('git push -u origin HEAD:ai-branch', expect.any(Object));
    });

    it('throws actual git errors explicitly', async () => {
      execAsyncMock.mockResolvedValueOnce({}); // git add
      execAsyncMock.mockRejectedValueOnce(new Error('fatal: unable to auto-detect email address')); // real fail
      
      await expect(git.commitAndPush('Test', 'ai')).rejects.toThrow('unable to auto-detect email address');
    });
  });
});
