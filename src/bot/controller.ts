// src/bot/controller.ts

import { Octokit } from '@octokit/rest';

const getWelcomeMessage = (isFirstInteraction: boolean): string => {
  return isFirstInteraction
    ? "👋 Welcome to the repository! We're excited to have you here. This bot can help streamline your development workflows. Check out the README for getting started!"
    : "👋 Welcome back! Let us know how we can assist with your development needs today.";
};

export const handleIssueOpened = async (octokit: Octokit, issueContext: any): Promise<void> => {
  const { owner, repo, issueNumber, isFirstInteraction } = issueContext;

  const welcomeMessage = getWelcomeMessage(isFirstInteraction);

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: welcomeMessage
  });
};

export default {
  getWelcomeMessage,
  handleIssueOpened
};