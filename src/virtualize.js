"use strict";

const vscode = require("vscode");
const { createConfiguredVirtualizer, functionVirtualizationSettings, readSettings } = require("./client");
const {
	CONFIG_SECTION,
	DEMO_MESSAGE,
	LABELS,
	URLS,
} = require("./constants");
const { isLuaDocument } = require("./document");
const { ERROR_CODES, getErrorMessage } = require("./errors");
const { decorateNamedFunctions, functionAtOffset } = require("./functions");
const { openVirtualizedScript, revealFunctionAnchor } = require("./output");

/**
 * @typedef {Object} LicenseInfo
 * @property {string} expirationDisplay Human-readable expiration (`Y-m-d` or "does not expire")
 * @property {number|null} usagesTotal Lifetime virtualization count, if the API sent it
 */

/**
 * Read time-limited license fields. Empty `license_expiration` means perpetual.
 *
 * @param {{ license_expiration?: string, usages_total?: number }|null|undefined} result
 * @returns {LicenseInfo}
 */
function parseLicense(result) {
	const raw = result && typeof result.license_expiration === "string"
		? result.license_expiration.trim()
		: "";
	const usages = result && Number.isFinite(result.usages_total)
		? result.usages_total
		: null;
	return {
		expirationDisplay: raw || "does not expire",
		usagesTotal: usages,
	};
}

/**
 * @param {LicenseInfo} license
 * @returns {string}
 */
function formatLicenseSummary(license) {
	const expiry = license.expirationDisplay === "does not expire"
		? "License does not expire."
		: `License expires ${license.expirationDisplay}.`;
	const usages = license.usagesTotal !== null
		? ` Total virtualizations: ${license.usagesTotal}.`
		: "";
	return `${expiry}${usages}`;
}

/**
 * @param {string} url
 */
function openWebPage(url) {
	vscode.env.openExternal(vscode.Uri.parse(url));
}

function openBuyPage() {
	openWebPage(URLS.buy);
}

function openContactPage() {
	openWebPage(URLS.contact);
}

function openStatusPage() {
	openWebPage(URLS.status);
}

function showConnectionError() {
	vscode.window.showErrorMessage(
		"Error while trying to connect to the Lua Virtualizer service at pelock.com.",
		LABELS.isItDown
	).then((choice) => {
		if (choice === LABELS.isItDown) {
			openStatusPage();
		}
	});
}

/**
 * @param {import("vscode").Uri|undefined} [uri]
 * @returns {Promise<import("vscode").TextDocument|undefined>}
 */
async function resolveSourceDocument(uri) {
	if (uri instanceof vscode.Uri) {
		const alreadyOpen = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
		if (alreadyOpen) {
			return alreadyOpen;
		}
		return vscode.workspace.openTextDocument(uri);
	}

	return vscode.window.activeTextEditor?.document;
}

/**
 * Virtualize the active Lua editor, or the resource that was right-clicked.
 *
 * @param {import("vscode").Uri|undefined} [uri]
 * @returns {Promise<void>}
 */
async function virtualizeActiveScript(uri) {
	let document;
	try {
		document = await resolveSourceDocument(uri);
	} catch {
		vscode.window.showErrorMessage("Could not open the selected Lua file.");
		return;
	}

	if (!document) {
		vscode.window.showErrorMessage("No active editor.");
		return;
	}

	if (!isLuaDocument(document)) {
		vscode.window.showErrorMessage("The Virtualize command is available only for Lua files (.lua, .luau, .wlua).");
		return;
	}

	const source = document.getText();
	if (!source.trim()) {
		vscode.window.showErrorMessage("The Lua file is empty.");
		return;
	}

	const settings = readSettings(vscode.workspace.getConfiguration(CONFIG_SECTION));

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Lua Virtualizer",
		cancellable: false,
	}, async (progress) => {
		progress.report({ message: settings.apiKey ? "Virtualizing script…" : "Virtualizing script (Demo mode)…" });

		let result;
		try {
			const virtualizer = await createConfiguredVirtualizer(settings);
			result = await virtualizer.virtualizeScriptSource(source);
		} catch {
			showConnectionError();
			return;
		}

		if (!result) {
			showConnectionError();
			return;
		}

		if (result.error !== ERROR_CODES.ERROR_SUCCESS) {
			const message = getErrorMessage(result.error, result.cli_message);
			if (result.error === ERROR_CODES.ERROR_INPUT_SIZE) {
				vscode.window.showErrorMessage(message, LABELS.pricing).then((choice) => {
					if (choice === LABELS.pricing) {
						openBuyPage();
					}
				});
			} else {
				vscode.window.showErrorMessage(message);
			}
			return;
		}

		if (typeof result.output !== "string" || result.output.length === 0) {
			vscode.window.showErrorMessage(getErrorMessage(ERROR_CODES.ERROR_OUTPUT));
			return;
		}

		try {
			await openVirtualizedScript(document, result.output);
		} catch (error) {
			const detail = error instanceof Error ? error.message : "Unknown error.";
			vscode.window.showErrorMessage(`Could not open the virtualized script. ${detail}`, LABELS.reportBug).then((choice) => {
				if (choice === LABELS.reportBug) {
					openContactPage();
				}
			});
			return;
		}

		showVirtualizationSuccess(result, Boolean(settings.apiKey));
	});
}

/**
 * @param {{ demo?: boolean, license_expiration?: string, usages_total?: number }} result
 * @param {boolean} hasApiKey
 */
function showVirtualizationSuccess(result, hasApiKey) {
	if (hasApiKey && result.demo === true) {
		vscode.window.showWarningMessage(
			"Your activation code has expired. Thank you for using Lua Virtualizer.",
			LABELS.pricing
		).then((choice) => {
			if (choice === LABELS.pricing) {
				openBuyPage();
			}
		});
		return;
	}

	if (!hasApiKey || result.demo === true) {
		vscode.window.showInformationMessage(
			`Script virtualized successfully (Demo mode). ${DEMO_MESSAGE}`,
			LABELS.pricing
		).then((choice) => {
			if (choice === LABELS.pricing) {
				openBuyPage();
			}
		});
		return;
	}

	const license = parseLicense(result);
	vscode.window.showInformationMessage(`Script virtualized successfully. ${formatLicenseSummary(license)}`);
}

/**
 * Virtualize the named function under the cursor. The editor buffer is copied,
 * not edited. Strategy checkboxes are not read.
 *
 * @param {{ mode?: string, name?: string, start?: number }|undefined} request
 * @returns {Promise<void>}
 */
async function virtualizeFunction(request) {
	const mode = request && request.mode;
	const name = request && request.name;
	const start = request && request.start;
	if (!mode || !name || !Number.isInteger(start)) {
		vscode.window.showErrorMessage("Virtualize Function needs a named Lua function under the cursor.");
		return;
	}

	const document = vscode.window.activeTextEditor?.document;
	if (!document) {
		vscode.window.showErrorMessage("No active editor.");
		return;
	}
	if (!isLuaDocument(document)) {
		vscode.window.showErrorMessage("Virtualize Function is available only for Lua files (.lua, .luau, .wlua).");
		return;
	}

	const source = document.getText();
	const selected = functionAtOffset(source, start);
	if (!selected || selected.name !== name || selected.start !== start) {
		vscode.window.showErrorMessage(`The function ${name} could not be located.`);
		return;
	}

	const marked = decorateNamedFunctions(source, selected, mode);
	if (!marked) {
		vscode.window.showErrorMessage(`The function ${name} could not be located.`);
		return;
	}

	const apiKey = String(vscode.workspace.getConfiguration(CONFIG_SECTION).get("apiKey") || "").trim();
	const settings = functionVirtualizationSettings(apiKey, mode);

	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Lua Virtualizer",
		cancellable: false,
	}, async (progress) => {
		progress.report({ message: settings.apiKey ? `Virtualizing ${name}…` : `Virtualizing ${name} (Demo mode)…` });

		let result;
		try {
			const virtualizer = await createConfiguredVirtualizer(settings);
			result = await virtualizer.virtualizeScriptSource(marked);
		} catch {
			showConnectionError();
			return;
		}

		if (!result) {
			showConnectionError();
			return;
		}

		if (result.error !== ERROR_CODES.ERROR_SUCCESS) {
			const message = getErrorMessage(result.error, result.cli_message);
			if (result.error === ERROR_CODES.ERROR_INPUT_SIZE) {
				vscode.window.showErrorMessage(message, LABELS.pricing).then((choice) => {
					if (choice === LABELS.pricing) {
						openBuyPage();
					}
				});
			} else {
				vscode.window.showErrorMessage(message);
			}
			return;
		}

		if (typeof result.output !== "string" || result.output.length === 0) {
			vscode.window.showErrorMessage(getErrorMessage(ERROR_CODES.ERROR_OUTPUT));
			return;
		}

		let editor;
		try {
			editor = await openVirtualizedScript(document, result.output);
		} catch (error) {
			const detail = error instanceof Error ? error.message : "Unknown error.";
			vscode.window.showErrorMessage(`Could not open the virtualized script. ${detail}`, LABELS.reportBug).then((choice) => {
				if (choice === LABELS.reportBug) {
					openContactPage();
				}
			});
			return;
		}

		revealFunctionAnchor(editor, name);
		showVirtualizationSuccess(result, Boolean(settings.apiKey));
	});
}

module.exports = {
	virtualizeActiveScript,
	virtualizeFunction,
	showConnectionError,
	openBuyPage,
	parseLicense,
	formatLicenseSummary,
};
