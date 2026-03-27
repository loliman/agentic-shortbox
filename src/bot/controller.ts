import * as core from '@actions/core';
import { CodexRunner } from './codex/runner';
import { GitManager } from './git/manager';
import { parseCommand, parseConfiguration, suggestCommand } from '../core/parser';
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
    const message = process.env.OPENAI_API_KEY
      ? [
          '👋 **Hello! I am your AI Developer Bot.**',
          'This repository is configured to run **Codex** through OpenAI.',
          [
            '**How to use me:**',
            '1. Optionally apply `model:fast` or `model:strong` to this issue.',
            '2. Type `ready for planning` in a comment to generate an implementation plan.',
            '3. Type `ready for planning without questions` if you want a forced plan with no clarification step.',
            '4. Type `ready for implementation` to let Codex work in the checked-out repository and open a Pull Request.',
            '5. Type `ready for specification` to let Codex split this epic into child specs.',
          ].join('\n'),
          'For every command, Codex is instructed to inspect and obey `AGENTS.md`, `docs/`, `plans/`, and `specs/` from the repository itself.',
        ].join('\n\n')
      : [
          '👋 **Hello! I am your AI Developer Bot.**',
          '⚠️ **I am currently offline.** No `OPENAI_API_KEY` was found in this repository.',
          'Please configure the secret in GitHub so I can run Codex for your workflow commands.',
        ].join('\n\n');

    await this.octokit.rest.issues.createComment({
      ...this.ctx,
      issue_number: issueNumber,
      body: message
    });
  }

  // 2. COMMAND PARSER & GATEWAY
  async handleCommand(payload: { number: number; author: string; body: string; labels: string[], isPR: boolean }) {
    const command = parseCommand(payload.body);
    const config = parseConfiguration(payload.labels);

    if (payload.isPR && command?.type === 'rework') {
      try {
        return await this.handleReviewRework(payload, config);
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    }

    if (payload.isPR && command?.type === 'refinement') {
      try {
        return await this.handleReviewRefinement(payload, command.additionalText || '', config);
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    }
    
    // Parse generic action commands
    if (!command) {
      const suggestion = suggestCommand(payload.body);
      if (suggestion) {
        await this.postStatus(
          payload.number,
          [
            '🤖 **Command Help**',
            suggestion,
          ].join('\n\n')
        );
      } else {
        core.info('[Bot] No AI command detected in comment.');
      }
      return;
    }
    
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

    core.info(`[Bot] Command ${command.type.toUpperCase()} intercepted from @${payload.author}`);

    if (command.type === 'define') {
      try {
        await this.handleSpecification(payload, config);
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    } else if (command.type === 'plan') {
      const force = command.force === true;
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
    await this.postStatus(
      payload.number,
      [
        '🤖 **Specification started**',
        'I am reviewing the current feature description and splitting it into child specs that follow the repository templates.',
      ].join('\n\n')
    );
    const issueData = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: payload.number });
    
    const agent = new CodexRunner();
    const tasks = await agent.generateEpicSplit(issueData.data.title, issueData.data.body, config.model);
    if (tasks.length === 0) {
      throw new Error('Codex returned no child specifications. Aborting instead of posting an empty success message.');
    }
    
    // Create sub issues 
    const links = [];
    for (const spec of tasks) {
       const created = await this.octokit.rest.issues.create({
          ...this.ctx,
          title: spec.title,
         body: spec.specMarkdown
       });
       await this.handleWelcome(created.data.number);
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
    await this.postStatus(
      payload.number,
      [
        '🤖 **Planning started**',
        force
          ? 'I am generating a full implementation plan without asking clarifying questions first.'
          : 'I am reviewing the feature spec and deciding whether I can produce a full implementation plan or need clarification.',
      ].join('\n\n')
    );
    const issueData = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: payload.number });
    
    const agent = new CodexRunner();
    const result = await agent.generateImplementationPlan(issueData.data.title, issueData.data.body, force, config.model);

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

    await this.postStatus(
      payload.number,
      [
        '🤖 **Implementation started**',
        'I am handing the feature spec and latest implementation plan to Codex.',
        'Codex will inspect the repository directly, make the implementation locally, and I will open a PR with the result.',
      ].join('\n\n')
    );
    
    const issueData = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: payload.number });
    const plan = await this.getLatestImplementationPlan(payload.number);
    const agent = new CodexRunner();
    
    const git = new GitManager(process.env.GITHUB_TOKEN || '');
    const branchName = this.buildImplementationBranchName(payload.number, issueData.data.title || '');
    
    // Git checkouts locally
    await git.checkoutNewBranch(branchName);
    const implementationResult = await agent.implementFeature(
      issueData.data.title || '',
      issueData.data.body || '',
      plan,
      config.model
    );
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
        implementationResult.summary,
        'Go review it!',
      ].join('\n\n')
    );
    await this.replaceStateLabel(payload.number, payload.labels, 'state:in-review');
  }

  // 6. PR REVIEW REWORK
  async handleReviewRework(payload: any, config: any) {
     await this.postStatus(
       payload.number,
       [
         '🤖 **Rework started**',
         'I am handing the linked feature spec, latest implementation plan, and all open review feedback to Codex.',
         'Only unresolved review feedback will be addressed.',
       ].join('\n\n')
     );
     
     // Pull Request issues can expose the base ref
     const pr = await this.octokit.rest.pulls.get({ ...this.ctx, pull_number: payload.number });
     const headBranch = pr.data.head.ref;
     
     const git = new GitManager(process.env.GITHUB_TOKEN || '');
     await git.checkoutNewBranch(headBranch); // Checkout existing head
     const [featureContext, reviewFeedback] = await Promise.all([
       this.getPullRequestFeatureContext(payload.number),
       this.buildPullRequestReworkInstruction(payload.number),
     ]);

     const agent = new CodexRunner();
     const result = await agent.applyReviewRework(
       featureContext.title,
       featureContext.spec,
       featureContext.plan,
       reviewFeedback,
       config.model
     );
     await git.commitAndPush(`PR Rework: address review feedback`, headBranch);
     await this.postStatus(payload.number, this.buildEditSummaryComment('🛠️ **Rework applied**', result.summary, result.changedFiles));
     
     await this.postStatus(payload.number, `✅ Addressed feedback pushed to ${headBranch}.`);
  }

  async handleReviewRefinement(payload: any, refinementInstruction: string, config: any) {
     if (!refinementInstruction.trim()) {
      throw new Error('`ready for refinement` requires an instruction in the same comment. Put your refinement request after the command.');
     }

     await this.postStatus(
       payload.number,
       [
         '🤖 **Refinement started**',
         'I am handing the linked feature spec, latest implementation plan, and your refinement instruction to Codex.',
         'Codex will apply broader polish without changing unrelated behavior.',
       ].join('\n\n')
     );

     const pr = await this.octokit.rest.pulls.get({ ...this.ctx, pull_number: payload.number });
     const headBranch = pr.data.head.ref;

     const git = new GitManager(process.env.GITHUB_TOKEN || '');
     await git.checkoutNewBranch(headBranch);
     const featureContext = await this.getPullRequestFeatureContext(payload.number);
     const agent = new CodexRunner();
     const result = await agent.applyReviewRefinement(
       featureContext.title,
       featureContext.spec,
       featureContext.plan,
       refinementInstruction,
       config.model
     );
     await git.commitAndPush('PR Refinement: apply requested polish', headBranch);
     await this.postStatus(payload.number, this.buildEditSummaryComment('✨ **Refinement applied**', result.summary, result.changedFiles, refinementInstruction));
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

  private async buildPullRequestReworkInstruction(prNumber: number) {
    const openReviewThreads = await this.fetchOpenReviewThreads(prNumber);
    const reviewCommentLines = openReviewThreads.map((thread) => {
      const path = thread.path ? `file=${thread.path}` : 'file=unknown';
      const line = thread.line ? ` line=${thread.line}` : '';
      const body = typeof thread.body === 'string' ? thread.body.trim() : '';
      return `- ${path}${line}: ${body}`;
    });

    if (reviewCommentLines.length === 0) {
      throw new Error('No open PR feedback was found. Leave unresolved review feedback first, then trigger `ready for rework`.');
    }

    return reviewCommentLines.join('\n');
  }

  private buildEditSummaryComment(
    heading: string,
    summary: string,
    changedFiles: string[],
    instruction?: string
  ) {
    return [
      heading,
      instruction ? ['**Instruction:**', instruction].join('\n') : null,
      ['**Summary:**', summary].join('\n'),
      changedFiles.length
        ? ['**Updated files:**', changedFiles.map((filePath) => `- \`${filePath}\``).join('\n')].join('\n')
        : '**Updated files:**\n- Codex did not report any changed files.',
    ].filter((section): section is string => Boolean(section)).join('\n\n');
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

  private async getLatestImplementationPlan(issueNumber: number) {
    const comments = await this.octokit.rest.issues.listComments({
      ...this.ctx,
      issue_number: issueNumber,
      per_page: 100
    });

    const matchingComment = [...comments.data]
      .reverse()
      .find((comment: any) => typeof comment.body === 'string' && comment.body.startsWith('**Implementation Plan**'));

    return matchingComment?.body || '';
  }

  private buildPullRequestWelcomeMessage(issueNumber: number, author: string) {
    return [
      '👋 **AI Review Helper**',
      `This Pull Request was created for Issue #${issueNumber}.`,
      [
        '**Review flow here:**',
        '1. Leave inline review comments or submit a full review on the PR.',
        '2. Either submit a review with the exact text `ready for rework` or comment `ready for rework` on the PR when the feedback set is complete.',
        '3. I will collect the open review feedback, revisit the linked feature spec and plan, and let Codex apply only that rework.',
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

  private async getPullRequestFeatureContext(prNumber: number) {
    const pr = await this.octokit.rest.pulls.get({ ...this.ctx, pull_number: prNumber });
    const prTitle = pr.data.title || `Pull Request #${prNumber}`;
    const prBody = pr.data.body || '';
    const linkedIssueNumber = this.extractLinkedIssueNumber(prBody);

    if (!linkedIssueNumber) {
      return {
        title: prTitle,
        spec: prBody || 'No linked issue specification found.',
        plan: '',
      };
    }

    const issue = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: linkedIssueNumber });
    const plan = await this.getLatestImplementationPlan(linkedIssueNumber);

    return {
      title: issue.data.title || prTitle,
      spec: issue.data.body || 'No linked issue specification found.',
      plan,
    };
  }

  private extractLinkedIssueNumber(text: string) {
    const match = text.match(/Issue\s+#(\d+)/i);
    if (!match) {
      return null;
    }

    return Number(match[1]);
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
