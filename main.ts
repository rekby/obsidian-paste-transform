import {App, Plugin, PluginSettingTab, Setting, TextAreaComponent, DropdownComponent, ButtonComponent, TextComponent} from 'obsidian';

// Define the type of rule
type RuleType = 'replace' | 'script';

// Define the structure of a rule
interface Rule {
	pattern: string;
	type: RuleType;
	replacer: string; // Used when type is 'replace'
	script: string;   // Used when type is 'script'
}


interface PasteTransformSettingsV2 {
	rules: Rule[],
	settingsFormatVersion: number,
	debugMode: boolean,
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
			pattern: "^https://github.com/([^/]+)/([^/]+)/issues/(\\d+)$",
			type: 'script',
			replacer: "",
			script: "" +
				"const url=`https://api.github.com/repos/${match[1]}/${match[2]}/issues/${match[3]}`\n" +
				"const response = await fetch(url);\n" +
				"const data = await response.json();\n" +
				"const title = data.title;\n" +
				"return `[${match[2]}#${match[3]}: ${title}](${match[0]})`;"
		},
		{
			pattern: "^https://github.com/[^/]+/([^/]+)/pull/(\\d+)$",
			type: 'replace',
			replacer: "[🐈‍⬛🛠︎ $1#$2]($&)",
			script: ""
		},
		{
			pattern: "^https://github.com/[^/]+/([^/]+)$",
			type: 'replace',
			replacer: "[🐈‍⬛ $1]($&)",
			script: ""
		},
		{
			pattern: "^https://\\w+.wikipedia.org/wiki/([^\\s]+)$",
			type: 'replace',
			replacer: "[📖 $1]($&)",
			script: ""
		}
	],
	settingsFormatVersion: 2,
	debugMode: false,
}

class ReplaceRule {
	pattern: RegExp;
	replacer: string;
	script: string | null;

	constructor(pattern: string, replacer: string, script: string | null = null) {
		this.pattern = new RegExp(pattern); // Remove 'g' flag
		this.replacer = replacer;
		this.script = script;
	}

	async executeScript(match: RegExpMatchArray, debugMode: boolean): Promise<string> {
		if (this.script) {
			try {
				const startTime = Date.now();
				// Create an async function that wraps the user's script
				const asyncScript = `
					(async (match) => {
						${this.script}
					})(match)
				`;
				// Execute the script and return the result
				const result = await eval(asyncScript);
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

		// Synchronously find a matching rule
		const matchingRule = this.findMatchingRule(plainText);
		
		// If a rule matches, prevent default and execute the rule
		if (matchingRule) {
			event.preventDefault();
			
			// Execute only the matching rule
			const result = await this.executeRule(matchingRule, plainText);
			
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
					script: ''
				});
			}
			
			// Create new settings object with converted data
			this.settings = {
				rules: newRules,
				settingsFormatVersion: 2, // Update to new format version
				debugMode: oldSettings.debugMode || false
			};
		} else {
			// Use default settings merged with loaded data (new format)
			this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		}
		
		this.compileRules();
	}

	compileRules()  {
		this.rules = [];
		for (let rule of this.settings.rules) {
			this.rules.push(
				new ReplaceRule(rule.pattern, rule.replacer, rule.type === 'script' ? rule.script : null)
			)
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Synchronously find the first matching rule without executing it
	private findMatchingRule(source: string): ReplaceRule | null {
		if (source === undefined || source === null) {
			return null;
		}

		for (let rule of this.rules) {
			const match = source.match(rule.pattern);
			if (match) {
				return rule;
			}
		}
		
		return null;
	}

	// Execute a specific rule
	private async executeRule(rule: ReplaceRule, source: string): Promise<string> {
		const match = source.match(rule.pattern);
		if (!match) {
			return source;
		}

		if (rule.script) {
			// If a script is defined, execute it
			return await rule.executeScript(match, this.settings.debugMode);
		} else {
			// Otherwise, use the default replacer
			const result = source.replace(rule.pattern, rule.replacer);
			if (this.settings.debugMode) {
				console.log(`Matched regex: ${rule.pattern}`);
				console.log(`Result: '${result}'`);
			}
			return result;
		}
	}

	public async applyRules(source: string | null | undefined) : Promise<string> {
		if (source === undefined || source === null){
			return ""
		}

		const matchingRule = this.findMatchingRule(source);

		if (matchingRule){
			return await this.executeRule(matchingRule, source);
		} else {
			return source;
		}
	}
}

class PasteTransformSettingsTab extends PluginSettingTab {
	plugin: PasteTransform;

	constructor(app: App, plugin: PasteTransform) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Create a top-level container for our plugin to prevent CSS conflicts
		const topLevelContainer = containerEl.createDiv({cls: 'paste-code-transform'});

		const rulesContainer = topLevelContainer.createDiv({cls: 'rules-container'});
		
		const renderRule = (rule: Rule, index: number) => {
			const ruleContainer = rulesContainer.createDiv({cls: 'rule-container'});

			// Header row with type toggle and delete button
			const headerRow = ruleContainer.createDiv({cls: 'rule-header'});
			
			// Type toggle
			const typeDropdownContainer = headerRow.createDiv({cls: 'type-dropdown-container'});
			const typeDropdown = new DropdownComponent(typeDropdownContainer);
			typeDropdown.addOption('replace', 'Regex Replacer');
			typeDropdown.addOption('script', 'Script Replacer');
			typeDropdown.setValue(rule.type);
			typeDropdown.onChange(async (value) => {
				this.plugin.settings.rules[index].type = value as RuleType;
				await this.plugin.saveSettings();
				this.plugin.compileRules();
				// Re-render to show/hide script textarea
				this.display();
			});
			
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
			
			// Pattern input (single line)
			const patternContainer = ruleContainer.createDiv({cls: 'pattern-container'});
			patternContainer.createEl('label', {text: 'Match regex'});
			const patternInput = new TextComponent(patternContainer);
			patternInput.setValue(rule.pattern);
			patternInput.setPlaceholder("Enter regex pattern");
			patternInput.inputEl.style.width = '100%';
			patternInput.onChange(async (value) => {
				this.plugin.settings.rules[index].pattern = value;
				await this.plugin.saveSettings();
				this.plugin.compileRules();
			});
			
			// Replacer input (single line if type is 'replace')
			if (rule.type === 'replace') {
				const replacerContainer = ruleContainer.createDiv({cls: 'replacer-container'});
				replacerContainer.createEl('label', {text: 'Replacer'});
				const replacerInput = new TextComponent(replacerContainer);
				replacerInput.setValue(rule.replacer);
				replacerInput.setPlaceholder("Enter replacement string");
				replacerInput.inputEl.style.width = '100%';
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
				scriptInput.inputEl.style.width = '100%';
				scriptInput.inputEl.style.minHeight = '100px';
				scriptInput.inputEl.style.fontFamily = "monospace";
				scriptInput.onChange(async (value) => {
					this.plugin.settings.rules[index].script = value;
					await this.plugin.saveSettings();
					this.plugin.compileRules();
				});
			}
		};
		
		// Render all rules
		this.plugin.settings.rules.forEach((rule, index) => {
			renderRule(rule, index);
		});

		// Add horizontal separator before the add button
		rulesContainer.createEl('hr', {cls: 'rule-separator'});
		
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
				script: ""
			});
			await this.plugin.saveSettings();
			this.plugin.compileRules();
			this.display(); // Re-render the settings tab
		});
		
		// Try rules section
		let trySource: TextAreaComponent | null = null;
		let tryDest: TextAreaComponent | null = null;
		
		const handleChanges = async () => {
			try {
				const result = await this.plugin.applyRules(trySource?.getValue() || "");
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
				ta.inputEl.style.width = '100%';
				ta.inputEl.style.minHeight = '80px';
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
				ta.inputEl.style.width = '100%';
				ta.inputEl.style.minHeight = '80px';
				ta.setDisabled(true);
			});
			
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
}
