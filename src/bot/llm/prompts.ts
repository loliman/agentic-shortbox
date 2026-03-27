export interface DefineResult {
  title: string;
  specMarkdown: string;
}

export interface ImplementResult {
  path: string;
  content: string;
}

export function generatePlanPrompt(issueText: string): string {
  return `You are a Senior Technical Architect analyzing an Epic or Feature Specification.
Your job is to read the following specification and output a detailed markdown Implementation Plan.
DO NOT write code implementations directly. Focus on:
1. Identifying affected architectural layers (routing, UI, db, services).
2. Breaking down the work into step-by-step files to be created/modified.
3. Defining constraints or assumptions.

Target Specification:
"""
${issueText}
"""

Return your response entirely as pure Markdown.`;
}

export function generateDefinePrompt(parentIssueText: string, templateContext: string): string {
  return `You are an Agile Product Owner. You must break down a large Epic feature into several small, manageable development tasks.
Read the following Epic description and generate 3 to 5 distinct Child Issues.
Each child issue MUST have a title and a detailed markdown body that rigorously follows the provided Specification Template.

Epic Description:
"""
${parentIssueText}
"""

Required Specification Template:
"""
${templateContext}
"""

MANDATORY INSTRUCTION: You MUST return precisely a JSON string (with no markdown wrapping, no \`\`\`json) representing an array of objects.
Format:
[
  { "title": "Spec 01: Database Models", "specMarkdown": "# Feature: Database Models\\n\\n## Goal..." },
  { "title": "...", "specMarkdown": "..." }
]`;
}

export function generateCodePrompt(taskTitle: string, taskInstructions: string, currentCodeContext?: string): string {
  return `You are an AI software engineering agent working inside an already checked out repository.
Your job is to inspect the provided repository context, understand the existing code, and return the exact file contents needed for the requested implementation.

Primary Task:
"""
${taskTitle}
"""

Execution Instructions:
"""
${taskInstructions}
"""

Repository Working Context:
"""
${currentCodeContext || 'No repository context provided.'}
"""

Agent Rules:
1. Prefer updating existing files over creating new ones.
2. Only create new files when the repository context makes that necessary.
3. Reuse the naming, structure, and conventions already present in the repository.
4. Keep unrelated code unchanged.
5. Treat the repository context as the source of truth over generic assumptions.

MANDATORY INSTRUCTION: You MUST return precisely a JSON string (with no markdown wrapping, no \`\`\`json) representing an array of files to write or overwrite.
Ensure paths are relative to the repository root (for example "src/lib/myFile.ts").
Format:
[
  { "path": "src/api/routes.ts", "content": "import { Router } from 'express';\\n..." },
  { "path": "...", "content": "..." }
]`;
}
