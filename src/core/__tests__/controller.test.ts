import { describe, it, expect, beforeEach } from '@jest/globals';
import { Controller } from '../controller';

// Mock Controller for testing
class MockController extends Controller {
  // Simulating an error response
  triggerError(message: string) {
    throw new Error(message);
  }
}

describe("Test the Controller Error Messages", () => {
  let mockController: MockController;

  beforeEach(() => {
    mockController = new MockController();
  });

  it("should throw the correct error message when a different string is provided", () => {
    const errorMessage = "test error message B";

    expect(() => {
      mockController.triggerError(errorMessage);
    }).toThrow(errorMessage);
  });

  it("should confirm the thrown error is an instance of Error and validate its message", () => {
    const errorMessage = "validation check";

    try {
      mockController.triggerError(errorMessage);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(errorMessage);
    }
  });

  it("should correctly handle and throw multi-word error messages", () => {
    const errorMessage = "this is a multi-word error";

    expect(() => {
      mockController.triggerError(errorMessage);
    }).toThrow(errorMessage);
  });

  it("should throw errors with special characters in the message", () => {
    const errorMessage = "special characters !@#$%^&*()";

    expect(() => {
      mockController.triggerError(errorMessage);
    }).toThrow(errorMessage);
  });

  it("should verify the controller throws unique error messages based on input", () => {
    const errorMessage = "unique error message for input validation";

    expect(() => {
      mockController.triggerError(errorMessage);
    }).toThrow(errorMessage);
  });

  it("should maintain the integrity of error objects with unexpected input", () => {
    const errorMessage = "unexpected input edge case";

    try {
      mockController.triggerError(errorMessage);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(errorMessage);
    }
  });
});
