#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const workflowPath = path.join(repoRoot, '.github/workflows/agentic-bot.yml');
const readmePath = path.join(repoRoot, 'README.md');

function run(command) {
  execSync(command, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function bumpVersion(currentVersion, releaseType) {
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported version format: ${currentVersion}`);
  }

  const [, majorRaw, minorRaw, patchRaw] = match;
  let major = Number(majorRaw);
  let minor = Number(minorRaw);
  let patch = Number(patchRaw);

  if (releaseType === 'patch') {
    patch += 1;
  } else if (releaseType === 'minor') {
    minor += 1;
    patch = 0;
  } else if (releaseType === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else {
    throw new Error(`Unsupported release type: ${releaseType}`);
  }

  return `${major}.${minor}.${patch}`;
}

function replaceOrThrow(content, pattern, replacement, label) {
  const updated = content.replace(pattern, replacement);

  if (updated === content) {
    throw new Error(`Did not find ${label}`);
  }

  return updated;
}

function updateWorkflowVersion(nextTag) {
  const original = readText(workflowPath);
  const updated = replaceOrThrow(
    original,
    /loliman\/agentic-shortbox@v\d+\.\d+\.\d+/g,
    `loliman/agentic-shortbox@${nextTag}`,
    'workflow action version reference'
  );
  writeText(workflowPath, updated);
}

function updateReadmeVersion(nextTag) {
  const original = readText(readmePath);
  const updated = replaceOrThrow(
    original,
    /christian-riese\/agentic-shortbox@v\d+\.\d+\.\d+/g,
    `christian-riese/agentic-shortbox@${nextTag}`,
    'README action version reference'
  );
  writeText(readmePath, updated);
}

function printUsage() {
  console.log('Usage: node scripts/release.mjs [patch|minor|major]');
  console.log('Defaults to patch.');
}

const releaseType = process.argv[2] ?? 'patch';

if (releaseType === '--help' || releaseType === '-h') {
  printUsage();
  process.exit(0);
}

const packageJson = JSON.parse(readText(packageJsonPath));
const currentVersion = packageJson.version;
const nextVersion = bumpVersion(currentVersion, releaseType);
const currentTag = `v${currentVersion}`;
const nextTag = `v${nextVersion}`;

console.log(`Releasing ${nextTag} (from ${currentTag})`);

run(`npm version ${nextVersion} --no-git-tag-version`);
updateWorkflowVersion(nextTag);
updateReadmeVersion(nextTag);
run('npm run build');
run('git add .');
run(`git commit -m "build: release ${nextTag}"`);
run(`git tag ${nextTag}`);

console.log(`Created commit and tag ${nextTag}. Push when ready.`);
