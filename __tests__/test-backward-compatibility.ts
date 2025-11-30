import PasteTransform from '../main';

describe('PasteTransform Backward Compatibility', () => {
  let plugin: PasteTransform;

  beforeEach(async () => {
    // Create mock app and manifest objects
    const mockApp: any = {};
    const mockManifest: any = {
      id: 'paste-code-transform',
      name: 'Paste Transform',
      version: '0.1.9',
      minAppVersion: '1.1.8',
      description: 'Handle pasted text and transform it by regexp rules.',
      author: 'Timofey Koolin',
      authorUrl: 'https://github.com/rekby',
      isDesktopOnly: false
    };
    
    plugin = new PasteTransform(mockApp, mockManifest);
  });

  it('should convert old format settings to new format', async () => {
    // Mock old format settings data
    const oldFormatSettings = {
      patterns: [
        '^sync:(.+)$',
        '^error:(.+)$'
      ],
      replacers: [
        'SYNC:$1',
        'ERROR:$1'
      ],
      settingsFormatVersion: 1,
      debugMode: false
    };

    // Mock loadData to return old format settings
    jest.spyOn(plugin, 'loadData').mockResolvedValue(oldFormatSettings);
    
    // Load settings (this should trigger the conversion)
    await plugin.loadSettings();

    // Check that settings were converted to new format
    expect(plugin.settings.settingsFormatVersion).toBe(2);
    expect(plugin.settings.rules).toHaveLength(2);
    expect(plugin.settings.scriptSecurityWarningAccepted).toBe(false);
    
    // Check first rule
    expect(plugin.settings.rules[0]).toEqual({
      pattern: '^sync:(.+)$',
      type: 'replace',
      replacer: 'SYNC:$1',
      script: '',
      enabled: true
    });
    
    // Check second rule
    expect(plugin.settings.rules[1]).toEqual({
      pattern: '^error:(.+)$',
      type: 'replace',
      replacer: 'ERROR:$1',
      script: '',
      enabled: true
    });
  });

  it('should execute rules correctly after conversion', async () => {
    // Mock old format settings data
    const oldFormatSettings = {
      patterns: [
        '^sync:(.+)$'
      ],
      replacers: [
        'SYNC:$1'
      ],
      settingsFormatVersion: 1,
      debugMode: false
    };

    // Mock loadData to return old format settings
    jest.spyOn(plugin, 'loadData').mockResolvedValue(oldFormatSettings);
    
    // Load settings (this should trigger the conversion)
    await plugin.loadSettings();

    // Test that the converted rule works correctly
    const {changed, result} = await plugin.applyRules('sync:abc');
    expect(changed).toBe(true);
    expect(result).toBe('SYNC:abc');
  });

  it('should handle mismatched patterns and replacers arrays', async () => {
    // Mock old format settings data with mismatched arrays
    const oldFormatSettings = {
      patterns: [
        '^sync:(.+)$',
        '^error:(.+)$',
        '^test:(.+)$'  // Extra pattern
      ],
      replacers: [
        'SYNC:$1',
        'ERROR:$1'
      ],
      settingsFormatVersion: 1,
      debugMode: false
    };

    // Mock loadData to return old format settings
    jest.spyOn(plugin, 'loadData').mockResolvedValue(oldFormatSettings);
    
    // Load settings (this should trigger the conversion)
    await plugin.loadSettings();

    // Should only create rules for the minimum length of patterns and replacers
    expect(plugin.settings.rules).toHaveLength(2);
  });

  it('should block script execution when security warning not accepted', async () => {
    // Create settings with a script rule
    const settingsWithScript = {
      rules: [
        {
          pattern: '^test:(.+)$',
          type: 'script',
          replacer: '',
          script: 'return "TRANSFORMED:" + ctx.foundText;',
          enabled: true
        }
      ],
      settingsFormatVersion: 2,
      debugMode: false,
      showRuleNotifications: false,
      scriptSecurityWarningAccepted: false
    };

    // Mock loadData to return settings with script
    jest.spyOn(plugin, 'loadData').mockResolvedValue(settingsWithScript);
    
    // Load settings
    await plugin.loadSettings();

    // Test that the script is NOT executed (should return original text)
    const {changed, result} = await plugin.applyRules('test:abc');
    expect(changed).toBe(false);
    expect(result).toBe('test:abc'); // Original text unchanged
  });

  it('should allow script execution when security warning is accepted', async () => {
    // Create settings with a script rule and security accepted
    const settingsWithScript = {
      rules: [
        {
          pattern: '^test:(.+)$',
          type: 'script',
          replacer: '',
          script: 'return "TRANSFORMED:" + ctx.foundText;',
          enabled: true
        }
      ],
      settingsFormatVersion: 2,
      debugMode: false,
      showRuleNotifications: false,
      scriptSecurityWarningAccepted: true
    };

    // Mock loadData to return settings with script
    jest.spyOn(plugin, 'loadData').mockResolvedValue(settingsWithScript);
    
    // Load settings
    await plugin.loadSettings();

    // Test that the script IS executed
    const {changed, result} = await plugin.applyRules('test:abc');
    expect(changed).toBe(true);
    expect(result).toBe('TRANSFORMED:test:abc');
  });

  it('should set scriptSecurityWarningAccepted to false by default for new installations', async () => {
    // Mock loadData to return null (new installation)
    jest.spyOn(plugin, 'loadData').mockResolvedValue(null);
    
    // Load settings
    await plugin.loadSettings();

    // Check that scriptSecurityWarningAccepted is false by default
    expect(plugin.settings.scriptSecurityWarningAccepted).toBe(false);
  });
});
