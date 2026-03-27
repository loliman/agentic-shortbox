import * as core from '@actions/core';
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
       message = `👋 **Hello! I am your AI Developer Bot.**
       
⚠️ **I am currently offline.** No API secrets (\`OPENAI_API_KEY\` or \`GEMINI_API_KEY\`) were found in this repository.
Please configure the secrets in your GitHub Settings so I can assist you with your issues!`;
    } else {
       message = `👋 **Hello! I am your AI Developer Bot.**
    
I have detected the following LLM configurations are available for this repository:
${availableModels.join('\n')}

**How to use me:**
1. Apply the configuration labels you want to this issue (e.g., \`agent:codex\` and \`model:fast\`).
2. Type \`ready for planning\` in a comment, and I will draft a technical plan based on your issue description.
3. Type \`ready for implementation\` to let me write the code and spawn a Pull Request!
4. Type \`ready for specification\` to let me split this Epic into sub-issues.

I strictly follow your repository's \`AGENTS.md\` and \`docs/\` when responding!`;
    }

    await this.octokit.rest.issues.createComment({
      ...this.ctx,
      issue_number: issueNumber,
      body: message
    });
  }

  // 2. COMMAND PARSER & GATEWAY
  async handleCommand(payload: { number: number; author: string; body: string; labels: string[], isPR: boolean }) {
    if (payload.isPR && payload.body.trim().startsWith('ai: fix')) {
      try {
        return await this.handleReviewFix(payload);
      } catch(e: any) {
        await this.postStatus(payload.number, this.formatSystemError(e));
        throw e;
      }
    }
    
    // Parse generic action commands
    const command = parseCommand(payload.body);
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

    await this.postStatus(payload.number, `✅ Epic split completed! Here are your generated child tasks:\n\n${links.map(l => `- [ ] ${l}`).join('\n')}`);
  }

  // 4. PLANNING
  async handlePlanning(payload: any, config: any, force: boolean) {
    await this.postStatus(payload.number, "Drafting the implementation plan...");
    const issueData = await this.octokit.rest.issues.get({ ...this.ctx, issue_number: payload.number });
    
    const agent = new LLMClient();
    const result = await agent.generateImplementationPlan(issueData.data.title, issueData.data.body, force);

    if (result.action === 'question') {
      await this.postStatus(payload.number, `**Clarification Needed**\n\n${result.content}`);
      await this.replaceStateLabel(payload.number, payload.labels, 'state:clarification_needed');
    } else {
      await this.postStatus(payload.number, `**Implementation Plan**\n\n${result.content}`);
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
      body: `This Pull Request implements auto-generated code for Issue #${payload.number}.\n\nReviewer: @${payload.author}\n\nProvide feedback by commenting \`ai: fix [instruction]\` on this PR.`,
      head: branchName,
      base: 'main'
    });

    await this.postStatus(pr.data.number, this.buildPullRequestWelcomeMessage(payload.number, payload.author));
    await this.postStatus(payload.number, `✅ Code generated and pushed to PR #${pr.data.number}!\nGo review it!`);
    await this.replaceStateLabel(payload.number, payload.labels, 'state:in-review');
  }

  // 6. PR REVIEW FIX
  async handleReviewFix(payload: any) {
     const fixInstruction = payload.body.replace('ai: fix', '').trim();
     await this.postStatus(payload.number, "Addressing your PR review feedback...");
     
     // Pull Request issues can expose the base ref
     const pr = await this.octokit.rest.pulls.get({ ...this.ctx, pull_number: payload.number });
     const headBranch = pr.data.head.ref;
     
     const agent = new LLMClient();
     // We should send the PR diff, but for simplicity we send the fix instruction
     const codeOps = await agent.generateCode('PR Fix', fixInstruction);
     
     const git = new GitManager(process.env.GITHUB_TOKEN || '');
     await git.checkoutNewBranch(headBranch); // Checkout existing head
     await git.applyFileSystemChanges(codeOps);
     await git.commitAndPush(`PR Feedback Fix: ${fixInstruction}`, headBranch);
     
     await this.postStatus(payload.number, `✅ Addressed feedback pushed to ${headBranch}.`);
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

  private buildPullRequestWelcomeMessage(issueNumber: number, author: string) {
    return `👋 **AI Review Helper**

This Pull Request was created for Issue #${issueNumber}.

**Available action here:**
- Comment \`ai: fix <instruction>\` to ask me for a targeted follow-up change on this PR.

**Example:**
\`ai: fix make the bot messages more consistent and shorten the error text\`

Reviewer: @${author}`;
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
