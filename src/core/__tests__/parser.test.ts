import { parseCommand, parseConfiguration } from '../parser';

describe('Command Parser', () => {
  it('parses "ready for planning" strictly', () => {
    expect(parseCommand('ready for planning')).toEqual({ type: 'plan' });
    expect(parseCommand('   READY FOR PLANNING!  ')).toEqual({ type: 'plan' });
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

  it('ignores conversational text', () => {
    expect(parseCommand('Hey guys, I think we are ready to plan this soon')).toBeNull();
    expect(parseCommand('This is a normal comment.')).toBeNull();
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
      agent: 'default-agent',
      model: 'default-model',
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
});
