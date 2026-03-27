export interface ParsedCommand {
  type: 'define' | 'plan' | 'implement' | 'rework';
  additionalText?: string;
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

  if (normalized === 'ready for specification') {
    return { type: 'define' };
  }

  if (normalized.startsWith('ready for planning')) {
    return { type: 'plan' };
  }

  if (normalized === 'ready for implementation') {
    return { type: 'implement' };
  }

  if (normalized === 'ready for rework') {
    return { type: 'rework' };
  }

  return null; // Ignore completely if no command is detected
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
    }

    if (label.startsWith('model:')) {
      if (modelMatch !== null) {
        throw new Error('Conflicting model labels found. Only one model label is allowed.');
      }
      modelMatch = label.split(':')[1];
    }
  }

  return {
    agent: agentMatch || 'default-agent',
    model: modelMatch || 'default-model',
  };
}
