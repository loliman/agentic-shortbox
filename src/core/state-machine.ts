export type WorkflowState = 'idle' | 'defining' | 'planning' | 'planned' | 'clarification_needed' | 'implementing' | 'failed' | 'in-review' | 'reworking' | 'done';

export class IllegalTransitionError extends Error {
  constructor(public currentState: WorkflowState, public commandType: string) {
    super(`Cannot transition from state '${currentState}' using command '${commandType}'.`);
    this.name = 'IllegalTransitionError';
  }
}

/**
 * Extracts the current workflow state from GitHub labels (e.g. 'state:idle').
 * If no state label exists or multiple exist, defaults to 'idle'.
 */
export function extractCurrentState(labels: string[]): WorkflowState {
  const stateLabels = labels.filter((l) => l.startsWith('state:'));
  if (stateLabels.length !== 1) {
    return 'idle'; // Default fallback if missing or messy
  }
  const stateVal = stateLabels[0].split(':')[1] as WorkflowState;
  
  const validStates: WorkflowState[] = ['idle', 'defining', 'planning', 'planned', 'clarification_needed', 'implementing', 'failed', 'in-review', 'reworking', 'done'];
  if (validStates.includes(stateVal)) {
    return stateVal;
  }
  
  return 'idle';
}

/**
 * Validates whether the given command is permitted given the current state.
 * Returns the new target state if valid, otherwise throws IllegalTransitionError.
 */
export function evaluateTransition(
  currentState: WorkflowState,
  commandType: 'define' | 'plan' | 'implement' | 'rework' | 'review' | 'done'
): WorkflowState {
  if (currentState === 'idle') {
    if (commandType === 'define') return 'defining';
    if (commandType === 'plan') return 'planning';
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'defining') {
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'planning') {
    if (commandType === 'plan') return 'planning'; // Idempotent restart
    throw new IllegalTransitionError(currentState, commandType);
  }
  
  if (currentState === 'clarification_needed') {
    if (commandType === 'plan') return 'planning'; // User replied with details
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'planned') {
    if (commandType === 'implement') return 'implementing';
    if (commandType === 'plan') return 'planning'; // Re-planning
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'implementing') {
    if (commandType === 'review') return 'in-review';
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'in-review') {
    if (commandType === 'rework') return 'reworking';
    if (commandType === 'done') return 'done';
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'reworking') {
    if (commandType === 'review') return 'in-review';
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'failed') {
    if (commandType === 'plan') return 'planning';
    if (commandType === 'implement') return 'implementing';
    throw new IllegalTransitionError(currentState, commandType);
  }

  if (currentState === 'done') {
    throw new IllegalTransitionError(currentState, commandType);
  }

  throw new IllegalTransitionError(currentState, commandType);
}
