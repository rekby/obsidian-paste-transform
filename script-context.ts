/**
 * Context object passed to script rules as `ctx`.
 *
 * Every script rule receives a single `ctx` argument of this type.
 * Use it to access the matched text, capture groups, selected editor text,
 * and the debug flag.
 *
 * See README for usage examples:
 * https://github.com/rekby/obsidian-paste-transform#javascript-execution-rules
 */
export class ScriptContext {
	/** Full match object with capture groups (result of `string.match(regexp)`). */
	match: RegExpMatchArray;

	/** `true` when debug mode is enabled in plugin settings. Useful for conditional logging. */
	debug: boolean;

	/** Text currently selected in the editor at the time of paste. Empty string if nothing is selected. */
	selectedText: string;

	constructor(match: RegExpMatchArray, debug: boolean, selectedText: string) {
		this.match = match;
		this.debug = debug;
		this.selectedText = selectedText;
	}

	/** The matched substring — a shorthand for `ctx.match[0]`. */
	get foundText(): string {
		return this.match[0];
	}
}
