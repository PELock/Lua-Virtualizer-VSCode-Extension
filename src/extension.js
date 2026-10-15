"use strict";

const vscode = require("vscode");
const { createVirtualizer } = require("./client");
const { registerFunctionCodeActions } = require("./codeActions");
const {
	COMMAND_VIRTUALIZE,
	COMMAND_VIRTUALIZE_CONTEXT,
	COMMAND_VIRTUALIZE_FUNCTION,
	CONFIG_SECTION,
	CONTEXT_IS_LUA,
	LABELS,
} = require("./constants");
const { registerDecoratorProviders } = require("./decorator");
const { isLuaDocument } = require("./document");
const { virtualizeActiveScript, virtualizeFunction, openBuyPage, formatLicenseSummary, parseLicense } = require("./virtualize");

/**
 * @param {import("vscode").ExtensionContext} context
 */
async function activate(context) {
	const virtualizeCommand = vscode.commands.registerCommand(COMMAND_VIRTUALIZE, (uri) => virtualizeActiveScript(uri));
	const virtualizeContextCommand = vscode.commands.registerCommand(COMMAND_VIRTUALIZE_CONTEXT, (uri) => virtualizeActiveScript(uri));
	const virtualizeFunctionCommand = vscode.commands.registerCommand(COMMAND_VIRTUALIZE_FUNCTION, (request) => virtualizeFunction(request));
	const functionCodeActions = registerFunctionCodeActions();
	registerDecoratorProviders(vscode, context);

	const editorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
		updateLuaContext(editor?.document);
	});

	const documentWatcher = vscode.workspace.onDidOpenTextDocument((document) => {
		if (vscode.window.activeTextEditor?.document === document) {
			updateLuaContext(document);
		}
	});

	const configWatcher = vscode.workspace.onDidChangeConfiguration(async (event) => {
		if (event.affectsConfiguration(`${CONFIG_SECTION}.apiKey`)) {
			await notifyApiKeyChange();
		}
	});

	context.subscriptions.push(
		virtualizeCommand,
		virtualizeContextCommand,
		virtualizeFunctionCommand,
		functionCodeActions,
		editorWatcher,
		documentWatcher,
		configWatcher
	);
	updateLuaContext(vscode.window.activeTextEditor?.document);
}

function deactivate() {}

/**
 * @param {import("vscode").TextDocument|undefined} document
 */
function updateLuaContext(document) {
	const enabled = isLuaDocument(document);
	void vscode.commands.executeCommand("setContext", CONTEXT_IS_LUA, enabled);
}

async function notifyApiKeyChange() {
	const apiKey = String(vscode.workspace.getConfiguration(CONFIG_SECTION).get("apiKey") || "").trim();

	if (!apiKey) {
		vscode.window.showInformationMessage("Lua Virtualizer is now in Demo mode.", LABELS.pricing).then((choice) => {
			if (choice === LABELS.pricing) {
				openBuyPage();
			}
		});
		return;
	}

	try {
		const virtualizer = await createVirtualizer(apiKey);
		const status = await virtualizer.login();

		if (!status) {
			vscode.window.showWarningMessage("Could not verify the activation code. The next virtualization will retry against pelock.com.");
			return;
		}

		if (status.demo) {
			vscode.window.showInformationMessage("Lua Virtualizer is now in Demo mode.", LABELS.pricing).then((choice) => {
				if (choice === LABELS.pricing) {
					openBuyPage();
				}
			});
			return;
		}

		const license = parseLicense(status);
		vscode.window.showInformationMessage(`Lua Virtualizer is now activated. ${formatLicenseSummary(license)}`);
	} catch {
		vscode.window.showWarningMessage("Could not verify the activation code. The next virtualization will retry against pelock.com.");
	}
}

module.exports = {
	activate,
	deactivate,
};
