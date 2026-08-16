// Regression test for https://github.com/rekby/obsidian-paste-transform/issues/21
//
// Symptom: the plugin works when text is copied from a plain-text source
// (notepad.exe on Windows, TextEdit in plain mode on macOS), but does nothing
// when the same text is copied from Obsidian itself, from a browser, or from
// most other rich-text capable applications.
//
// Reason: onPaste() bailed out unless the clipboard carried exactly one type and
// that type was "text/plain". Real applications put several representations into
// the clipboard at once (text/plain + text/html, plus vendor-specific types),
// so the rules were never applied.

jest.mock('obsidian', () => jest.requireActual('../__mocks__/obsidian'));

import PasteTransform from '../main';

interface FakePasteEvent {
	defaultPrevented: boolean;
	preventDefault: jest.Mock;
	clipboardData: {
		types: string[];
		getData: (type: string) => string;
	};
}

function makePasteEvent(types: string[], data: Record<string, string>): FakePasteEvent {
	const event: FakePasteEvent = {
		defaultPrevented: false,
		preventDefault: jest.fn(() => {
			event.defaultPrevented = true;
		}),
		clipboardData: {
			types,
			getData: (type: string) => data[type] ?? '',
		},
	};
	return event;
}

describe('onPaste with clipboard data from real applications (issue #21)', () => {
	let plugin: PasteTransform;
	let replaceSelection: jest.Mock;

	beforeEach(async () => {
		const replaceSelectionMock = jest.fn();
		const mockApp: any = {
			workspace: {
				activeEditor: {
					editor: {
						replaceSelection: replaceSelectionMock,
						getSelection: () => '',
					},
				},
			},
		};
		const mockManifest: any = {
			id: 'paste-code-transform',
			name: 'Paste Transform',
			version: '1.0.1',
			minAppVersion: '1.1.8',
			description: 'Handle pasted text and transform it by regexp rules.',
			author: 'Timofey Koolin',
			authorUrl: 'https://github.com/rekby',
			isDesktopOnly: false,
		};

		plugin = new PasteTransform(mockApp, mockManifest);
		replaceSelection = replaceSelectionMock;

		await plugin.loadSettings();
		plugin.settings.rules = [
			{
				pattern: '^https://github\\.com/([^/]+)/([^/]+)$',
				type: 'replace',
				replacer: '[$2]($&)',
				script: '',
				enabled: true,
				name: '',
			},
		];
		plugin.compileRules();
	});

	const url = 'https://github.com/rekby/obsidian-paste-transform';
	const expected = '[obsidian-paste-transform](https://github.com/rekby/obsidian-paste-transform)';

	// The only case that worked before the fix: a pure plain-text clipboard.
	it('transforms text copied from a plain text editor (notepad.exe / TextEdit)', async () => {
		const event = makePasteEvent(['text/plain'], {'text/plain': url});

		await plugin.onPaste(event as unknown as ClipboardEvent);

		expect(event.preventDefault).toHaveBeenCalled();
		expect(replaceSelection).toHaveBeenCalledWith(expected);
	});

	// Everything below reproduced the bug.
	const richClipboards: Array<[string, string[], Record<string, string>]> = [
		[
			'Obsidian editor (macOS, Windows): plain text + html',
			['text/plain', 'text/html'],
			{
				'text/plain': url,
				'text/html': `<a href="${url}">${url}</a>`,
			},
		],
		[
			'browser address bar / page selection: html listed before plain text',
			['text/html', 'text/plain'],
			{
				'text/plain': url,
				'text/html': `<meta charset="utf-8"><a href="${url}">${url}</a>`,
			},
		],
		[
			'macOS applications adding a uri-list flavor',
			['text/plain', 'text/uri-list', 'text/html'],
			{
				'text/plain': url,
				'text/uri-list': url,
				'text/html': `<a href="${url}">${url}</a>`,
			},
		],
		[
			'editor with vendor specific metadata (VS Code style)',
			['text/plain', 'vscode-editor-data'],
			{
				'text/plain': url,
				'vscode-editor-data': '{"version":1,"isFromEmptySelection":false}',
			},
		],
	];

	it.each(richClipboards)('transforms text copied from %s', async (_name, types, data) => {
		const event = makePasteEvent(types, data);

		await plugin.onPaste(event as unknown as ClipboardEvent);

		expect(event.preventDefault).toHaveBeenCalled();
		expect(replaceSelection).toHaveBeenCalledWith(expected);
	});

	// Non-text payloads must still be left to Obsidian.
	it('ignores a clipboard without any text/plain payload (image copy)', async () => {
		const event = makePasteEvent(['Files', 'image/png'], {});

		await plugin.onPaste(event as unknown as ClipboardEvent);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(replaceSelection).not.toHaveBeenCalled();
	});

	it('ignores a file copied from Finder / Explorer even if it carries a text/plain path', async () => {
		const event = makePasteEvent(['Files', 'text/plain'], {
			'text/plain': '/Users/rekby/Pictures/screenshot.png',
		});

		await plugin.onPaste(event as unknown as ClipboardEvent);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(replaceSelection).not.toHaveBeenCalled();
	});

	it('does not touch the paste when no rule matches', async () => {
		const event = makePasteEvent(['text/plain', 'text/html'], {
			'text/plain': 'just some text',
			'text/html': '<p>just some text</p>',
		});

		await plugin.onPaste(event as unknown as ClipboardEvent);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(replaceSelection).not.toHaveBeenCalled();
	});
});
