import { ConfigReader } from '../config';
import fs from 'fs';

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

describe('ConfigReader', () => {
  const MOCK_CONFIG_PATH = 'bot.config.yml';
  
  beforeEach(() => {
    (fs.readFileSync as jest.Mock).mockReset();
  });

  it('should parse a valid YAML config and apply defaults for missing fields', () => {
    const validYaml = `apiKey: test-key
agentName: test-agent`; 
    (fs.readFileSync as jest.Mock).mockReturnValue(validYaml);

    const config = ConfigReader.readConfig();

    expect(config).toEqual({
      apiKey: 'test-key',
      agentName: 'test-agent',
      maxRetries: 3,
    });
  });

  it('should truncate fields that exceed 1000 characters', () => {
    const longField = 'a'.repeat(1100);
    const validYaml = `apiKey: ${longField}
agentName: shortname`;
    (fs.readFileSync as jest.Mock).mockReturnValue(validYaml);

    const config = ConfigReader.readConfig();

    expect(config.apiKey).toHaveLength(1000);
    expect(config.agentName).toEqual('shortname');
  });

  it('should use default values when fields are missing', () => {
    const validYaml = `apiKey: test-key`;
    (fs.readFileSync as jest.Mock).mockReturnValue(validYaml);

    const config = ConfigReader.readConfig();

    expect(config).toEqual({
      apiKey: 'test-key',
      agentName: 'default-agent',
      maxRetries: 3,
    });
  });

  it('should return default configuration in case of a file read error', () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => { throw new Error('File read error'); });

    const config = ConfigReader.readConfig();

    expect(config).toEqual({
      apiKey: '',
      agentName: 'default-agent',
      maxRetries: 3,
    });
  });
});