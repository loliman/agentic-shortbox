// src/core/__tests__/welcomeMessages.test.ts

import { describe, it, expect } from '@jest/globals';
import { getWelcomeMessage } from '../../bot/controller';

describe('getWelcomeMessage', () => {
  it('returns the message for first interaction', () => {
    const message = getWelcomeMessage(true);
    expect(message).toBe("👋 Welcome to the repository! We're excited to have you here. This bot can help streamline your development workflows. Check out the README for getting started!");
  });

  it('returns the message for returning users', () => {
    const message = getWelcomeMessage(false);
    expect(message).toBe("👋 Welcome back! Let us know how we can assist with your development needs today.");
  });
});