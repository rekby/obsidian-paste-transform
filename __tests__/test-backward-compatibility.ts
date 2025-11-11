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
    
    // Check first rule
    expect(plugin.settings.rules[0]).toEqual({
      pattern: '^sync:(.+)$',
      type: 'replace',
      replacer: 'SYNC:$1',
      script: ''
    });
    
    // Check second rule
    expect(plugin.settings.rules[1]).toEqual({
      pattern: '^error:(.+)$',
      type: 'replace',
      replacer: 'ERROR:$1',
      script: ''
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
    const result = await plugin.applyRules('sync:abc');
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
});
