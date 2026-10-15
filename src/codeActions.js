"use strict";

const vscode = require("vscode");
const { CODE_ACTION_KIND, COMMAND_VIRTUALIZE_FUNCTION, FUNCTION_ACTIONS, LUA_EXTENSIONS } = require("./constants");
const { functionAtOffset } = require("./functions");

const KIND = vscode.CodeActionKind.Empty.append(CODE_ACTION_KIND);

const SELECTOR = [
	{ language: "lua" },
	{ language: "luau" },
	{ pattern: `**/*.{${LUA_EXTENSIONS.map((ext) => ext.slice(1)).join(",")}}` },
];

/**
 * @param {import("vscode").TextDocument} document
 * @param {import("vscode").Range|import("vscode").Selection} range
 * @returns {import("vscode").CodeAction[]}
 */
function createFunctionActions(document, range) {
	const fn = functionAtOffset(document.getText(), document.offsetAt(range.start));
	if (!fn) {
		return [];
	}

	return FUNCTION_ACTIONS.map((item) => {
		const action = new vscode.CodeAction(item.title, KIND);
		action.command = {
			command: COMMAND_VIRTUALIZE_FUNCTION,
			title: item.title,
			arguments: [{
				mode: item.mode,
				name: fn.name,
				start: fn.start,
			}],
		};
		return action;
	});
}

function registerFunctionCodeActions() {
	return vscode.languages.registerCodeActionsProvider(SELECTOR, {
		provideCodeActions(document, range) {
			return createFunctionActions(document, range);
		},
	}, {
		providedCodeActionKinds: [KIND],
	});
}

module.exports = {
	KIND,
	createFunctionActions,
	registerFunctionCodeActions,
};
