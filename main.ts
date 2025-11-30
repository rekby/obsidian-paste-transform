import {App, Plugin, PluginSettingTab, Setting, TextAreaComponent, DropdownComponent, ButtonComponent, TextComponent, Notice} from 'obsidian';

// Script execution timeout in milliseconds
const SCRIPT_TIMEOUT_MS = 3000;

// Notice duration constants in milliseconds
const NOTICE_DURATION_SHORT = 3000;
const NOTICE_DURATION_NORMAL = 5000;
const NOTICE_DURATION_LONG = 10000;

// Define the type of rule
type RuleType = 'replace' | 'script';

// Define the structure of a rule
interface Rule {
	pattern: string;
	type: RuleType;
	replacer: string; // Used when type is 'replace'
	script: string;   // Used when type is 'script'
	enabled: boolean; // Whether the rule is enabled
}


interface PasteTransformSettingsV2 {
	rules: Rule[],
	settingsFormatVersion: number,
	debugMode: boolean,
	showRuleNotifications: boolean,
	scriptSecurityWarningAccepted: boolean,
}

// Old settings format (version 1)
interface PasteTransformSettingsV1 {
	patterns: string[],
	replacers: string[],
	settingsFormatVersion: number,
	debugMode: boolean,
}

const DEFAULT_SETTINGS: PasteTransformSettingsV2 = {
	rules: [
		{
			pattern: "^https://github.com/[^/]+/([^/]+)$",
			type: 'replace',
			replacer: "[🐈‍⬛ $1]($&)",
			script: "",
			enabled: true
		},
		{
			pattern: "^https://\\w+.wikipedia.org/wiki/([^\\s]+)$",
			type: 'replace',
			replacer: "[📖 $1]($&)",
			script: "",
			enabled: true
		},
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
			enabled: false
		},
		{
			pattern: "^https://github.com/([^/]+)/([^/]+)/pull/(\\d+)$",
			type: 'script',
			replacer: "",
			script: "" +
				"const url=`https://api.github.com/repos/${ctx.match[1]}/${ctx.match[2]}/pulls/${ctx.match[3]}`\n" +
				"const response = await fetch(url);\n" +
				"const data = await response.json();\n" +
				"const title = data.title;\n" +
				"return `[${ctx.match[2]}#${ctx.match[3]}: ${title}](${ctx.foundText})`;",
			enabled: false
		}
	],
	settingsFormatVersion: 2,
	debugMode: false,
	showRuleNotifications: true,
	scriptSecurityWarningAccepted: false,
}

class ScriptContext {
	match: RegExpMatchArray;  // Full match object with groups
	
	constructor(match: RegExpMatchArray) {
		this.match = match;
	}
	
	// Getter for convenient access to the matched substring
	get foundText(): string {
		return this.match[0];
	}
}

class ReplaceRule {
	pattern: RegExp;
	replacer: string;
	script: string | null;
	ruleNumber: number;

	constructor(pattern: string, replacer: string, script: string | null = null, ruleNumber: number) {
		this.pattern = new RegExp(pattern, 'g'); // Add 'g' flag for global matching
		this.replacer = replacer;
		this.script = script;
		this.ruleNumber = ruleNumber;
	}

	async executeScript(match: RegExpMatchArray, debugMode: boolean, app: App, ruleNumber: number): Promise<string> {
		if (this.script) {
			try {
				const startTime = Date.now();
				// Create an async function with context parameter
				const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
				const fn = new AsyncFunction('ctx', this.script);
				const context = new ScriptContext(match);
				
				// Create a timeout promise that shows notification after configured timeout
				let timeoutShown = false;
				const timeoutPromise = new Promise<void>((resolve) => {
					setTimeout(() => {
						if (!timeoutShown) {
							timeoutShown = true;
							new Notice(`Rule #${ruleNumber} is taking longer than expected`, NOTICE_DURATION_NORMAL);
						}
						resolve();
					}, SCRIPT_TIMEOUT_MS);
				});
				
				// Execute the script
				const scriptPromise = fn(context);
				
				// Race between timeout and script, but always wait for script to complete
				Promise.race([scriptPromise, timeoutPromise]).catch(() => {
					// Ignore errors in the race, we'll handle them below
				});
				
				// Always wait for the actual script result
				const result = await scriptPromise;
				const endTime = Date.now();
				if (debugMode) {
					console.log(`Matched regex: ${this.pattern}`);
					console.log(`Match object:`, match);
					console.log(`Script execution time: ${endTime - startTime}ms`);
					console.log(`Result: '${result}'`);
				}
				return result;
			} catch (error) {
			console.error("Error executing script:", error);
			// Show error notification in Obsidian
			const errorMessage = error instanceof Error ? error.message : String(error);
			new Notice(`Script execution error: ${errorMessage}`, NOTICE_DURATION_NORMAL);
			// Return the original match if there's an error
			return match[0];
			}
		}
		// If no script, use the default replacer
		const result = match[0].replace(this.pattern, this.replacer);
		if (debugMode) {
			console.log(`Matched regex: ${this.pattern}`);
			console.log(`Result: '${result}'`);
		}
		return result;
	}

	// Process all matches in the source text with a script
	async executeScriptForAllMatches(source: string, debugMode: boolean, app: App, ruleNumber: number): Promise<string> {
		if (!this.script) {
			return source;
		}

		// Find all matches
		const matches = Array.from(source.matchAll(this.pattern));
		
		if (matches.length === 0) {
			return source;
		}

		// Process matches sequentially from end to start to avoid offset issues
		let result = source;
		for (let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			const matchStart = match.index!;
			const matchEnd = matchStart + match[0].length;
			
			// Execute script for this match
			const replacement = await this.executeScript(match, debugMode, app, ruleNumber);
			
			// Replace this match in the result
			result = result.substring(0, matchStart) + replacement + result.substring(matchEnd);
		}

		return result;
	}
}

export default class PasteTransform extends Plugin {
	settings: PasteTransformSettingsV2;
	rules: ReplaceRule[];

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new PasteTransformSettingsTab(this.app, this));

		this.registerEvent(this.app.workspace.on("editor-paste", event => this.onPaste(event)));
	}

	async onPaste(event: ClipboardEvent){
		if(event.defaultPrevented){
			if (this.settings.debugMode) {
				console.log("It doesn't try to apply rules because event prevented already.");
			}
			return;
		}

		let types = event.clipboardData?.types;
		if (this.settings.debugMode) {
			console.log("transform plugin, clipboard content types:", types);
		}
		if (types === undefined || types.length != 1 || types[0] != "text/plain"){
			return;
		}
		let plainText = event.clipboardData?.getData("text/plain");
		if (plainText === undefined || plainText == ""){
			return;
		}

		if (this.settings.debugMode) {
			console.log(`Original text: '${plainText}'`);
		}

		// Check if any rule matches (synchronously) before async operations
		const hasMatchingRule = this.rules.some(rule => {
			rule.pattern.lastIndex = 0;
			const matches = rule.pattern.test(plainText!);
			rule.pattern.lastIndex = 0;
			return matches;
		});

		// If a rule matches, prevent default paste immediately (before async operations)
		if (hasMatchingRule) {
			event.preventDefault();
		}

		// Apply all rules sequentially
		const {changed, result} = await this.applyRules(plainText);
		
		// If any rule matched and changed the text, insert the transformed text
		if (changed) {
			if (this.settings.debugMode) {
				console.log(`Final text: '${result}'`);
			}
			
			// Insert the transformed text
			this.app.workspace.activeEditor?.editor?.replaceSelection(result);
			
			if (this.settings.debugMode) {
				console.log(`Replaced selection with: '${result}'`);
			}
		}
		// If no rules match, we don't call preventDefault() and let the normal paste happen
	}

	onunload() {

	}

	async loadSettings() {
		const loadedData = await this.loadData();
		
		// Check if we have loaded data and if it's in the old format (version 1)
		if (loadedData && loadedData.settingsFormatVersion === 1 && 
			(loadedData as PasteTransformSettingsV1).patterns !== undefined) {
			// Convert old format to new format
			const oldSettings = loadedData as PasteTransformSettingsV1;
			
		// Create new rules array from old patterns and replacers
		const newRules: Rule[] = [];
		const minIndex = Math.min(oldSettings.patterns.length, oldSettings.replacers.length);
		
		for (let i = 0; i < minIndex; i++) {
			newRules.push({
				pattern: oldSettings.patterns[i],
				type: 'replace',
				replacer: oldSettings.replacers[i],
				script: '',
				enabled: true
			});
		}
			
			// Create new settings object with converted data
			this.settings = {
				rules: newRules,
				settingsFormatVersion: 2, // Update to new format version
				debugMode: oldSettings.debugMode || false,
				showRuleNotifications: true,
				scriptSecurityWarningAccepted: false
			};
		} else {
			// Use default settings merged with loaded data (new format)
			this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
			
			// Ensure scriptSecurityWarningAccepted is set (for backward compatibility with v2 without this field)
			if (this.settings.scriptSecurityWarningAccepted === undefined) {
				this.settings.scriptSecurityWarningAccepted = false;
			}
		}
		
		// Auto-disable script security flag if there are no enabled script rules
		const hasEnabledScriptRules = this.settings.rules.some(rule => 
			rule.type === 'script' && rule.enabled
		);
		if (!hasEnabledScriptRules && this.settings.scriptSecurityWarningAccepted) {
			this.settings.scriptSecurityWarningAccepted = false;
			await this.saveSettings(); // Save the change
		}
		
		this.compileRules();
	}

	compileRules()  {
		this.rules = [];
		for (let i = 0; i < this.settings.rules.length; i++) {
			const rule = this.settings.rules[i];
			const ruleNumber = i + 1; // Rule numbers start from 1 for users (based on position in settings)
			
			if (rule.enabled) {
				// Skip script rules if security warning not accepted
				if (rule.type === 'script' && !this.settings.scriptSecurityWarningAccepted) {
					continue;
				}
				this.rules.push(
					new ReplaceRule(rule.pattern, rule.replacer, rule.type === 'script' ? rule.script : null, ruleNumber)
				)
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Execute a specific rule on all matches in the source
	private async executeRule(rule: ReplaceRule, source: string, ruleNumber: number): Promise<string> {
		// Reset the regex lastIndex to ensure we start from the beginning
		rule.pattern.lastIndex = 0;
		
		// Check if there are any matches
		const hasMatch = rule.pattern.test(source);
		rule.pattern.lastIndex = 0; // Reset again after test
		
		if (!hasMatch) {
			return source;
		}

		console.log(`Rule #${ruleNumber} triggered`);

		if (rule.script) {
			// This should never happen (script rules are filtered in compileRules), but check just in case
			if (!this.settings.scriptSecurityWarningAccepted) {
				console.error('BUG: Script rule executed without security acceptance. Please report this to the plugin developers.');
				new Notice('⚠️ Security error detected. Script execution blocked. Please report this bug to the plugin developers.', NOTICE_DURATION_LONG);
				return source; // Return unchanged
			}
			// If a script is defined, execute it for all matches
			return await rule.executeScriptForAllMatches(source, this.settings.debugMode, this.app, ruleNumber);
		} else {
			// Otherwise, use the default replacer for all matches
			const result = source.replace(rule.pattern, rule.replacer);
			if (this.settings.debugMode) {
				console.log(`Rule #${ruleNumber} - Matched regex: ${rule.pattern}`);
				console.log(`Rule #${ruleNumber} - Result: '${result}'`);
			}
			return result;
		}
	}

	public async applyRules(source: string | null | undefined) : Promise<{changed: boolean, result: string}> {
		if (source === undefined || source === null){
			return {changed: false, result: ""};
		}

		let result = source;
		let changed = false;
		const triggeredRuleNumbers: number[] = [];

		// Apply all rules sequentially
		for (const rule of this.rules) {
			try {
				const beforeRule = result;
				result = await this.executeRule(rule, result, rule.ruleNumber);
				
				// Check if this rule changed the text
				if (result !== beforeRule) {
					changed = true;
					triggeredRuleNumbers.push(rule.ruleNumber);
				}
			} catch (error) {
				// Show error notification in Obsidian
				console.error(`Error applying rule #${rule.ruleNumber}:`, error);
				const errorMessage = error instanceof Error ? error.message : String(error);
				new Notice(`Rule #${rule.ruleNumber} execution error: ${errorMessage}`, NOTICE_DURATION_NORMAL);
				// Continue with the next rule, keeping the text unchanged
			}
		}

	// Show notification with all triggered rules if enabled
	if (changed && this.settings.showRuleNotifications && triggeredRuleNumbers.length > 0) {
		const rulesList = triggeredRuleNumbers.join(', ');
		const message = triggeredRuleNumbers.length === 1 
			? `Rule #${rulesList} triggered`
			: `Rules #${rulesList} triggered`;
		new Notice(message, NOTICE_DURATION_SHORT);
	}

		// Log all triggered rules
		if (triggeredRuleNumbers.length > 0) {
			console.log(`Triggered rules: #${triggeredRuleNumbers.join(', #')}`);
		}

		return {changed, result};
	}
}

class PasteTransformSettingsTab extends PluginSettingTab {
	plugin: PasteTransform;

	constructor(app: App, plugin: PasteTransform) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// Show security warning and ask user to accept risks
	async showSecurityWarningAndAccept(): Promise<boolean> {
		const confirmed = confirm(
			'🚨🚨🚨 SECURITY WARNING 🚨🚨🚨\n\n' +
			'⚠️  DANGER! Script rules execute JavaScript code with FULL access to your system!\n\n' +
			'❌ Malicious scripts can:\n' +
			'   • Access ALL your files and notes\n' +
			'   • Send data to external servers\n' +
			'   • Execute ANY code on your computer\n' +
			'   • Steal passwords and sensitive information\n' +
			'   • Delete or modify your data\n\n' +
			'✋ ONLY enable script rules from sources you COMPLETELY trust!\n\n' +
			'❓ Do you understand and accept these risks?\n\n' +
			'Click OK ONLY if you:\n' +
			'  ✓ Wrote the script yourself, OR\n' +
			'  ✓ Fully reviewed and understand the code, OR\n' +
			'  ✓ Trust the source completely'
		);
		
		if (confirmed) {
			this.plugin.settings.scriptSecurityWarningAccepted = true;
			await this.plugin.saveSettings();
			this.plugin.compileRules(); // Recompile to include script rules
			// Don't call this.display() here - let the caller handle UI updates
			return true;
		}
		return false;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		this.renderSecurityToggle(containerEl);
		this.renderDebugToggle(containerEl);
		this.renderNotificationsToggle(containerEl);
		this.renderTestSection(containerEl);
		this.renderRulesSection(containerEl);
	}

	private renderSecurityToggle(containerEl: HTMLElement): void {
		// Script security setting - always show, but toggle reflects current state
		new Setting(containerEl)
			.setName("Script rules enabled")
			.setDesc("Enable or disable execution of JavaScript code in script rules. This affects security.")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.scriptSecurityWarningAccepted);
				toggle.onChange(async (value) => {
					if (value) {
						// User wants to enable script rules - show security warning
						const accepted = await this.showSecurityWarningAndAccept();
						if (!accepted) {
							toggle.setValue(false);
							return;
						}
						// Security accepted, setting is already saved in showSecurityWarningAndAccept
						this.plugin.compileRules(); // Recompile to include script rules
						this.display(); // Refresh UI to show updated toggle state
					} else {
						// User wants to disable script rules
						const confirmed = confirm(
							'Are you sure you want to disable script rules?\n\n' +
							'All script rules will stop working until you enable this setting again.'
						);
						if (confirmed) {
							this.plugin.settings.scriptSecurityWarningAccepted = false;
							
							// Also disable all script rules to prevent them from auto-enabling on next load
							for (let rule of this.plugin.settings.rules) {
								if (rule.type === 'script' && rule.enabled) {
									rule.enabled = false;
								}
							}
							
							await this.plugin.saveSettings();
							this.plugin.compileRules(); // Recompile to exclude script rules immediately
							this.display(); // Refresh UI to show disabled rules
						} else {
							toggle.setValue(true);
						}
				}
			});
		});
	}

	private renderDebugToggle(containerEl: HTMLElement): void {
		// Debug mode toggle
		new Setting(containerEl)
			.setName("Debug Mode")
			.setDesc("Enable to see detailed logs in the developer console")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.debugMode);
				toggle.onChange(async (value) => {
			this.plugin.settings.debugMode = value;
			await this.plugin.saveSettings();
		});
	});
	}

	private renderNotificationsToggle(containerEl: HTMLElement): void {
		// Show rule notifications toggle
		new Setting(containerEl)
			.setName("Show Rule Notifications")
			.setDesc("Show notifications when rules are triggered")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.showRuleNotifications);
				toggle.onChange(async (value) => {
			this.plugin.settings.showRuleNotifications = value;
			await this.plugin.saveSettings();
		});
	});
	}

	private renderTestSection(containerEl: HTMLElement): void {
		// Try rules section
		let trySource: TextAreaComponent | null = null;
		let tryDest: TextAreaComponent | null = null;
		
		const handleChanges = async () => {
			try {
				const {result} = await this.plugin.applyRules(trySource?.getValue() || "");
				tryDest?.setValue(result);
			} catch (e) {
				tryDest?.setValue("ERROR:\n" + e);
			}
		};
		
		new Setting(containerEl)
			.setName("Test Rules")
			.setDesc("Test your rules with sample text")
			.addTextArea(ta => {
				trySource = ta;
				ta.setPlaceholder("Enter sample text to test your rules");
				ta.inputEl.classList.add('test-textarea');
				ta.onChange(async () => {
					await handleChanges();
				});
			});
			
		new Setting(containerEl)
			.setName("Test Result")
			.setDesc("The result after applying rules to the sample text")
			.addTextArea(ta => {
				tryDest = ta;
				ta.setPlaceholder("Transformed result will appear here");
			ta.inputEl.classList.add('test-textarea');
			ta.setDisabled(true);
		});
	}

	private renderRulesSection(containerEl: HTMLElement): void {
		// Create a top-level container for our plugin to prevent CSS conflicts
		const topLevelContainer = containerEl.createDiv({cls: 'paste-code-transform'});

		const rulesContainer = topLevelContainer.createDiv({cls: 'rules-container'});
		
		const renderRule = (rule: Rule, index: number) => {
			const ruleContainer = rulesContainer.createDiv({cls: 'rule-container'});
			
			// Check if this is a script rule and security warning is not accepted
			const isScriptRuleLocked = rule.type === 'script' && !this.plugin.settings.scriptSecurityWarningAccepted;

			// Header row with rule number, type toggle and delete button
			const headerRow = ruleContainer.createDiv({cls: 'rule-header'});
			
		// Rule number
		const ruleNumber = index + 1;
		const ruleNumberEl = headerRow.createEl('span', {text: `Rule #${ruleNumber}`, cls: 'rule-number'});
			
			// Type toggle
			const typeDropdownContainer = headerRow.createDiv({cls: 'type-dropdown-container'});
			const typeDropdown = new DropdownComponent(typeDropdownContainer);
			typeDropdown.addOption('replace', 'Regex Replacer');
			typeDropdown.addOption('script', 'Script Replacer');
			typeDropdown.setValue(rule.type);
			typeDropdown.onChange(async (value) => {
				// Show security warning if switching to 'script' type
				if (value === 'script' && !this.plugin.settings.scriptSecurityWarningAccepted) {
					const accepted = await this.showSecurityWarningAndAccept();
					if (!accepted) {
						typeDropdown.setValue(rule.type); // Reset to original value
						return;
					}
				}
				
				this.plugin.settings.rules[index].type = value as RuleType;
				await this.plugin.saveSettings();
				this.plugin.compileRules();
				// Re-render to show/hide script textarea
				this.display();
			});
			
			// Disable dropdown for locked script rules
			if (isScriptRuleLocked) {
				typeDropdown.setDisabled(true);
			}
			
			// Delete button
			const deleteButtonContainer = headerRow.createDiv({cls: 'delete-button-container'});
			const deleteButton = new ButtonComponent(deleteButtonContainer);
			deleteButton.setIcon('trash');
			deleteButton.setTooltip('Delete rule');
			deleteButton.onClick(async () => {
				this.plugin.settings.rules.splice(index, 1);
				await this.plugin.saveSettings();
				this.plugin.compileRules();
				this.display(); // Re-render the settings tab
			});
			
		// Enabled toggle
		const enabledToggle = new Setting(ruleContainer);
		enabledToggle.setName("Rule enabled");
		// Hide the separator line in this Setting
		enabledToggle.settingEl.classList.add('setting-no-border');
		
		// Add info message for locked script rules
		if (isScriptRuleLocked) {
			const lockWarning = enabledToggle.descEl.createDiv({cls: 'script-rule-locked-warning'});
			lockWarning.createEl('span', {text: 'ℹ️ This is a script rule. '});
			lockWarning.createEl('span', {text: 'Try to enable it to learn about security considerations. You can also delete it if not needed.'});
		}
			
			enabledToggle.addToggle(toggle => {
				toggle.setValue(rule.enabled);
				toggle.onChange(async (value) => {
					// Show security warning if enabling script rule
					if (value && rule.type === 'script' && !this.plugin.settings.scriptSecurityWarningAccepted) {
						const accepted = await this.showSecurityWarningAndAccept();
						if (!accepted) {
							toggle.setValue(false);
							return;
						}
						// Security accepted - continue to enable the rule and save
						this.plugin.settings.rules[index].enabled = value;
						await this.plugin.saveSettings();
						this.plugin.compileRules();
						this.display(); // Refresh UI to show updated toggle state
						return; // Exit early since display() will re-render everything
					}
					
					this.plugin.settings.rules[index].enabled = value;
					await this.plugin.saveSettings();
					this.plugin.compileRules();
				});
				
				// Note: Don't disable toggle for locked script rules - let user click to see security warning
			});
			
		// Pattern input (single line)
		const patternContainer = ruleContainer.createDiv({cls: 'pattern-container'});
		patternContainer.createEl('label', {text: 'Match regex'});
		const patternInput = new TextComponent(patternContainer);
		patternInput.setValue(rule.pattern);
		patternInput.setPlaceholder("Enter regex pattern");
		patternInput.inputEl.classList.add('text-input-full');
		patternInput.onChange(async (value) => {
			this.plugin.settings.rules[index].pattern = value;
			await this.plugin.saveSettings();
			this.plugin.compileRules();
		});
			
			// Disable pattern input for locked script rules
			if (isScriptRuleLocked) {
				patternInput.setDisabled(true);
			}
			
		// Replacer input (single line if type is 'replace')
		if (rule.type === 'replace') {
			const replacerContainer = ruleContainer.createDiv({cls: 'replacer-container'});
			replacerContainer.createEl('label', {text: 'Replacer'});
			const replacerInput = new TextComponent(replacerContainer);
			replacerInput.setValue(rule.replacer);
			replacerInput.setPlaceholder("Enter replacement string");
			replacerInput.inputEl.classList.add('text-input-full');
			replacerInput.onChange(async (value) => {
				this.plugin.settings.rules[index].replacer = value;
				await this.plugin.saveSettings();
				this.plugin.compileRules();
			});
		}
			
		// Script textarea (multi-line if type is 'script')
		if (rule.type === 'script') {
			const scriptContainer = ruleContainer.createDiv({cls: 'script-container'});
			scriptContainer.createEl('label', {text: 'Script'});
			const scriptInput = new TextAreaComponent(scriptContainer);
			scriptInput.setValue(rule.script);
			scriptInput.setPlaceholder("// Enter JavaScript code here\n// You can use async/await directly\nconst response = await fetch('https://httpbin.org/get');\nconst data = await response.json();\nreturn data.url;");
			scriptInput.inputEl.classList.add('script-textarea');
			scriptInput.onChange(async (value) => {
				this.plugin.settings.rules[index].script = value;
				await this.plugin.saveSettings();
				this.plugin.compileRules();
			});
			
			// Disable script textarea for locked script rules
			if (isScriptRuleLocked) {
				scriptInput.setDisabled(true);
			}
		}
		};
		
		// Render all rules
		this.plugin.settings.rules.forEach((rule, index) => {
			renderRule(rule, index);
		});

		// Add rule button
		const addButtonContainer = rulesContainer.createDiv({cls: 'add-button-container'});
		const addButton = new ButtonComponent(addButtonContainer);
		addButton.setButtonText("Add new rule");
		addButton.setCta();
		addButton.onClick(async () => {
			this.plugin.settings.rules.push({
				pattern: "",
				type: 'replace',
				replacer: "",
				script: "",
				enabled: true
			});
			await this.plugin.saveSettings();
			this.plugin.compileRules();
			this.display(); // Re-render the settings tab
		});
	}
}
