"use strict";

const fs = require("fs");
const path = require("path");
const { STRATEGIES, GROUP_TITLES, GROUP_ORDER, toMarkdownDescription } = require("../src/strategies");
const {
	CODE_VIRTUALIZATION_LABELS,
	CODE_VIRTUALIZATION_MODES,
	CONTEXT_MENU_TITLE,
	DEMO_MESSAGE,
	LUA_EXTENSIONS,
	RENAME_STYLES,
	TARGET_HELP,
	TARGET_LABELS,
	TARGETS,
	URLS,
} = require("../src/constants");

function strategyPropertiesForGroup(group) {
	const properties = {};
	for (const strategy of STRATEGIES) {
		if (strategy.group !== group) {
			continue;
		}
		properties[`luaVirtualizer.${strategy.configKey}`] = {
			type: "boolean",
			default: strategy.default,
			markdownDescription: toMarkdownDescription(strategy),
		};
	}
	return properties;
}

const luaExtPattern = LUA_EXTENSIONS
	.map((ext) => ext.replace(".", ""))
	.join("|");
const whenLuaResource = `resourceLangId == lua || resourceExtname =~ /\\\\.(${luaExtPattern})$/i`;
const whenLuaEditor = `editorLangId == lua || resourceExtname =~ /\\\\.(${luaExtPattern})$/i`;

const strategySections = GROUP_ORDER.map((group) => ({
	title: GROUP_TITLES[group],
	properties: strategyPropertiesForGroup(group),
}));

const pkg = {
	name: "lua-virtualizer",
	displayName: "Lua Virtualizer",
	publisher: "PELock",
	description: "Virtualize, obfuscate & protect Lua scripts with code virtualization, finite-state machine (FSM) transforms, weave tape, self-integrity checks, and anti-debugging.",
	version: "1.0.0",
	icon: "images/icon-lua-virtualizer-128.png",
	license: "Apache-2.0",
	homepage: URLS.product,
	bugs: {
		url: URLS.contact,
		email: "support@pelock.com",
	},
	repository: {
		type: "git",
		url: "https://github.com/PELock/Lua-Virtualizer-VSCode-Extension",
	},
	engines: {
		vscode: "^1.85.0",
	},
	categories: [
		"Programming Languages",
		"Other",
	],
	keywords: [
		"lua",
		"luau",
		"wlua",
		"obfuscator",
		"obfuscation",
		"obfuscate",
		"virtualization",
		"virtualizer",
		"vm",
		"fsm",
		"weave",
		"anti-debug",
		"self-defending",
		"protection",
		"script",
		"pelock",
	],
	activationEvents: [
		"onLanguage:lua",
	],
	main: "./src/extension.js",
	capabilities: {
		untrustedWorkspaces: {
			supported: true,
			restrictedConfigurations: [
				"luaVirtualizer.apiKey",
			],
		},
		virtualWorkspaces: {
			supported: true,
		},
	},
	contributes: {
		configuration: [
			{
				title: "Lua Virtualizer",
				properties: {
					"luaVirtualizer.apiKey": {
						type: "string",
						default: "",
						maxLength: 32,
						order: 1,
						markdownDescription: `Enter your [activation code](${URLS.buy}) (API key). Leave empty to run in **Demo mode** — ${DEMO_MESSAGE.charAt(0).toLowerCase()}${DEMO_MESSAGE.slice(1)}`,
					},
					"luaVirtualizer.enableCompression": {
						type: "boolean",
						default: true,
						order: 2,
						markdownDescription: "Compress source code before sending it to the Web API (recommended for large scripts). Both the request and the virtualized response are compressed.",
					},
					"luaVirtualizer.seed": {
						type: "number",
						default: 0,
						minimum: 0,
						order: 3,
						markdownDescription: "Optional fixed random seed for reproducible virtualization. `0` leaves the seed unset (a new seed each run).",
					},
					"luaVirtualizer.randomizationDensity": {
						type: "number",
						default: 100,
						minimum: 0,
						maximum: 100,
						order: 4,
						markdownDescription: "Randomization density / intensity (`0`–`100`). Higher values apply more of each probabilistic transform.",
					},
					"luaVirtualizer.target": {
						type: "string",
						enum: [...TARGETS],
						enumDescriptions: [...TARGET_LABELS],
						default: "auto",
						order: 5,
						markdownDescription: `**Dialect**\n\n${TARGET_HELP}`,
					},
					"luaVirtualizer.codeVirtualizationEnabled": {
						type: "boolean",
						default: true,
						order: 6,
						markdownDescription: "**Code virtualization**\n\nEnable the selected virtualization mode. Uncheck to emit ordinary Lua while keeping the last mode saved.",
					},
					"luaVirtualizer.codeVirtualization": {
						type: "string",
						enum: [...CODE_VIRTUALIZATION_MODES],
						enumDescriptions: [...CODE_VIRTUALIZATION_LABELS],
						default: "vm",
						order: 7,
						markdownDescription: "Virtualization mode applied when **Code virtualization** is enabled: `vm`, `fsm`, `weave`, `flat`, or `rnd`. `rnd` picks VM, FSM, or WEAVE for that run. FLAT is not in the draw.",
					},
					"luaVirtualizer.renameStyle": {
						type: "string",
						enum: [...RENAME_STYLES],
						enumDescriptions: [
							"Identifier-like (e.g. Il1Il1)",
							"O/0 confusion (e.g. O0oO0)",
							"Hexadecimal (e.g. x4f2a1)",
							"Mangled (e.g. a, b, aa)",
						],
						default: "il",
						order: 8,
						markdownDescription: "Rename style used by the rename strategies: `il` (Il1…), `o0` (O0o…), `hex`, or `mangled`.",
					},
				},
			},
			...strategySections,
		],
		commands: [
			{
				command: "lua-virtualizer.virtualize",
				title: "Virtualize",
				category: "Lua Virtualizer",
				enablement: whenLuaEditor,
			},
			{
				command: "lua-virtualizer.virtualizeContext",
				title: CONTEXT_MENU_TITLE,
			},
			{
				command: "lua-virtualizer.virtualizeFunction",
				title: "Virtualize Function",
				category: "Lua Virtualizer",
			},
		],
		menus: {
			commandPalette: [
				{
					command: "lua-virtualizer.virtualize",
					when: whenLuaEditor,
				},
				{
					command: "lua-virtualizer.virtualizeContext",
					when: "false",
				},
				{
					command: "lua-virtualizer.virtualizeFunction",
					when: "false",
				},
			],
			"editor/context": [
				{
					command: "lua-virtualizer.virtualizeContext",
					when: `(${whenLuaEditor}) && editorTextFocus`,
					group: "luaVirtualizer@1",
				},
			],
			"explorer/context": [
				{
					command: "lua-virtualizer.virtualizeContext",
					when: whenLuaResource,
					group: "luaVirtualizer@1",
				},
			],
			"editor/title/context": [
				{
					command: "lua-virtualizer.virtualizeContext",
					when: whenLuaResource,
					group: "luaVirtualizer@1",
				},
			],
		},
		keybindings: [
			{
				command: "lua-virtualizer.virtualize",
				key: "ctrl+alt+o",
				mac: "cmd+alt+o",
				when: `(${whenLuaEditor}) && editorTextFocus`,
			},
		],
		grammars: [
			{
				scopeName: "source.lua.luavirtualizer",
				path: "./syntaxes/lua-virtualizer.tmLanguage.json",
				injectTo: ["source.lua"],
			},
		],
	},
	scripts: {
		"generate:package": "node scripts/generate-package-json.js",
		lint: "eslint src test scripts",
		"test:unit": "mocha --ui tdd --timeout 10000 \"test/unit/**/*.test.js\"",
		test: "node ./test/runTest.js",
	},
	devDependencies: {
		"@types/mocha": "^10.0.10",
		"@types/node": "^20.14.10",
		"@types/vscode": "^1.85.0",
		"@vscode/test-electron": "^2.4.1",
		eslint: "^8.57.0",
		mocha: "^10.8.2",
	},
};

fs.writeFileSync(
	path.join(__dirname, "..", "package.json"),
	`${JSON.stringify(pkg, null, "\t")}\n`,
	"utf8"
);

console.log(`Wrote package.json with ${STRATEGIES.length} virtualization strategies.`);
