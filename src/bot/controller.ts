import * as core from '@actions/core';
import fs from 'fs';
import path from 'path';
import { LLMClient } from './llm/client';
import { GitManager } from './git/manager';
import { parseCommand, parseConfiguration } from '../core/parser';
import { extractCurrentState, evaluateTransition, IllegalTransitionError } from '../core/state-machine';

class MissingPlanError extends Error {
  constructor() {
    super('Cannot start implementation because no implementation plan exists yet.');
    this.name = 'MissingPlanError';
  }
}

interface ReviewThreadCommentNode {
  body?: string | null;
  path?: string | null;
  line?: number | null;
  originalLine?: number | null;
  diffHunk?: string | null;
  author?: {
    login?: string | null;
  } | null;
}

interface ReviewThreadNode {
  isResolved?: boolean | null;
  isOutdated?: boolean | null;
  comments?: {
    nodes?: ReviewThreadCommentNode[] | null;
  } | null;
}

interface OpenReviewThread {
  body: string;
  path: string;
  line: number | null;
  diffHunk: string;
}

export class BotController {
  private octokit: any;
  private ctx: { owner: string; repo: string };

  constructor(octokit: any, ctx: { owner: string; repo: string }) {
    this.octokit = octokit;
    this.ctx = ctx;
  }

  // 1. WELCOME
  async handleWelcome(issueNumber: number) {
    core.info(`[Bot] Posting Welcome Message on Issue #${issueNumber}`);
    
    // Determine available models dynamically from Secrets
    const availableModels = [];
    if (process.env.OPENAI_API_KEY) {
       availableModels.push('- **OpenAI**: Use label `agent:codex` combined with `model:fast` or `model:strong`');
    }
    if (process.env.GEMINI_API_KEY) {
       availableModels.push('- **Google Gemini**: Use label `agent:gemini` combined with `model:fast` or `model:strong`');
    }
    
    let message = '';

    if (availableModels.length === 0) {
       message = [
         '👋 **Hello! I am your AI Developer Bot.**',
         '⚠️ **I am currently offline.** No API secrets (`OPENAI_API_KEY` or `GEMINI_API_KEY`) were found in this repository.',
         'Please configure the secrets in your GitHub Settings so I can assist you with your issues!',
       ].join('\n\n');
    } else {
       message = [
         '👋 **Hello! I am your AI Developer Bot.**',
         `I have detected the following LLM configurations are available for this repository:\n${availableModels.join('\n')}`,
         [
           '**How to use me:**',
           '1. Apply the configuration labels you want to this issue (e.g., `agent:codex` and `model:fast`).',
           '2. Type `ready for planning` in a comment, and I will draft a technical plan based on your issue description.',
           '3. Type `ready for implementation` to let me write the code and open a Pull Request.',
           '4. Type `ready for specification` to let me split this epic into sub-issues.',
         ].join('\n'),
         'I strictly follow your repository\'s `AGENTS.md` and `docs/` when responding.',
       ].join('\n\n');
    }

    await this.octokit.rest.issues.createComment({
      ...this.ctx,
      issue_number: issueNumber,
      body: message
    });
  }

  // 2. COMMAND PARSER & GATEWAY
  async handleCommand(payload: { number: number; author: string; body: string; labels: string[], isPR: boolean }) {
    const command = parseCommand(payload.body);

    if (payload.isPR && command?.type === 'rework') {
      try {
        return await this.handleReviewRework(payload);
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    }

    if (payload.isPR && command?.type === 'refinement') {
      try {
        return await this.handleReviewRefinement(payload, command.additionalText || '');
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    }
    
    // Parse generic action commands
    if (!command) return core.info('[Bot] No AI command detected in comment.');
    
    // State Checks (Guard)
    const currentState = extractCurrentState(payload.labels);
    try {
      evaluateTransition(currentState, command.type);
    } catch (err: any) {
      if (err instanceof IllegalTransitionError) {
        core.info(`[Bot] State Transition Refused: ${err.message}`);
        await this.postStatus(payload.number, `🤖 **Workflow Error**\n\nI cannot execute this command because it violates our workflow state rules:\n> *${err.message}*`);
        return;
      }
      throw err;
    }

    const config = parseConfiguration(payload.labels);
    
    core.info(`[Bot] Command ${command.type.toUpperCase()} intercepted from @${payload.author}`);

    if (command.type === 'define') {
      try {
        await this.handleSpecification(payload, config);
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    } else if (command.type === 'plan') {
      const force = payload.body.includes('ready for planning!');
      try {
        await this.handlePlanning(payload, config, force);
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    } else if (command.type === 'implement') {
      try {
        await this.handleImplementation(payload, config);
      } catch(e: any) {
         await this.postStatus(payload.number, this.formatSystemError(e));
         throw e;
      }
    }
  }

  // 3. SPECIFICATION (Epic Splitting)
  async handleSpecification(payload: any, config: any) {
    await this.postStatus(payload.number, "Let me read the specifications and split this epic for you...");
    const issueData = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: payload.number });
    
    const agent = new LLMClient();
    const tasks = await agent.generateEpicSplit(issueData.data.title, issueData.data.body);
    
    // Create sub issues 
    const links = [];
    for (const spec of tasks) {
       const created = await this.octokit.rest.issues.create({
          ...this.ctx,
          title: spec.title,
         body: spec.specMarkdown
       });
       links.push(`#${created.data.number} - ${spec.title}`);
    }

    await this.postStatus(
      payload.number,
      [
        '✅ **Epic split completed.**',
        'Here are your generated child tasks:',
        links.map(l => `- [ ] ${l}`).join('\n'),
      ].join('\n\n')
    );
  }

  // 4. PLANNING
  async handlePlanning(payload: any, config: any, force: boolean) {
    await this.postStatus(payload.number, "Drafting the implementation plan...");
    const issueData = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: payload.number });
    
    const agent = new LLMClient();
    const result = await agent.generateImplementationPlan(issueData.data.title, issueData.data.body, force);

    if (result.action === 'question') {
      await this.postStatus(payload.number, ['**Clarification Needed**', result.content].join('\n\n'));
      await this.replaceStateLabel(payload.number, payload.labels, 'state:clarification_needed');
    } else {
      await this.postStatus(payload.number, ['**Implementation Plan**', result.content].join('\n\n'));
      await this.replaceStateLabel(payload.number, payload.labels, 'state:planned');
    }
  }

  // 5. IMPLEMENTATION
  async handleImplementation(payload: any, config: any) {
    const hasPlan = await this.hasImplementationPlan(payload.number);
    if (!hasPlan) {
      throw new MissingPlanError();
    }

    await this.postStatus(payload.number, "Executing local implementation...");
    
    const issueData = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: payload.number });
    const agent = new LLMClient();
    
    // For Implementation, we read the entire code via the Native Workspace FileSystem
    const codeOperations = await agent.generateCode(issueData.data.title, issueData.data.body);
    
    const git = new GitManager(process.env.GITHUB_TOKEN || '');
    const branchName = this.buildImplementationBranchName(payload.number, issueData.data.title || '');
    
    // Git checkouts locally
    await git.checkoutNewBranch(branchName);
    await git.applyFileSystemChanges(codeOperations);
    await git.commitAndPush(`Fix #${payload.number}: Auto implementation`, branchName);

    // Create PR via Octokit
    const pr = await this.octokit.rest.pulls.create({
      ...this.ctx,
      title: `AI Implementation for #${payload.number}`,
      body: [
        `This Pull Request implements auto-generated code for Issue #${payload.number}.`,
        `Reviewer: @${payload.author}`,
        'Leave review feedback on the PR and then comment `ready for rework` when you want me to apply it.',
      ].join('\n\n'),
      head: branchName,
      base: 'main'
    });

    await this.postStatus(pr.data.number, this.buildPullRequestWelcomeMessage(payload.number, payload.author));
    await this.postStatus(
      payload.number,
      [
        `✅ **Code generated and pushed to PR #${pr.data.number}.**`,
        'Go review it!',
      ].join('\n\n')
    );
    await this.replaceStateLabel(payload.number, payload.labels, 'state:in-review');
  }

  // 6. PR REVIEW REWORK
  async handleReviewRework(payload: any) {
     await this.postStatus(payload.number, "Review feedback detected. I am collecting the PR comments, file context, and current diff before applying the requested rework...");
     
     // Pull Request issues can expose the base ref
     const pr = await this.octokit.rest.pulls.get({ ...this.ctx, pull_number: payload.number });
     const headBranch = pr.data.head.ref;
     
     const git = new GitManager(process.env.GITHUB_TOKEN || '');
     await git.checkoutNewBranch(headBranch); // Checkout existing head
     const reworkContext = await this.buildPullRequestReworkContext(payload.number);
     
     const agent = new LLMClient();
     const codeOps = await agent.generateCode(
       `PR Rework for #${payload.number}`,
       'Apply only the requested review feedback from the PR context. Prefer the exact files and lines referenced in the review feedback. Keep all unrelated code unchanged.',
       reworkContext
     );
     await git.applyFileSystemChanges(codeOps);
     await git.commitAndPush(`PR Rework: address review feedback`, headBranch);
     await this.postStatus(payload.number, this.buildReworkSummaryComment(codeOps, reworkContext));
     
     await this.postStatus(payload.number, `✅ Addressed feedback pushed to ${headBranch}.`);
  }

  async handleReviewRefinement(payload: any, refinementInstruction: string) {
     if (!refinementInstruction.trim()) {
      throw new Error('`ready for refinement` requires an instruction in the same comment. Put your refinement request after the command.');
     }

     await this.postStatus(payload.number, 'General refinement request detected. I am collecting the current PR context before applying the requested improvements...');

     const pr = await this.octokit.rest.pulls.get({ ...this.ctx, pull_number: payload.number });
     const headBranch = pr.data.head.ref;

     const git = new GitManager(process.env.GITHUB_TOKEN || '');
     await git.checkoutNewBranch(headBranch);
     const refinementContext = await this.buildPullRequestRefinementContext(payload.number, refinementInstruction);

     const agent = new LLMClient();
     const codeOps = await agent.generateCode(
       `PR Refinement for #${payload.number}`,
       `Apply this general refinement request exactly: ${refinementInstruction}`,
       refinementContext
     );

     await git.applyFileSystemChanges(codeOps);
     await git.commitAndPush('PR Refinement: apply requested polish', headBranch);
     await this.postStatus(payload.number, this.buildRefinementSummaryComment(codeOps, refinementInstruction));
     await this.postStatus(payload.number, `✅ Refinement updates pushed to ${headBranch}.`);
  }
  
  // -- Utilities --
  private async postStatus(issueNumber: number, body: string) {
    await this.octokit.rest.issues.createComment({ ...this.ctx, issue_number: issueNumber, body });
  }

  private async replaceStateLabel(issueNumber: number, currentLabels: string[], newLabel: string) {
    const stateLabels = currentLabels.filter((l: string) => l.startsWith('state:'));
    for (const lbl of stateLabels) {
      await this.octokit.rest.issues.removeLabel({ ...this.ctx, issue_number: issueNumber, name: lbl });
    }
    await this.octokit.rest.issues.addLabels({ ...this.ctx, issue_number: issueNumber, labels: [newLabel] });
  }

  private async hasImplementationPlan(issueNumber: number) {
    const comments = await this.octokit.rest.issues.listComments({
      ...this.ctx,
      issue_number: issueNumber,
      per_page: 100
    });

    return comments.data.some((comment: any) => {
      const body = typeof comment.body === 'string' ? comment.body : '';
      return body.startsWith('**Implementation Plan**');
    });
  }

  private async buildPullRequestReworkContext(prNumber: number) {
    const [openReviewThreads, issueComments, files, diff] = await Promise.all([
      this.fetchOpenReviewThreads(prNumber),
      this.octokit.rest.issues.listComments({ ...this.ctx, issue_number: prNumber, per_page: 100 }),
      this.octokit.rest.pulls.listFiles({ ...this.ctx, pull_number: prNumber, per_page: 100 }),
      this.fetchPullRequestDiff(prNumber),
    ]);

    const reviewCommentLines = openReviewThreads.map((thread) => {
        const path = thread.path ? `file=${thread.path}` : 'file=unknown';
        const line = thread.line ? ` line=${thread.line}` : '';
        const hunk = typeof thread.diffHunk === 'string' && thread.diffHunk.trim()
          ? `\n  hunk:\n${thread.diffHunk}`
          : '';
        const body = typeof thread.body === 'string' ? thread.body.trim() : '';
        return `- ${path}${line}: ${body}${hunk}`;
      });

    const discussionLines = issueComments.data
      .filter((comment: any) => comment.user?.type !== 'Bot')
      .filter((comment: any) => {
        const body = typeof comment.body === 'string' ? comment.body.trim().toLowerCase() : '';
        return body && body !== 'ready for rework';
      })
      .map((comment: any) => `- @${comment.user?.login || 'unknown'}: ${String(comment.body || '').trim()}`);

    const changedFiles = files.data.map((file: any) => {
      const patch = typeof file.patch === 'string' ? file.patch : '';
      return `- ${file.filename}\n${patch}`;
    });

    const referencedPaths = new Set<string>();
    for (const thread of openReviewThreads) {
      if (typeof thread.path === 'string' && thread.path) {
        referencedPaths.add(thread.path);
      }
    }
    for (const file of files.data) {
      if (typeof file.filename === 'string' && file.filename) {
        referencedPaths.add(file.filename);
      }
    }

    const workspaceFiles = Array.from(referencedPaths)
      .map((filePath) => this.readWorkspaceFileForReview(filePath))
      .filter((entry): entry is string => Boolean(entry));

    if (
      reviewCommentLines.length === 0 &&
      discussionLines.length === 0
    ) {
      throw new Error('No open PR feedback was found. Leave unresolved review feedback or PR discussion feedback first, then trigger `ready for rework`.');
    }

    return [
      '=== OPEN PR REVIEW FEEDBACK ===',
      reviewCommentLines.length ? reviewCommentLines.join('\n') : 'No open inline review comments found.',
      '',
      '=== PR DISCUSSION COMMENTS ===',
      discussionLines.length ? discussionLines.join('\n') : 'No PR discussion comments found.',
      '',
      '=== CHANGED FILES ===',
      changedFiles.length ? changedFiles.join('\n\n') : 'No changed files reported.',
      '',
      '=== CURRENT FILE CONTENTS ===',
      workspaceFiles.length ? workspaceFiles.join('\n\n') : 'No local file content available.',
      '',
      '=== PR DIFF ===',
      diff || 'No diff available.',
    ].join('\n');
  }

  private async buildPullRequestRefinementContext(prNumber: number, refinementInstruction: string) {
    const [openReviewThreads, issueComments, files, diff] = await Promise.all([
      this.fetchOpenReviewThreads(prNumber),
      this.octokit.rest.issues.listComments({ ...this.ctx, issue_number: prNumber, per_page: 100 }),
      this.octokit.rest.pulls.listFiles({ ...this.ctx, pull_number: prNumber, per_page: 100 }),
      this.fetchPullRequestDiff(prNumber),
    ]);

    const reviewCommentLines = openReviewThreads.map((thread) => {
      const path = thread.path ? `file=${thread.path}` : 'file=unknown';
      const line = thread.line ? ` line=${thread.line}` : '';
      return `- ${path}${line}: ${thread.body}`;
    });

    const discussionLines = issueComments.data
      .filter((comment: any) => comment.user?.type !== 'Bot')
      .filter((comment: any) => {
        const body = typeof comment.body === 'string' ? comment.body.trim().toLowerCase() : '';
        return body && !body.startsWith('ready for rework') && !body.startsWith('ready for refinement');
      })
      .map((comment: any) => `- @${comment.user?.login || 'unknown'}: ${String(comment.body || '').trim()}`);

    const referencedPaths = new Set<string>();
    for (const thread of openReviewThreads) {
      if (thread.path) referencedPaths.add(thread.path);
    }
    for (const file of files.data) {
      if (typeof file.filename === 'string' && file.filename) {
        referencedPaths.add(file.filename);
      }
    }

    const workspaceFiles = Array.from(referencedPaths)
      .map((filePath) => this.readWorkspaceFileForReview(filePath))
      .filter((entry): entry is string => Boolean(entry));

    return [
      '=== REFINEMENT INSTRUCTION ===',
      refinementInstruction,
      '',
      '=== OPEN REVIEW FEEDBACK ===',
      reviewCommentLines.length ? reviewCommentLines.join('\n') : 'No open inline review comments found.',
      '',
      '=== GENERAL PR DISCUSSION ===',
      discussionLines.length ? discussionLines.join('\n') : 'No general PR discussion comments found.',
      '',
      '=== CURRENT FILE CONTENTS ===',
      workspaceFiles.length ? workspaceFiles.join('\n\n') : 'No local file content available.',
      '',
      '=== PR DIFF ===',
      diff || 'No diff available.',
    ].join('\n');
  }

  private buildReworkSummaryComment(
    codeOps: { path: string, content: string }[],
    reworkContext: string
  ) {
    const processedFeedback = this.extractProcessedFeedback(reworkContext);
    const changedFiles = codeOps.map((op) => `- \`${op.path}\``);

    return [
      '🛠️ **Rework applied**',
      processedFeedback.length
        ? ['**Processed feedback:**', processedFeedback.join('\n')].join('\n')
        : '**Processed feedback:**\n- Review context was collected and applied.',
      changedFiles.length
        ? ['**Updated files:**', changedFiles.join('\n')].join('\n')
        : '**Updated files:**\n- No file list available.',
    ].join('\n\n');
  }

  private buildRefinementSummaryComment(
    codeOps: { path: string, content: string }[],
    refinementInstruction: string
  ) {
    const changedFiles = codeOps.map((op) => `- \`${op.path}\``);

    return [
      '✨ **Refinement applied**',
      ['**Instruction:**', refinementInstruction].join('\n'),
      changedFiles.length
        ? ['**Updated files:**', changedFiles.join('\n')].join('\n')
        : '**Updated files:**\n- No file list available.',
    ].join('\n\n');
  }

  private extractProcessedFeedback(reworkContext: string) {
    const feedbackSection = reworkContext
      .split('=== OPEN PR REVIEW FEEDBACK ===\n')[1]
      ?.split('\n\n=== PR DISCUSSION COMMENTS ===')[0]
      ?.trim();

    if (!feedbackSection || feedbackSection === 'No open inline review comments found.') {
      return [];
    }

    return feedbackSection
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .slice(0, 6);
  }

  private async fetchOpenReviewThreads(prNumber: number) {
    if (typeof this.octokit.graphql !== 'function') {
      return [];
    }

    const result = await this.octokit.graphql(
      `
        query OpenReviewThreads($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewThreads(first: 100) {
                nodes {
                  isResolved
                  isOutdated
                  comments(first: 20) {
                    nodes {
                      body
                      path
                      line
                      originalLine
                      diffHunk
                      author {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        owner: this.ctx.owner,
        repo: this.ctx.repo,
        number: prNumber,
      }
    );

    const nodes = (result?.repository?.pullRequest?.reviewThreads?.nodes || []) as ReviewThreadNode[];
    return nodes
      .filter((thread: ReviewThreadNode) => !thread?.isResolved && !thread?.isOutdated)
      .map((thread: ReviewThreadNode) => {
        const comments = (thread?.comments?.nodes || []).filter(
          (comment: ReviewThreadCommentNode) => comment?.author?.login && typeof comment.body === 'string'
        );
        const latestComment = comments[comments.length - 1];
        if (!latestComment) {
          return null;
        }

        return {
          body: latestComment.body,
          path: latestComment.path,
          line: latestComment.line || latestComment.originalLine,
          diffHunk: latestComment.diffHunk || '',
        };
      })
      .filter((thread): thread is OpenReviewThread => thread !== null);
  }

  private readWorkspaceFileForReview(filePath: string) {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      return '';
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const numbered = content
      .split('\n')
      .map((line, index) => `${index + 1}: ${line}`)
      .join('\n');

    return `--- ${filePath} ---\n${numbered}`;
  }

  private async fetchPullRequestDiff(prNumber: number) {
    const response = await this.octokit.rest.pulls.get({
      ...this.ctx,
      pull_number: prNumber,
      mediaType: {
        format: 'diff'
      }
    });

    return response.data as unknown as string;
  }

  private buildPullRequestWelcomeMessage(issueNumber: number, author: string) {
    return [
      '👋 **AI Review Helper**',
      `This Pull Request was created for Issue #${issueNumber}.`,
      [
        '**Review flow here:**',
        '1. Leave inline review comments or submit a full review on the PR.',
        '2. Either submit a review with the exact text `ready for rework` or comment `ready for rework` on the PR when the feedback set is complete.',
        '3. I will collect the review feedback, changed files, and diff, then apply only that rework.',
        '4. For broader polish, comment `ready for refinement <your instruction>` on the PR.',
      ].join('\n'),
      ['**Examples:**', '`ready for rework`\n`ready for refinement make all bot copy warmer and more concise`'].join('\n'),
      `Reviewer: @${author}`,
    ].join('\n\n');
  }

  private buildImplementationBranchName(issueNumber: number, issueTitle: string) {
    const slug = issueTitle
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);

    const suffix = Date.now().toString(36);
    return `codex/issue-${issueNumber}-${slug || 'implementation'}-${suffix}`;
  }

  private formatSystemError(error: { message?: string }) {
    const message = error.message || 'Unknown error';
    if (error instanceof MissingPlanError) {
      return '🤖 **Workflow Error**\n\nI cannot start implementation yet because this issue does not have an approved implementation plan. Please run `ready for planning` first and review the generated plan before trying `ready for implementation` again.';
    }
    const guidance = message.includes('GitHub Actions is not permitted to create or approve pull requests')
      ? '\n\nGitHub is rejecting PR creation from the workflow token. Enable the repository setting `Allow GitHub Actions to create and approve pull requests` under `Settings -> Actions -> General -> Workflow permissions`, then rerun the command.'
      : '\n\nThe LLM Controller encountered a critical failure. See Action Logs for details.';

    return `🚨 **System Error:**\n\n\`\`\`text\n${message}\n\`\`\`${guidance}`;
  }
}
