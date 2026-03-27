import { Controller } from '../controller';

describe('Controller Error Messages', () => {
    test('should return a clear error message for INVALID_CONFIG', () => {
        const result = Controller.handleError('INVALID_CONFIG');
        expect(result).toBe('⚠️ Configuration issue detected. Please review your setup and ensure all required configuration labels are applied correctly.');
    });

    test('should include context in error message for INVALID_CONFIG', () => {
        const result = Controller.handleError('INVALID_CONFIG', 'Missing required label.');
        expect(result).toBe('⚠️ Configuration issue detected. Missing required label. Please review your setup and ensure all required configuration labels are applied correctly.');
    });

    test('should return a clear error message for LABEL_CONFLICT', () => {
        const result = Controller.handleError('LABEL_CONFLICT');
        expect(result).toBe('🚨 Conflicting labels detected. Only one agent label (e.g., \'agent:codex\') and one model label (e.g., \'model:fast\') can be active at a time.');
    });

    test('should include context in error message for LABEL_CONFLICT', () => {
        const result = Controller.handleError('LABEL_CONFLICT', 'Both agent:codex and agent:gemini labels were found.');
        expect(result).toBe('🚨 Conflicting labels detected. Both agent:codex and agent:gemini labels were found. Only one agent label (e.g., \'agent:codex\') and one model label (e.g., \'model:fast\') can be active at a time.');
    });

    test('should return a fallback error message for unknown errors', () => {
        const result = Controller.handleError('UNKNOWN_ERROR');
        expect(result).toBe('❓ An unidentified error has occurred. Please report this issue for further investigation.');
    });
});
