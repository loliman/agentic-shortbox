import { describe, it, expect } from '@jest/globals';
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

  it("should throw the correct error message", () => {
    const errorMessage = "am I an animal?";

    expect(() => {
      mockController.triggerError(errorMessage);
    }).toThrow(errorMessage);
  });

  it("should confirm error is an instance of Error", () => {
    const errorMessage = "am I real?";

    try {
      mockController.triggerError(errorMessage);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe(errorMessage);
    }
  });
});