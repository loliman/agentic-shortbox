import { parseCommand, parseConfiguration, suggestCommand } from '../parser';

describe('Command Parser', () => {
  it('parses "ready for planning" strictly', () => {
    expect(parseCommand('ready for planning')).toEqual({ type: 'plan', force: false });
    expect(parseCommand('ready for planning without questions')).toEqual({ type: 'plan', force: true });
    expect(parseCommand('   READY FOR PLANNING!  ')).toBeNull();
  });

  it('parses "ready for implementation"', () => {
    expect(parseCommand('ready for implementation')).toEqual({ type: 'implement' });
  });

  it('parses "ready for specification"', () => {
    expect(parseCommand('ready for specification')).toEqual({ type: 'define' });
  });

  it('parses "ready for rework"', () => {
    expect(parseCommand('ready for rework')).toEqual({ type: 'rework' });
    expect(parseCommand('  READY FOR REWORK  ')).toEqual({ type: 'rework' });
  });

  it('parses "ready for refinement" and captures trailing instructions', () => {
    expect(parseCommand('ready for refinement')).toEqual({ type: 'refinement', additionalText: '' });
    expect(parseCommand('ready for refinement please make the tone friendlier')).toEqual({
      type: 'refinement',
      additionalText: 'please make the tone friendlier',
    });
  });

  it('ignores conversational text', () => {
    expect(parseCommand('Hey guys, I think we are ready to plan this soon')).toBeNull();
    expect(parseCommand('This is a normal comment.')).toBeNull();
  });

  it('suggests better command syntax for common near misses', () => {
    expect(suggestCommand('ready for planning!')).toContain('ready for planning without questions');
    expect(suggestCommand('ready to plan')).toContain('ready for planning');
    expect(suggestCommand('ready for refinement')).toContain('Add the instruction');
    expect(suggestCommand('ready for banana')).toContain('Unknown command');
  });
});

describe('Configuration Parser', () => {
  it('extracts agent and model labels correctly', () => {
    const labels = ['bug', 'agent:codex', 'priority:high', 'model:fast'];
    expect(parseConfiguration(labels)).toEqual({
      agent: 'codex',
      model: 'fast',
    });
  });

  it('returns explicit defaults if no config labels are present', () => {
    const labels = ['enhancement'];
    expect(parseConfiguration(labels)).toEqual({
      agent: 'codex',
      model: 'strong',
    });
  });

  it('throws an error if conflicting agent labels exist', () => {
    const labels = ['agent:codex', 'agent:gpt4'];
    expect(() => parseConfiguration(labels)).toThrow('Conflicting agent labels found. Only one agent label is allowed.');
  });

  it('throws an error if conflicting model labels exist', () => {
    const labels = ['agent:codex', 'model:fast', 'model:slow'];
    expect(() => parseConfiguration(labels)).toThrow('Conflicting model labels found. Only one model label is allowed.');
  });

  it('throws an error for unsupported agent providers', () => {
    const labels = ['agent:gemini'];
    expect(() => parseConfiguration(labels)).toThrow('Only `agent:codex` is supported in this repository.');
  });
});
