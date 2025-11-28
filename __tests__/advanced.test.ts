import PasteTransform from '../main';

describe('PasteTransform Advanced Features', () => {
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
    await plugin.loadSettings();
    // plugin.settings.debugMode = true; // Enable debug mode
  });

	it('should execute a simple regex replace rule', async () => {
		plugin.settings.rules = [
			{
				pattern: '^regex:(.+)$',
				type: 'replace',
				replacer: '$1',
				script: ""
			}
		];
		plugin.compileRules();

		const result = await plugin.applyRules('regex:abc');
		expect(result).toBe('abc');
	});

  it('should execute a simple script rule', async () => {
    plugin.settings.rules = [
      {
        pattern: '^sync:(.+)$',
        type: 'script',
        replacer: '',
        script: 'return match[1].toUpperCase();'
      }
    ];
    plugin.compileRules();

    const result = await plugin.applyRules('sync:abc');
    expect(result).toBe('ABC');
  });

  it('should handle script errors gracefully', async () => {
    plugin.settings.rules = [
      {
        pattern: '^error:(.+)$',
        type: 'script',
        replacer: '',
        script: 'throw new Error("Test error");'
      }
    ];
    plugin.compileRules();

    const result = await plugin.applyRules('error:test');
    // Should return the original text if there's an error
    expect(result).toBe('error:test');
  });

  it('should handle asynchronous script execution', async () => {
    plugin.settings.rules = [
      {
        pattern: '^async:(.+)$',
        type: 'script',
        replacer: '',
        script: `
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(match[1].toUpperCase());
            }, 10);
          });
        `
      }
    ];
    plugin.compileRules();

    const result = await plugin.applyRules('async:abc');
    expect(result).toBe('ABC');
  });

  it('should handle async/await script execution with automatic wrapping', async () => {
    plugin.settings.rules = [
      {
        pattern: '^async-test:(.+)$',
        type: 'script',
        replacer: '',
        script: `
          // User can write natural async/await code without worrying about wrapping
          // Simulate async operation without network calls
          await new Promise(resolve => setTimeout(resolve, 10));
          const input = match[1];
          return input.toUpperCase();
        `
      }
    ];
    plugin.compileRules();

    const result = await plugin.applyRules('async-test:hello');
    expect(result).toBe('HELLO');
  });

  it('should handle errors in async/await scripts with automatic wrapping', async () => {
    plugin.settings.rules = [
      {
        pattern: '^error-test:(.+)$',
        type: 'script',
        replacer: '',
        script: `
          // User can write natural async/await code that throws errors
          await new Promise(resolve => setTimeout(resolve, 1));
          throw new Error("Test error");
        `
      }
    ];
    plugin.compileRules();

    const result = await plugin.applyRules('error-test:should-not-change');
    // Should return the original text if there's an error
    expect(result).toBe('error-test:should-not-change');
  });

  // Tests for multiple matches replacement
  it('should replace all matches with regex replacer (fixed behavior)', async () => {
    plugin.settings.rules = [
      {
        pattern: 'abc',
        type: 'replace',
        replacer: 'XYZ',
        script: ''
      }
    ];
    plugin.compileRules();

    const result = await plugin.applyRules('abc def abc ghi abc');
    // Should now replace all matches
    expect(result).toBe('XYZ def XYZ ghi XYZ');
  });

  it('should replace all matches with script replacer (fixed behavior)', async () => {
    plugin.settings.rules = [
      {
        pattern: 'num:(\\d+)',
        type: 'script',
        replacer: '',
        script: 'return "NUMBER:" + match[1];'
      }
    ];
    plugin.compileRules();

    const result = await plugin.applyRules('num:123 and num:456 and num:789');
    // Should now replace all matches
    expect(result).toBe('NUMBER:123 and NUMBER:456 and NUMBER:789');
  });
});
