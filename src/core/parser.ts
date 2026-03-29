export interface ParsedCommand {
  type: 'define' | 'plan' | 'implement' | 'rework' | 'refinement';
  additionalText?: string;
  force?: boolean;
}

export interface AgentConfiguration {
  agent: string;
  model: string;
}

/**
 * Extracts explicit AI commands from the text.
 * Only exact/trimmed matches or explicit prefixes are allowed to avoid NLP complexity.
 */
export function parseCommand(text: string): ParsedCommand | null {
  const normalized = text.trim().toLowerCase();

  if (normalized === 'ready for specification' || normalized === 'ready for breakdown') {
    return { type: 'define' };
  }

  if (normalized === 'ready for planning') {
    return { type: 'plan', force: true };
  }

  if (normalized === 'ready for planning without questions') {
    return { type: 'plan', force: true };
  }

  if (normalized === 'ready for implementation') {
    return { type: 'implement' };
  }

  if (normalized === 'ready for rework') {
    return { type: 'rework' };
  }

  if (normalized.startsWith('ready for refinement')) {
    const additionalText = text.slice(text.toLowerCase().indexOf('ready for refinement') + 'ready for refinement'.length).trim();
    return { type: 'refinement', additionalText };
  }

  return null; // Ignore completely if no command is detected
}

export function suggestCommand(text: string): string | null {
  const normalized = text.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === 'ready for planning!') {
    return 'Use `ready for planning`.';
  }

  if (normalized.includes('ready to plan') || normalized.includes('ready to planning')) {
    return 'Did you mean `ready for planning`?';
  }

  if (normalized.includes('ready to implement') || normalized.includes('ready for implement')) {
    return 'Did you mean `ready for implementation`?';
  }

  if (
    normalized.includes('ready to define') ||
    normalized.includes('ready for define') ||
    normalized.includes('ready for specification') ||
    normalized.includes('ready to breakdown')
  ) {
    return 'Did you mean `ready for breakdown`? You can still use `ready for specification` as a supported alias.';
  }

  if (normalized.startsWith('ready for refinement') && normalized === 'ready for refinement') {
    return 'Add the instruction in the same comment, for example `ready for refinement make the bot tone warmer`.';
  }

  if (normalized.startsWith('ready')) {
    return 'Unknown command. Supported commands are `ready for breakdown` (alias: `ready for specification`), `ready for planning`, `ready for implementation`, `ready for rework`, and `ready for refinement <instruction>`.';
  }

  return null;
}

/**
 * Extracts configuration state from GitHub labels arrays.
 * Format is `agent:name` and `model:tier`. Returns defaults if none defined.
 * Throws strict errors on multiple conflicting labels in the same category.
 */
export function parseConfiguration(labels: string[]): AgentConfiguration {
  let agentMatch: string | null = null;
  let modelMatch: string | null = null;

  for (const label of labels) {
    if (label.startsWith('agent:')) {
      if (agentMatch !== null) {
        throw new Error('Conflicting agent labels found. Only one agent label is allowed.');
      }
      agentMatch = label.split(':')[1];
      if (agentMatch !== 'codex') {
        throw new Error('Only `agent:codex` is supported in this repository.');
      }
    }

    if (label.startsWith('model:')) {
      if (modelMatch !== null) {
        throw new Error('Conflicting model labels found. Only one model label is allowed.');
      }
      modelMatch = label.split(':')[1];
    }
  }

  return {
    agent: agentMatch || 'codex',
    model: modelMatch || 'strong',
  };
}
