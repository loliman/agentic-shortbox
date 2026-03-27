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

export function generateCodePrompt(planText: string, instructions: string, currentCodeContext?: string): string {
  return `You are an AI Software Engineer implementing a feature based on a strict Implementation Plan.
You MUST write the executable code files to manifest the plan.

Implementation Plan:
"""
${planText}
"""

Task Additions/Fixes (if any):
"""
${instructions}
"""

Existing Code Context:
"""
${currentCodeContext || 'No existing context provided.'}
"""

MANDATORY INSTRUCTION: You MUST return precisely a JSON string (with no markdown wrapping, no \`\`\`json) representing an array of files to write/overwrite.
Ensure paths are relative to the root of the repository (e.g. "src/lib/myFile.ts").
Format:
[
  { "path": "src/api/routes.ts", "content": "import { Router } from 'express';\\n..." },
  { "path": "...", "content": "..." }
]`;
}
