import {App, Plugin, PluginSettingTab, Setting, TextAreaComponent} from 'obsidian';

interface PasteTransformSettings {
	patterns: string[],
	replacers: string[],
	settingsFormatVersion: number,
	debugMode: boolean,
}

const DEFAULT_SETTINGS: PasteTransformSettings = {
	patterns: [
		"^https://github.com/[^/]+/([^/]+)/issues/(\\d+)$",
		"^https://github.com/[^/]+/([^/]+)/pull/(\\d+)$",
		"^https://github.com/[^/]+/([^/]+)$",
		"^https://\\w+.wikipedia.org/wiki/([^\\s]+)$",
	],
	replacers: [
		"[🐈‍⬛🔨 $1#$2]($&)",
		"[🐈‍⬛🛠︎ $1#$2]($&)",
		"[🐈‍⬛ $1]($&)",
		"[📖 $1]($&)",
	],
	settingsFormatVersion: 1,
	debugMode: false,
}

class ReplaceRule {
	pattern: RegExp;
	replacer: string;

	constructor(pattern: string, replacer: string) {
		this.pattern = new RegExp(pattern, 'gm');
		this.replacer = replacer;
	}
}

export default class PasteTransform extends Plugin {
	settings: PasteTransformSettings;
	rules: ReplaceRule[];

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new PasteTransformSettingsTab(this.app, this));

		this.registerEvent(this.app.workspace.on("editor-paste", event => this.onPaste(event)));
	}

	onPaste(event: ClipboardEvent){
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

		let result = this.applyRules(plainText);
		if (this.settings.debugMode) {
			console.log(`Replaced '${plainText}' -> '${result}'`);
		}

		if (result != plainText) {
			this.app.workspace.activeEditor?.editor?.replaceSelection(result);
			event.preventDefault()
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.compileRules();
	}

	compileRules()  {
		this.rules = [];
		let minIndex = this.settings.patterns.length;
		if (this.settings.replacers.length < minIndex){
			minIndex = this.settings.replacers.length;
		}
		for (let i = 0; i < minIndex; i++){
			this.rules.push(
				new ReplaceRule(this.settings.patterns[i], this.settings.replacers[i])
			)
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	public applyRules(source: string | null | undefined) : string {
		if (source === undefined || source === null){
			return ""
		}

		let result = source;

		for (let rule of this.rules){
			if (source.search(rule.pattern) != -1) {
				result = source.replace(rule.pattern, rule.replacer);
				break
			}
		}

		return result;
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

		let patternsTa: TextAreaComponent | null = null;
		let replacersTa: TextAreaComponent | null = null;
		let trySource: TextAreaComponent | null = null;
		let tryDest: TextAreaComponent | null = null;

		let plugin = this.plugin;
		let handleChanges = function (){
			try {
				tryDest?.setValue(plugin.applyRules(trySource?.getValue()))
			} catch (e) {
				tryDest?.setValue("ERROR:\n" + e)
			}
		}

		let handleTextChange = async function (value: string, setAttr: (values: string[]) => any ){
			let values = value.split("\n");
			if (values.length > 0 && values.last() == "") {
				values.pop()
			}

			setAttr(values)

			try {
				plugin.compileRules();
				handleChanges()
				await plugin.saveSettings();
			} catch (e){
				tryDest?.setValue("ERROR:\n" + e)
			}
		}

		new Setting(containerEl)
			.setName("Transform rules")
			.setDesc("Type regexp patterns in left box and replace rules in right box." +
				"Every pattern and rule on a line." +
				"Pattern and rules use matched by line numbers." +
				"Regexp and replace rules use typescript rules."
			)
			.addTextArea(ta =>
				{
					patternsTa = ta;
					patternsTa.setPlaceholder("patter 1\npattern 2\n")

					let patternsString = "";
					for (let val of this.plugin.settings.patterns){
						patternsString += val + "\n"
					}
					patternsTa.setValue(patternsString)
					patternsTa.onChange(async value=> {
						await handleTextChange(value, values => {
							plugin.settings.patterns = values;
						});
					})
				}
			)
			.addTextArea(ta=>{
				replacersTa = ta;
				replacersTa.setPlaceholder("replacer 1\nreplacer 2\n")
				let replacersString = "";
				for (let val of this.plugin.settings.replacers){
					replacersString += val + "\n"
				}
				replacersTa.setValue(replacersString)
				replacersTa.onChange(async value=> {
					await handleTextChange(value, values => {
						plugin.settings.replacers = values;
					});
				})
			})
		;

		new Setting(containerEl)
			.setName("Try rules")
			.setDesc("Write original text here")
			.addTextArea(ta=> {
				trySource = ta;
				ta.setPlaceholder("Sample text")
				ta.onChange(_=> {
					handleChanges()
				})
			});
		new Setting(containerEl)
			.setName("Result")
			.setDesc("The result of rules apply to original text")
			.addTextArea(ta => {
				tryDest = ta;
				ta.setPlaceholder("Transform result")
				ta.setDisabled(true);
			});

		new Setting(containerEl)
			.setName("Debug mode")
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.debugMode);
				toggle.onChange(async value => {
					this.plugin.settings.debugMode = value
					await this.plugin.saveSettings();
				})
			})
	}
}
