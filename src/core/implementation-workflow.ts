export type ImplementationRunType = 'broad-feature' | 'narrow-feature' | 'child-subtask';

type VerificationEntry = {
  command: string;
  status: 'passed' | 'failed' | 'blocked' | 'not_run';
  details: string;
};

export interface ImplementationPublishabilityAssessment {
  publishable: boolean;
  runType: ImplementationRunType;
  normalizedChangedFiles: string[];
  missingReportedFiles: string[];
  reason?: string;
  publicationEvidence: string[];
}

interface ExpectedSurface {
  ownershipHints: string[];
  affectedAreas: string[];
  affectedFiles: string[];
}

export function classifyImplementationRunType(
  title: string,
  featureSpec: string,
  implementationPlan: string
): ImplementationRunType {
  if (isChildSpecificationTitle(title)) {
    return 'child-subtask';
  }

  return isBroadScope(featureSpec, implementationPlan) ? 'broad-feature' : 'narrow-feature';
}

export function assessImplementationPublishability(input: {
  title: string;
  runType: ImplementationRunType;
  actualChangedFiles: string[];
  reportedChangedFiles: string[];
  verification: VerificationEntry[];
  featureSpec: string;
  implementationPlan: string;
}): ImplementationPublishabilityAssessment {
  const normalizedChangedFiles = normalizeChangedFiles(input.actualChangedFiles);
  const missingReportedFiles = normalizeChangedFiles(input.reportedChangedFiles).filter(
    (filePath) => !normalizedChangedFiles.includes(filePath)
  );
  const expectedSurface = buildExpectedSurface(input.title, input.featureSpec, input.implementationPlan);

  if (normalizedChangedFiles.length === 0) {
    return reject(
      input.runType,
      normalizedChangedFiles,
      missingReportedFiles,
      'Codex reported a completed implementation, but no changed files were detected in the working tree.'
    );
  }

  const meaningfulFiles = normalizedChangedFiles.filter((filePath) => !isGovernanceArtifactPath(filePath));
  if (meaningfulFiles.length === 0) {
    return reject(
      input.runType,
      normalizedChangedFiles,
      missingReportedFiles,
      `Codex changed only governance artifacts (${normalizedChangedFiles.join(', ')}). Aborting instead of opening a code PR with no implementation diff.`
    );
  }

  const failedVerification = input.verification.filter((entry) => entry.status !== 'passed');
  if (failedVerification.length > 0) {
    return reject(
      input.runType,
      normalizedChangedFiles,
      missingReportedFiles,
      `Codex marked the implementation as completed even though verification did not fully pass (${failedVerification
        .map((entry) => `${entry.command}: ${entry.status}`)
        .join('; ')}).`
    );
  }

  const productionFiles = meaningfulFiles.filter((filePath) => isProductionLikePath(filePath));
  const productionExpected = expectsProductionChanges(input.featureSpec, input.implementationPlan);
  if (productionExpected && productionFiles.length === 0) {
    return reject(
      input.runType,
      normalizedChangedFiles,
      missingReportedFiles,
      `The spec and plan imply production code changes, but the observed diff only touched non-production files (${meaningfulFiles.join(', ')}).`
    );
  }

  const ownershipCoverage = countOwnershipMatches(productionFiles, expectedSurface.ownershipHints);
  if (input.runType === 'child-subtask' && expectedSurface.ownershipHints.length > 0 && ownershipCoverage === 0) {
    return reject(
      input.runType,
      normalizedChangedFiles,
      missingReportedFiles,
      `The child subtask did not touch its expected ownership area. Expected one of [${expectedSurface.ownershipHints.join(', ')}], observed production files: ${productionFiles.join(', ')}.`
    );
  }

  if (input.runType === 'narrow-feature' && expectedSurface.ownershipHints.length > 0 && ownershipCoverage === 0) {
    return reject(
      input.runType,
      normalizedChangedFiles,
      missingReportedFiles,
      `The implementation diff does not align with the expected primary feature area [${expectedSurface.ownershipHints.join(', ')}]. Observed production files: ${productionFiles.join(', ')}.`
    );
  }

  if (input.runType === 'broad-feature') {
    if (productionFiles.length < 2) {
      return reject(
        input.runType,
        normalizedChangedFiles,
        missingReportedFiles,
        `The issue appears broad, but the observed implementation diff is too small to publish confidently (${productionFiles.join(', ') || meaningfulFiles.join(', ')}).`
      );
    }

    const coveredFamilies = countDistinctFileFamilies(productionFiles);
    if (coveredFamilies < 2) {
      return reject(
        input.runType,
        normalizedChangedFiles,
        missingReportedFiles,
        `The issue appears broad, but the observed production changes are concentrated in only one file family (${productionFiles.join(', ')}).`
      );
    }
  }

  return {
    publishable: true,
    runType: input.runType,
    normalizedChangedFiles,
    missingReportedFiles,
    publicationEvidence: buildPublicationEvidence(
      input.runType,
      productionFiles,
      expectedSurface,
      input.verification,
      ownershipCoverage
    ),
  };
}

function reject(
  runType: ImplementationRunType,
  normalizedChangedFiles: string[],
  missingReportedFiles: string[],
  reason: string
): ImplementationPublishabilityAssessment {
  return {
    publishable: false,
    runType,
    normalizedChangedFiles,
    missingReportedFiles,
    reason,
    publicationEvidence: [],
  };
}

function buildPublicationEvidence(
  runType: ImplementationRunType,
  productionFiles: string[],
  expectedSurface: ExpectedSurface,
  verification: VerificationEntry[],
  ownershipCoverage: number
) {
  const evidence = [
    `Run type: ${runType}`,
    `Production files changed: ${productionFiles.length}`,
    `Verification passed: ${verification.map((entry) => entry.command).join(', ') || 'none recorded'}`,
  ];

  if (expectedSurface.affectedAreas.length > 0) {
    evidence.push(`Affected areas referenced: ${expectedSurface.affectedAreas.join(', ')}`);
  }

  if (expectedSurface.ownershipHints.length > 0) {
    evidence.push(`Ownership-aligned files: ${ownershipCoverage}/${productionFiles.length}`);
  }

  return evidence;
}

function buildExpectedSurface(title: string, featureSpec: string, implementationPlan: string): ExpectedSurface {
  const affectedAreas = extractListItems(extractSection(featureSpec, 'Affected Areas'));
  const affectedFiles = extractListItems(extractSection(implementationPlan, 'Affected Files')).map(stripMarkdownCodeFence);
  const ownershipHints = normalizeOwnershipHints([
    ...extractTitleOwnershipHints(title),
    ...affectedAreas,
    ...affectedFiles,
  ]);

  return { ownershipHints, affectedAreas, affectedFiles };
}

function extractTitleOwnershipHints(title: string) {
  const childTitleMatch = title.match(/\/\s*Spec\s+\d{2}\s*:\s*(.+)$/i);
  const source = childTitleMatch?.[1] || title;
  return source
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 4);
}

function normalizeOwnershipHints(values: string[]) {
  const expanded = values.flatMap((value) => value.split(/[^a-z0-9/._-]+/i));
  return [...new Set(expanded.map((value) => value.trim().toLowerCase()).filter((value) => value.length >= 4))];
}

function countOwnershipMatches(files: string[], ownershipHints: string[]) {
  if (ownershipHints.length === 0) {
    return 0;
  }

  return files.filter((filePath) => ownershipHints.some((hint) => filePath.toLowerCase().includes(hint))).length;
}

function normalizeChangedFiles(changedFiles: string[]) {
  return [...new Set(changedFiles.map((filePath) => filePath.trim()).filter(Boolean))];
}

function isChildSpecificationTitle(title: string) {
  return /\/\s*Spec\s+\d{2}\s*:/i.test(title);
}

function isGovernanceArtifactPath(filePath: string) {
  return filePath.startsWith('specs/') || filePath.startsWith('plans/');
}

function isProductionLikePath(filePath: string) {
  if (isGovernanceArtifactPath(filePath)) {
    return false;
  }

  if (filePath.startsWith('docs/') || filePath === 'README.md' || filePath === 'AGENTS.md') {
    return false;
  }

  if (filePath.includes('__tests__/') || filePath.includes('/tests/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(filePath)) {
    return false;
  }

  return true;
}

function expectsProductionChanges(featureSpec: string, implementationPlan: string) {
  const context = `${featureSpec}\n${implementationPlan}`.toLowerCase();
  if (!context.trim()) {
    return true;
  }

  if (/\bdocumentation-only\b|\bdocs only\b|\breadme only\b/.test(context)) {
    return false;
  }

  return /\b(route|api|controller|service|component|module|workflow|state machine|parser|implementation|code|bot|git|src\/|app\/)\b/.test(
    context
  );
}

function isBroadScope(featureSpec: string, implementationPlan: string) {
  return (
    countListItems(extractSection(featureSpec, 'Affected Areas')) >= 2 ||
    countListItems(extractSection(implementationPlan, 'Affected Files')) >= 3
  );
}

function countDistinctFileFamilies(filePaths: string[]) {
  const families = filePaths.map((filePath) => {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
  });

  return new Set(families).size;
}

function extractSection(markdown: string, heading: string) {
  const pattern = new RegExp(`##\\s+${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
  const match = markdown.match(pattern);
  return match?.[1] || '';
}

function countListItems(section: string) {
  return extractListItems(section).length;
}

function extractListItems(section: string) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim());
}

function stripMarkdownCodeFence(value: string) {
  return value.replace(/`/g, '').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
