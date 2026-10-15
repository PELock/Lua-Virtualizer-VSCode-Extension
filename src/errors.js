"use strict";

const { URLS } = require("./constants");

/** Error codes from the Lua Virtualizer Web API. */
const ERROR_CODES = Object.freeze({
	ERROR_SUCCESS: 0,
	ERROR_INPUT_SIZE: 1,
	ERROR_INPUT: 2,
	ERROR_PARSING: 3,
	ERROR_OBFUSCATION: 4,
	ERROR_OUTPUT: 5,
	ERROR_EXEC: 6,
	ERROR_JSON: 7,
});

const ERROR_MESSAGES = Object.freeze({
	[ERROR_CODES.ERROR_INPUT_SIZE]: "Source code is too large for the current license tier. Demo mode is limited to 1000 bytes.",
	[ERROR_CODES.ERROR_INPUT]: "Invalid or empty input.",
	[ERROR_CODES.ERROR_PARSING]: "Lua parse error. Check syntax.",
	[ERROR_CODES.ERROR_OBFUSCATION]: "Virtualization error.",
	[ERROR_CODES.ERROR_OUTPUT]: "Output generation error.",
	[ERROR_CODES.ERROR_EXEC]: "Could not run the virtualizer binary.",
	[ERROR_CODES.ERROR_JSON]: "Invalid response from virtualizer (expected JSON).",
});

/**
 * @param {number|undefined|null} errorCode
 * @param {string} [cliMessage]
 * @returns {string}
 */
function getErrorMessage(errorCode, cliMessage) {
	const base = ERROR_MESSAGES[errorCode] || "Unknown error.";
	const extra = typeof cliMessage === "string" ? cliMessage.trim() : "";
	return extra ? `${base} ${extra}` : base;
}

/**
 * @param {number|undefined|null} errorCode
 * @returns {string|undefined}
 */
function getErrorHelpUrl(errorCode) {
	if (errorCode === ERROR_CODES.ERROR_INPUT_SIZE) {
		return URLS.buy;
	}
	return undefined;
}

module.exports = {
	ERROR_CODES,
	ERROR_MESSAGES,
	getErrorMessage,
	getErrorHelpUrl,
};
