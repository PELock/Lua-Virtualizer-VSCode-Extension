"use strict";

const path = require("path");
const { DEFAULT_OUTPUT_EXTENSION, LUA_EXTENSIONS, LUA_LANGUAGE_ID, OUTPUT_FILE_STEM } = require("./constants");

const EXTENSION_SET = new Set(LUA_EXTENSIONS.map((ext) => ext.toLowerCase()));

/**
 * @param {string|undefined|null} fileName
 * @returns {string}
 */
function getFileExtension(fileName) {
	if (!fileName || typeof fileName !== "string") {
		return "";
	}

	const normalized = fileName.replace(/\\/g, "/");
	const base = normalized.includes("/") ? normalized.slice(normalized.lastIndexOf("/") + 1) : normalized;
	return path.extname(base).toLowerCase();
}

/**
 * @param {{ languageId?: string, fileName?: string, uri?: { fsPath?: string, path?: string } }|null|undefined} document
 * @returns {boolean}
 */
function isLuaDocument(document) {
	if (!document) {
		return false;
	}

	const languageId = typeof document.languageId === "string" ? document.languageId.toLowerCase() : "";
	if (languageId === LUA_LANGUAGE_ID) {
		return true;
	}

	const fileName = document.fileName
		|| document.uri?.fsPath
		|| document.uri?.path
		|| "";

	return EXTENSION_SET.has(getFileExtension(fileName));
}

/**
 * Output tab/file name: virtualized.{original extension}, e.g. script.wlua → virtualized.wlua
 *
 * @param {string|undefined|null} sourcePath
 * @returns {string}
 */
function getVirtualizedFileName(sourcePath) {
	const extension = getFileExtension(sourcePath);
	return `${OUTPUT_FILE_STEM}${extension || DEFAULT_OUTPUT_EXTENSION}`;
}

/**
 * @param {string} sourceFsPath
 * @returns {string}
 */
function getVirtualizedOutputPath(sourceFsPath) {
	return path.join(path.dirname(sourceFsPath), getVirtualizedFileName(sourceFsPath));
}

module.exports = {
	getFileExtension,
	getVirtualizedFileName,
	getVirtualizedOutputPath,
	isLuaDocument,
};
