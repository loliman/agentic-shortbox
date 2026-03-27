import { evaluateTransition, extractCurrentState, IllegalTransitionError, WorkflowState } from '../state-machine';

describe('State Machine Parsing', () => {
  it('extracts state correctly from labels', () => {
    expect(extractCurrentState(['bug', 'state:planned'])).toBe('planned');
    expect(extractCurrentState(['state:idle'])).toBe('idle');
  });

  it('defaults to idle if no state label exists', () => {
    expect(extractCurrentState(['bug', 'enhancement'])).toBe('idle');
    expect(extractCurrentState([])).toBe('idle');
  });

  it('defaults to idle if multiple conflicting state labels exist', () => {
    expect(extractCurrentState(['state:idle', 'state:planning'])).toBe('idle');
  });
});

describe('State Machine Matrix Transitions', () => {
  it('allows idle -> planning', () => {
    expect(evaluateTransition('idle', 'plan')).toBe('planning');
  });

  it('allows idle -> defining', () => {
    expect(evaluateTransition('idle', 'define')).toBe('defining');
  });

  it('allows planned -> implementing', () => {
    expect(evaluateTransition('planned', 'implement')).toBe('implementing');
  });

  it('blocks idle -> implementing', () => {
    expect(() => evaluateTransition('idle', 'implement')).toThrow(IllegalTransitionError);
    expect(() => evaluateTransition('idle', 'implement')).toThrow("Cannot transition from state 'idle' using command 'implement'.");
  });

  it('allows PR evaluation flows (implementing -> in-review -> reworking -> etc)', () => {
    expect(evaluateTransition('implementing', 'review')).toBe('in-review');
    expect(evaluateTransition('in-review', 'rework')).toBe('reworking');
    expect(evaluateTransition('reworking', 'review')).toBe('in-review');
    expect(evaluateTransition('in-review', 'done')).toBe('done');
  });

  it('blocks completed states from accepting new mutations directly', () => {
    expect(() => evaluateTransition('done', 'plan')).toThrow(IllegalTransitionError);
    expect(() => evaluateTransition('done', 'implement')).toThrow(IllegalTransitionError);
  });

  it('allows recovering from failed states', () => {
    expect(evaluateTransition('failed', 'plan')).toBe('planning');
    expect(evaluateTransition('failed', 'implement')).toBe('implementing');
  });
});
