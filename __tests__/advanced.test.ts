// Create a mock Notice constructor before importing anything
const mockNoticeConstructor = jest.fn(function(this: any, message: string, duration?: number) {
  this.message = message;
  this.duration = duration;
});

// Mock the obsidian module with our tracked Notice
jest.mock('obsidian', () => {
  const actualModule = jest.requireActual('../__mocks__/obsidian');
  return {
    ...actualModule,
    Notice: mockNoticeConstructor,
  };
});

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
    
    // Accept security warning for all tests (since we're testing functionality, not security)
    plugin.settings.scriptSecurityWarningAccepted = true;
  });

	it('should execute a simple regex replace rule', async () => {
		plugin.settings.rules = [
			{
				pattern: '^regex:(.+)$',
				type: 'replace',
				replacer: '$1',
				script: "",
				enabled: true
			}
		];
		plugin.compileRules();

		const {changed, result} = await plugin.applyRules('regex:abc');
		expect(changed).toBe(true);
		expect(result).toBe('abc');
	});

  it('should execute a simple script rule', async () => {
    plugin.settings.rules = [
      {
        pattern: '^sync:(.+)$',
        type: 'script',
        replacer: '',
        script: 'return ctx.match[1].toUpperCase();',
        enabled: true
      }
    ];
    plugin.compileRules();

    const {changed, result} = await plugin.applyRules('sync:abc');
    expect(changed).toBe(true);
    expect(result).toBe('ABC');
  });

  it('should handle script errors gracefully', async () => {
    // Suppress error output to console for clean test output
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    plugin.settings.rules = [
      {
        pattern: '^error:(.+)$',
        type: 'script',
        replacer: '',
        script: 'throw new Error("Test error");',
        enabled: true
      }
    ];
    plugin.compileRules();

    const {changed, result} = await plugin.applyRules('error:test');
    // Should return the original text if there's an error
    expect(changed).toBe(false);
    expect(result).toBe('error:test');
    
    // Verify that the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error executing script for rule #1:",
      expect.any(Error)
    );

    // Restore console.error
    consoleErrorSpy.mockRestore();
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
              resolve(ctx.match[1].toUpperCase());
            }, 10);
          });
        `,
        enabled: true
      }
    ];
    plugin.compileRules();

    const {changed, result} = await plugin.applyRules('async:abc');
    expect(changed).toBe(true);
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
          const input = ctx.match[1];
          return input.toUpperCase();
        `,
        enabled: true
      }
    ];
    plugin.compileRules();

    const {changed, result} = await plugin.applyRules('async-test:hello');
    expect(changed).toBe(true);
    expect(result).toBe('HELLO');
  });

  it('should handle errors in async/await scripts with automatic wrapping', async () => {
    // Suppress error output to console for clean test output
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    plugin.settings.rules = [
      {
        pattern: '^error-test:(.+)$',
        type: 'script',
        replacer: '',
        script: `
          // User can write natural async/await code that throws errors
          await new Promise(resolve => setTimeout(resolve, 1));
          throw new Error("Test error");
        `,
        enabled: true
      }
    ];
    plugin.compileRules();

    const {changed, result} = await plugin.applyRules('error-test:should-not-change');
    // Should return the original text if there's an error
    expect(changed).toBe(false);
    expect(result).toBe('error-test:should-not-change');
    
    // Verify that the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error executing script for rule #1:",
      expect.any(Error)
    );

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it('should transform GitHub issue URL with title from API', async () => {
    // Mock fetch for GitHub API
    global.fetch = jest.fn((url: string) => {
      if (url === 'https://api.github.com/repos/rekby/obsidian-paste-transform/issues/1') {
        return Promise.resolve({
          json: () => Promise.resolve({
            title: 'example issue'
          })
        } as Response);
      }
      return Promise.reject(new Error('Unexpected URL'));
    });

    plugin.settings.rules = [
      {
        pattern: "^https://github.com/([^/]+)/([^/]+)/issues/(\\d+)$",
        type: 'script',
        replacer: "",
        script: "" +
          "const url=`https://api.github.com/repos/${ctx.match[1]}/${ctx.match[2]}/issues/${ctx.match[3]}`\n" +
          "const response = await fetch(url);\n" +
          "const data = await response.json();\n" +
          "const title = data.title;\n" +
          "return `[${ctx.match[2]}#${ctx.match[3]}: ${title}](${ctx.foundText})`;",
        enabled: true
      }
    ];
    plugin.compileRules();

    const {changed, result} = await plugin.applyRules('https://github.com/rekby/obsidian-paste-transform/issues/1');
    
    expect(changed).toBe(true);
    expect(result).toBe('[obsidian-paste-transform#1: example issue](https://github.com/rekby/obsidian-paste-transform/issues/1)');
    
    // Verify that fetch was called with the correct URL
    expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/repos/rekby/obsidian-paste-transform/issues/1');
  });

  it('should show Obsidian Notice when script execution fails', async () => {
    // Suppress error output to console for clean test output
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Clear previous mockNoticeConstructor calls
    mockNoticeConstructor.mockClear();

    plugin.settings.rules = [
      {
        pattern: '^notice-test:(.+)$',
        type: 'script',
        replacer: '',
        script: 'throw new Error("Test error message");',
        enabled: true
      }
    ];
    plugin.compileRules();

    const {changed, result} = await plugin.applyRules('notice-test:test');
    
    // Should return the original text if there's an error
    expect(changed).toBe(false);
    expect(result).toBe('notice-test:test');
    
    // Verify that Notice was called with the correct error message
    expect(mockNoticeConstructor).toHaveBeenCalledWith(
      'Rule #1 script execution error: Test error message',
      5000
    );
    
    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  // Tests for multiple matches support
  describe('Multiple Matches Support', () => {
    it('should replace all matches with regex replacer', async () => {
      plugin.settings.rules = [
        {
          pattern: 'https://github.com/[^/]+/([^\\s]+)',
          type: 'replace',
          replacer: '[GitHub: $1]',
          script: '',
          enabled: true
        }
      ];
      plugin.compileRules();

      const text = 'Check https://github.com/user/repo1 and https://github.com/user/repo2 and https://github.com/user/repo3';
      const {changed, result} = await plugin.applyRules(text);
      
      expect(changed).toBe(true);
      expect(result).toBe('Check [GitHub: repo1] and [GitHub: repo2] and [GitHub: repo3]');
    });

    it('should execute script for all matches', async () => {
      plugin.settings.rules = [
        {
          pattern: 'test(\\d+)',
          type: 'script',
          replacer: '',
          script: 'return "RESULT" + ctx.match[1];',
          enabled: true
        }
      ];
      plugin.compileRules();

      const text = 'test1 and test2 and test3';
      const {changed, result} = await plugin.applyRules(text);
      
      expect(changed).toBe(true);
      expect(result).toBe('RESULT1 and RESULT2 and RESULT3');
    });

    it('should execute async script for all matches sequentially', async () => {
      plugin.settings.rules = [
        {
          pattern: 'async(\\d+)',
          type: 'script',
          replacer: '',
          script: `
            await new Promise(resolve => setTimeout(resolve, 5));
            return "ASYNC" + ctx.match[1];
          `,
          enabled: true
        }
      ];
      plugin.compileRules();

      const text = 'async1 and async2 and async3';
      const {changed, result} = await plugin.applyRules(text);
      
      expect(changed).toBe(true);
      expect(result).toBe('ASYNC1 and ASYNC2 and ASYNC3');
    });

    it('should apply rules sequentially (chain of rules)', async () => {
      plugin.settings.rules = [
        {
          pattern: 'test',
          type: 'replace',
          replacer: 'STEP1',
          script: '',
          enabled: true
        },
        {
          pattern: 'STEP1',
          type: 'replace',
          replacer: 'STEP2',
          script: '',
          enabled: true
        },
        {
          pattern: 'STEP2',
          type: 'script',
          replacer: '',
          script: 'return "FINAL";',
          enabled: true
        }
      ];
      plugin.compileRules();

      const {changed, result} = await plugin.applyRules('test');
      
      expect(changed).toBe(true);
      expect(result).toBe('FINAL');
    });

    it('should handle errors in rule chain and continue with next rules', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockNoticeConstructor.mockClear();

      plugin.settings.rules = [
        {
          pattern: 'test',
          type: 'replace',
          replacer: 'RESULT1',
          script: '',
          enabled: true
        },
        {
          pattern: 'RESULT1',
          type: 'script',
          replacer: '',
          script: 'throw new Error("Rule 2 error");',
          enabled: true
        },
        {
          pattern: 'RESULT1',
          type: 'replace',
          replacer: 'RESULT3',
          script: '',
          enabled: true
        }
      ];
      plugin.compileRules();

      const {changed, result} = await plugin.applyRules('test');
      
      // Rule 1 should succeed, rule 2 should fail, rule 3 should process rule 1's result
      expect(changed).toBe(true);
      expect(result).toBe('RESULT3');
      
      // Verify that Notice was shown for the error
      expect(mockNoticeConstructor).toHaveBeenCalledWith(
        'Rule #2 script execution error: Rule 2 error',
        5000
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle multiple matches with chained rules', async () => {
      plugin.settings.rules = [
        {
          pattern: 'a',
          type: 'replace',
          replacer: 'A',
          script: '',
          enabled: true
        },
        {
          pattern: 'A',
          type: 'replace',
          replacer: 'AA',
          script: '',
          enabled: true
        }
      ];
      plugin.compileRules();

      const {changed, result} = await plugin.applyRules('a b a c a');
      
      expect(changed).toBe(true);
      expect(result).toBe('AA b AA c AA');
    });

    it('should return changed=false when no rules match', async () => {
      plugin.settings.rules = [
        {
          pattern: 'nomatch',
          type: 'replace',
          replacer: 'REPLACED',
          script: '',
          enabled: true
        }
      ];
      plugin.compileRules();

      const originalText = 'some text without matches';
      const {changed, result} = await plugin.applyRules(originalText);
      
      expect(changed).toBe(false);
      expect(result).toBe(originalText);
    });
  });

  describe('Script timeout notifications', () => {
    afterEach(async () => {
      // Always restore real timers and run any pending ones
      try {
        await jest.runOnlyPendingTimersAsync();
      } catch (e) {
        // Ignore errors if timers are not mocked
      }
      jest.useRealTimers();
    });

    it('should show notification when script takes longer than 3 seconds', async () => {
      jest.useFakeTimers();
      
      // Track Notice constructor calls
      const noticeCalls: Array<{message: string, duration: number}> = [];
      const OriginalNotice = (require('obsidian') as any).Notice;
      (require('obsidian') as any).Notice = class MockNotice {
        constructor(message: string, duration: number) {
          noticeCalls.push({message, duration});
        }
      };

      try {
        plugin.settings.rules = [
          {
            pattern: '^slow:(.+)$',
            type: 'script',
            replacer: '',
            script: `
              // Simulate a slow operation
              await new Promise(resolve => setTimeout(resolve, 3500));
              return ctx.match[1].toUpperCase();
            `,
            enabled: true
          }
        ];
        plugin.compileRules();

        // Start the async operation
        const resultPromise = plugin.applyRules('slow:test');
        
        // Fast-forward time and wait for all timers
        await jest.runAllTimersAsync();
        
        const {changed, result} = await resultPromise;
        
        expect(changed).toBe(true);
        expect(result).toBe('TEST');
        
        // Check that timeout notification was shown
        const timeoutNotifications = noticeCalls.filter(
          call => call.message.includes('taking longer than expected')
        );
        expect(timeoutNotifications.length).toBeGreaterThan(0);
        expect(timeoutNotifications[0].message).toContain('Rule #1');
      } finally {
        // Restore original Notice
        (require('obsidian') as any).Notice = OriginalNotice;
      }
    });

    it('should not show notification when script completes within 3 seconds', async () => {
      jest.useFakeTimers();
      
      // Track Notice constructor calls
      const noticeCalls: Array<{message: string, duration: number}> = [];
      const OriginalNotice = (require('obsidian') as any).Notice;
      (require('obsidian') as any).Notice = class MockNotice {
        constructor(message: string, duration: number) {
          noticeCalls.push({message, duration});
        }
      };

      try {
        plugin.settings.rules = [
          {
            pattern: '^fast:(.+)$',
            type: 'script',
            replacer: '',
            script: `
              // Simulate a fast operation
              await new Promise(resolve => setTimeout(resolve, 100));
              return ctx.match[1].toUpperCase();
            `,
            enabled: true
          }
        ];
        plugin.compileRules();

        // Start the async operation
        const resultPromise = plugin.applyRules('fast:test');
        
        // Fast-forward only 100ms (script completes before 3000ms timeout)
        await jest.advanceTimersByTimeAsync(100);
        
        const {changed, result} = await resultPromise;
        
        expect(changed).toBe(true);
        expect(result).toBe('TEST');
        
        // Check that no timeout notification was shown
        const timeoutNotifications = noticeCalls.filter(
          call => call.message.includes('taking longer than expected')
        );
        expect(timeoutNotifications.length).toBe(0);
      } finally {
        // Restore original Notice
        (require('obsidian') as any).Notice = OriginalNotice;
      }
    });

    it('should not show notification when script completes quickly (bug reproduction)', async () => {
      jest.useFakeTimers();
      
      // Track Notice constructor calls
      const noticeCalls: Array<{message: string, duration: number}> = [];
      const OriginalNotice = (require('obsidian') as any).Notice;
      (require('obsidian') as any).Notice = class MockNotice {
        constructor(message: string, duration: number) {
          noticeCalls.push({message, duration});
        }
      };

      try {
        plugin.settings.rules = [
          {
            pattern: '^quick:(.+)$',
            type: 'script',
            replacer: '',
            script: `
              // Very fast operation - completes immediately
              return ctx.match[1].toUpperCase();
            `,
            enabled: true
          }
        ];
        plugin.compileRules();

        // Start the async operation
        const resultPromise = plugin.applyRules('quick:test');
        
        // Wait for script to complete
        await jest.advanceTimersByTimeAsync(0);
        const {changed, result} = await resultPromise;
        
        expect(changed).toBe(true);
        expect(result).toBe('TEST');
        
        // Now advance time to 3000ms to see if timeout fires
        await jest.advanceTimersByTimeAsync(3000);
        
        // Check that no timeout notification was shown
        const timeoutNotifications = noticeCalls.filter(
          call => call.message.includes('taking longer than expected')
        );
        expect(timeoutNotifications.length).toBe(0);
      } finally {
        // Restore original Notice
        (require('obsidian') as any).Notice = OriginalNotice;
      }
    });

    it('should not show notification when script throws error', async () => {
      jest.useFakeTimers();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Track Notice constructor calls
      const noticeCalls: Array<{message: string, duration: number}> = [];
      const OriginalNotice = (require('obsidian') as any).Notice;
      (require('obsidian') as any).Notice = class MockNotice {
        constructor(message: string, duration: number) {
          noticeCalls.push({message, duration});
        }
      };

      try {
        plugin.settings.rules = [
          {
            pattern: '^error:(.+)$',
            type: 'script',
            replacer: '',
            script: `
              throw new Error("Test error");
            `,
            enabled: true
          }
        ];
        plugin.compileRules();

        // Start the async operation
        const resultPromise = plugin.applyRules('error:test');
        
        // Wait for script to complete (with error)
        await jest.advanceTimersByTimeAsync(0);
        const {changed, result} = await resultPromise;
        
        expect(changed).toBe(false);
        expect(result).toBe('error:test');
        
        // Now advance time to 3000ms to see if timeout fires
        await jest.advanceTimersByTimeAsync(3000);
        
        // Check that no timeout notification was shown (only error notification)
        const timeoutNotifications = noticeCalls.filter(
          call => call.message.includes('taking longer than expected')
        );
        expect(timeoutNotifications.length).toBe(0);
        
        // Verify error notification was shown
        const errorNotifications = noticeCalls.filter(
          call => call.message.includes('script execution error')
        );
        expect(errorNotifications.length).toBeGreaterThan(0);
      } finally {
        // Restore original Notice
        (require('obsidian') as any).Notice = OriginalNotice;
        consoleErrorSpy.mockRestore();
      }
    });

    it('should show notification for each slow match separately', async () => {
      jest.useFakeTimers();
      
      // Track Notice constructor calls
      const noticeCalls: Array<{message: string, duration: number}> = [];
      const OriginalNotice = (require('obsidian') as any).Notice;
      (require('obsidian') as any).Notice = class MockNotice {
        constructor(message: string, duration: number) {
          noticeCalls.push({message, duration});
        }
      };

      try {
        plugin.settings.rules = [
          {
            pattern: 'slow:(\\w+)',
            type: 'script',
            replacer: '',
            script: `
              // Simulate a slow operation
              await new Promise(resolve => setTimeout(resolve, 3500));
              return ctx.match[1].toUpperCase();
            `,
            enabled: true
          }
        ];
        plugin.compileRules();

        // Start the async operation
        const resultPromise = plugin.applyRules('slow:one slow:two');
        
        // Run all timers to completion
        await jest.runAllTimersAsync();
        
        const {changed, result} = await resultPromise;
        
        expect(changed).toBe(true);
        expect(result).toBe('ONE TWO');
        
        // Check that timeout notification was shown for each match
        // Filter only timeout notifications (not "Rule #X triggered" notifications)
        const timeoutNotifications = noticeCalls.filter(
          call => call.message.includes('taking longer than expected') && call.duration === 5000
        );
        
        // We expect 2 timeout notifications (one for each match)
        expect(timeoutNotifications.length).toBe(2);
        expect(timeoutNotifications[0].message).toContain('Rule #1');
        expect(timeoutNotifications[1].message).toContain('Rule #1');
      } finally {
        // Restore original Notice
        (require('obsidian') as any).Notice = OriginalNotice;
      }
    });
  });
});
