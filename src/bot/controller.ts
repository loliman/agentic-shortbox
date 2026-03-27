import { Logger } from '../core/logger';

export class Controller {
    static handleError(errorCode: string, context?: string): string {
        switch (errorCode) {
            case 'INVALID_CONFIG':
                return `⚠️ Configuration issue detected. ${context ? context + ' ' : ''}Please review your setup and ensure all required configuration labels are applied correctly.`;
            case 'COMMAND_INVALID':
                return `🚫 The command you issued is invalid in the current workflow state. Make sure your comments match the accepted command syntax.`;
            case 'LABEL_CONFLICT':
                return `🚨 Conflicting labels detected. ${context ? context + ' ' : ''}Only one agent label (e.g., 'agent:codex') and one model label (e.g., 'model:fast') can be active at a time.`;
            case 'MISSING_PLAN_STAGE':
                return `⚠️ Implementation cannot proceed because a valid plan is missing. Ensure 'ready to plan' was executed successfully before moving to implementation.`;
            case 'SYSTEM_FAILURE':
                return `❌ An unexpected system error has occurred. ${context ? 'Details: ' + context + ' ' : ''}Our team has been notified. Please try again later or contact support if the issue persists.`;
            case 'STATE_TRANSITION_ERROR':
                return `🌀 The requested operation isn't valid in the current workflow state. Verify that you're following the proper sequence of commands.`;
            default:
                return `❓ An unidentified error has occurred. ${context ? 'Details: ' + context + ' ' : ''}Please report this issue for further investigation.`;
        }
    }

    static logError(errorCode: string, context?: string): void {
        const message = this.handleError(errorCode, context);
        Logger.error(message);
    }
}
