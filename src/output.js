"use strict";

const vscode = require("vscode");
const { LUA_LANGUAGE_ID } = require("./constants");
const { getVirtualizedFileName, getVirtualizedOutputPath } = require("./document");

/**
 * @param {string} output
 * @returns {Uint8Array}
 */
function toUtf8Bytes(output) {
	return Buffer.from(output, "utf8");
}

/**
 * Prefer a real `virtualized.{ext}` file next to the source script (or in the workspace).
 * Fall back to an untitled document named `virtualized.{ext}`.
 *
 * @param {import("vscode").TextDocument} sourceDocument
 * @param {string} output
 * @returns {Promise<import("vscode").TextEditor>}
 */
async function openVirtualizedScript(sourceDocument, output) {
	const targetUri = resolveOutputUri(sourceDocument);

	if (targetUri.scheme === "untitled") {
		return openUntitledOutput(targetUri, output);
	}

	await vscode.workspace.fs.writeFile(targetUri, toUtf8Bytes(output));
	const document = await vscode.workspace.openTextDocument(targetUri);
	await ensureLuaLanguage(document);
	return vscode.window.showTextDocument(document, {
		preview: false,
		preserveFocus: false,
		viewColumn: vscode.ViewColumn.Active,
	});
}

/**
 * @param {import("vscode").TextDocument} sourceDocument
 * @returns {import("vscode").Uri}
 */
function resolveOutputUri(sourceDocument) {
	if (sourceDocument.uri.scheme === "file") {
		return vscode.Uri.file(getVirtualizedOutputPath(sourceDocument.uri.fsPath));
	}

	const outputName = getVirtualizedFileName(sourceDocument.fileName || sourceDocument.uri.path);
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (folder) {
		return vscode.Uri.joinPath(folder.uri, outputName);
	}

	return vscode.Uri.parse(`untitled:${outputName}`);
}

/**
 * @param {import("vscode").Uri} uri
 * @param {string} output
 * @returns {Promise<import("vscode").TextEditor>}
 */
async function openUntitledOutput(uri, output) {
	const document = await vscode.workspace.openTextDocument(uri);
	const editor = await vscode.window.showTextDocument(document, {
		preview: false,
		preserveFocus: false,
		viewColumn: vscode.ViewColumn.Active,
	});

	const fullRange = new vscode.Range(
		document.positionAt(0),
		document.positionAt(document.getText().length)
	);

	const replaced = await editor.edit((builder) => {
		builder.replace(fullRange, output);
	});

	if (!replaced && document.getText() !== output) {
		throw new Error("Could not write virtualized script into the editor.");
	}

	await ensureLuaLanguage(editor.document);
	return editor;
}

/**
 * @param {import("vscode").TextDocument} document
 * @returns {Promise<void>}
 */
async function ensureLuaLanguage(document) {
	if (document.languageId === LUA_LANGUAGE_ID) {
		return;
	}

	try {
		await vscode.languages.setTextDocumentLanguage(document, LUA_LANGUAGE_ID);
	} catch {
		// The tab still opens as virtualized.{ext} when the language cannot be set.
	}
}

/**
 * @param {import("vscode").TextDocument} document
 * @param {string} name
 * @returns {import("vscode").Range|null}
 */
function findAnchorRange(document, name) {
	const needle = `-- LuaVirtualizer:${name}`;
	const index = document.getText().indexOf(needle);
	if (index < 0) {
		return null;
	}
	return new vscode.Range(
		document.positionAt(index),
		document.positionAt(index + needle.length)
	);
}

/**
 * Scroll the opened script so the function anchor is in the center.
 *
 * @param {import("vscode").TextEditor} editor
 * @param {string} name
 * @returns {boolean}
 */
function revealFunctionAnchor(editor, name) {
	const range = findAnchorRange(editor.document, name);
	if (!range) {
		return false;
	}
	editor.selection = new vscode.Selection(range.start, range.end);
	editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
	return true;
}

module.exports = {
	openVirtualizedScript,
	resolveOutputUri,
	toUtf8Bytes,
	findAnchorRange,
	revealFunctionAnchor,
};
