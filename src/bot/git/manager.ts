import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import * as core from '@actions/core';

const execAsync = util.promisify(exec);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export class GitManager {
  private workspace: string;
  private token: string;

  constructor(token: string) {
    this.workspace = process.cwd(); // GitHub Actions checks out code natively here
    this.token = token;
  }

  async applyFileSystemChanges(operations: { path: string, content: string }[]): Promise<void> {
    core.info(`[GitManager] Applying ${operations.length} file system changes...`);
    for (const op of operations) {
       const fullPath = path.resolve(this.workspace, op.path);
       // Ensure directory exists
       fs.mkdirSync(path.dirname(fullPath), { recursive: true });
       fs.writeFileSync(fullPath, op.content, 'utf8');
       core.info(`[GitManager] Wrote changes to: ${op.path}`);
    }
  }

  async checkoutNewBranch(branchName: string): Promise<void> {
    core.info(`[GitManager] Checking out branch: ${branchName} in ${this.workspace}`);
    
    // We are inside github actions. Configure git natively
    await execAsync(`git config user.name "AI Bot Orchestrator"`, { cwd: this.workspace });
    await execAsync(`git config user.email "bot@github.actions"`, { cwd: this.workspace });
    await execAsync(`git fetch origin ${branchName}`, { cwd: this.workspace }).catch(() => undefined);

    const remoteBranchExists = await execAsync(`git ls-remote --heads origin ${branchName}`, { cwd: this.workspace });
    if (remoteBranchExists.stdout.trim()) {
      await execAsync(`git checkout -B ${branchName} origin/${branchName}`, { cwd: this.workspace });
      return;
    }

    // Ensure we are working on a fresh branch based off existing checkout
    try {
      await execAsync(`git checkout -b ${branchName}`, { cwd: this.workspace });
    } catch (e: any) {
      // If branch exists (e.g., ai: fix PR loop), switch to it
      if (e.message?.includes('already exists')) {
        await execAsync(`git checkout ${branchName}`, { cwd: this.workspace });
      } else {
        throw e;
      }
    }
  }

  async commitAndPush(message: string, branchName: string): Promise<boolean> {
    core.info(`[GitManager] Committing changes...`);
    await execAsync(`git add .`, { cwd: this.workspace });
    
    try {
       await execAsync(`git commit -m ${shellQuote(message)}`, { cwd: this.workspace });
       
       core.info(`[GitManager] Pushing to origin ${branchName}...`);
       // The native checkout action sets up auth for push natively:
       await execAsync(`git push -u origin HEAD:${branchName}`, { cwd: this.workspace });
       return true;
    } catch (err: any) {
       if (err.stdout && err.stdout.includes('nothing to commit')) {
          core.info('[GitManager] Nothing to commit. Skipping push.');
          return false;
       } else if (err.message && err.message.includes('nothing to commit')) {
          core.info('[GitManager] Nothing to commit. Skipping push.');
          return false;
       } else {
          throw err;
       }
    }
  }
}
