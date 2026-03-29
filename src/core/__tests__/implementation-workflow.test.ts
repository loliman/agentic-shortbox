import {
  assessImplementationPublishability,
  classifyImplementationRunType,
} from '../implementation-workflow';

describe('Implementation workflow helpers', () => {
  it('classifies broad, narrow, and child run types explicitly', () => {
    expect(
      classifyImplementationRunType(
        'Parent / Spec 02: Change Requests Route',
        '# Feature',
        '# Plan'
      )
    ).toBe('child-subtask');

    expect(
      classifyImplementationRunType(
        'Main Feature',
        ['## Affected Areas', '- API', '- Controller'].join('\n'),
        '# Plan'
      )
    ).toBe('broad-feature');

    expect(classifyImplementationRunType('Single Route Fix', '# Feature', '# Plan')).toBe('narrow-feature');
  });

  it('rejects governance-only diffs', () => {
    const result = assessImplementationPublishability({
      title: 'Main Feature',
      runType: 'narrow-feature',
      actualChangedFiles: ['specs/07-test.md', 'plans/07-test-plan.md'],
      reportedChangedFiles: ['specs/07-test.md'],
      verification: [{ command: 'npm test', status: 'passed', details: 'ok' }],
      featureSpec: '# Feature: Test',
      implementationPlan: '# Plan',
    });

    expect(result.publishable).toBe(false);
    expect(result.reason).toContain('only governance artifacts');
  });

  it('rejects completed runs when verification did not pass', () => {
    const result = assessImplementationPublishability({
      title: 'Main Feature',
      runType: 'narrow-feature',
      actualChangedFiles: ['src/foo.ts'],
      reportedChangedFiles: ['src/foo.ts'],
      verification: [{ command: 'npm test', status: 'failed', details: '1 failed' }],
      featureSpec: '# Feature: Test',
      implementationPlan: '# Plan',
    });

    expect(result.publishable).toBe(false);
    expect(result.reason).toContain('verification did not fully pass');
  });

  it('rejects non-production diffs when the scope implies production changes', () => {
    const result = assessImplementationPublishability({
      title: 'Parent / Spec 02: Route Flow',
      runType: 'child-subtask',
      actualChangedFiles: ['src/foo.test.ts'],
      reportedChangedFiles: ['src/foo.test.ts'],
      verification: [{ command: 'npm test', status: 'passed', details: 'ok' }],
      featureSpec: 'Implement the API route and controller flow.',
      implementationPlan: '# Plan',
    });

    expect(result.publishable).toBe(false);
    expect(result.reason).toContain('imply production code changes');
  });

  it('rejects broad feature runs with insufficient breadth', () => {
    const result = assessImplementationPublishability({
      title: 'Main Feature',
      runType: 'broad-feature',
      actualChangedFiles: ['src/foo.ts'],
      reportedChangedFiles: ['src/foo.ts'],
      verification: [{ command: 'npm test', status: 'passed', details: 'ok' }],
      featureSpec: ['## Affected Areas', '- API', '- Controller'].join('\n'),
      implementationPlan: ['## Affected Files', '- src/foo.ts', '- src/bar.ts', '- src/baz.ts'].join('\n'),
    });

    expect(result.publishable).toBe(false);
    expect(result.reason).toContain('appears broad');
  });

  it('rejects narrow feature runs that miss the expected ownership area', () => {
    const result = assessImplementationPublishability({
      title: 'Change Requests Route',
      runType: 'narrow-feature',
      actualChangedFiles: ['src/lib/env.ts'],
      reportedChangedFiles: ['src/lib/env.ts'],
      verification: [{ command: 'npm test', status: 'passed', details: 'ok' }],
      featureSpec: ['## Affected Areas', '- change requests route'].join('\n'),
      implementationPlan: ['## Affected Files', '- app/api/change-requests/route.ts'].join('\n'),
    });

    expect(result.publishable).toBe(false);
    expect(result.reason).toContain('does not align with the expected primary feature area');
  });

  it('rejects child subtasks that do not touch their ownership area', () => {
    const result = assessImplementationPublishability({
      title: 'Parent / Spec 02: Change Requests Route',
      runType: 'child-subtask',
      actualChangedFiles: ['src/lib/env.ts'],
      reportedChangedFiles: ['src/lib/env.ts'],
      verification: [{ command: 'npm test', status: 'passed', details: 'ok' }],
      featureSpec: ['## Affected Areas', '- change requests route'].join('\n'),
      implementationPlan: ['## Affected Files', '- app/api/change-requests/route.ts'].join('\n'),
    });

    expect(result.publishable).toBe(false);
    expect(result.reason).toContain('did not touch its expected ownership area');
  });

  it('accepts a credible narrow feature diff and returns publication evidence', () => {
    const result = assessImplementationPublishability({
      title: 'Change Requests Route',
      runType: 'narrow-feature',
      actualChangedFiles: ['app/api/change-requests/route.ts', 'app/api/change-requests/route.test.ts'],
      reportedChangedFiles: ['app/api/change-requests/route.ts', 'src/bar.ts'],
      verification: [{ command: 'npm test', status: 'passed', details: 'ok' }],
      featureSpec: ['## Affected Areas', '- change requests route'].join('\n'),
      implementationPlan: ['## Affected Files', '- app/api/change-requests/route.ts'].join('\n'),
    });

    expect(result.publishable).toBe(true);
    expect(result.normalizedChangedFiles).toEqual([
      'app/api/change-requests/route.ts',
      'app/api/change-requests/route.test.ts',
    ]);
    expect(result.missingReportedFiles).toEqual(['src/bar.ts']);
    expect(result.publicationEvidence).toContain('Run type: narrow-feature');
    expect(result.publicationEvidence.some((entry) => entry.includes('Ownership-aligned files: 1/1'))).toBe(true);
  });
});
