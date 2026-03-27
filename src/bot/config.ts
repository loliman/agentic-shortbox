import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';

type BotConfig = {
  apiKey?: string;
  agentName?: string;
  maxRetries?: number;
};

const DEFAULT_CONFIG: BotConfig = {
  apiKey: '',
  agentName: 'default-agent',
  maxRetries: 3,
};

export class ConfigReader {
  private static CONFIG_PATH = path.resolve(process.cwd(), 'bot.config.yml');

  static readConfig(): BotConfig {
    try {
      const fileContent = fs.readFileSync(this.CONFIG_PATH, 'utf8');
      const parsedContent = yaml.load(fileContent) as BotConfig;

      const validatedConfig = this.validateAndApplyDefaults(parsedContent);

      return validatedConfig;
    } catch (error) {
      console.error(`Failed to read or parse ${this.CONFIG_PATH}:`, error);
      return DEFAULT_CONFIG;
    }
  }

  private static validateAndApplyDefaults(config: Partial<BotConfig>): BotConfig {
    const validated: BotConfig = { ...DEFAULT_CONFIG };

    if (typeof config.apiKey === 'string') {
      validated.apiKey = this.truncateField(config.apiKey);
    }

    if (typeof config.agentName === 'string') {
      validated.agentName = this.truncateField(config.agentName);
    }

    if (typeof config.maxRetries === 'number' && config.maxRetries >= 0) {
      validated.maxRetries = config.maxRetries;
    }

    return validated;
  }

  private static truncateField(field: string): string {
    if (field.length > 1000) {
      console.warn(`Field exceeded 1000 characters and was truncated. Original value:
${field}`);
      return field.substring(0, 1000);
    }
    return field;
  }
}