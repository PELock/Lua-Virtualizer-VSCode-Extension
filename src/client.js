"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const { STRATEGIES } = require("./strategies");
const { CODE_VIRTUALIZATION_MODES, RENAME_STYLES, TARGETS } = require("./constants");

/**
 * @typedef {Object} VirtualizerSettings
 * @property {string} apiKey
 * @property {boolean} enableCompression
 * @property {number|null} seed
 * @property {number|null} randomizationDensity
 * @property {string|null} renameStyle
 * @property {boolean} codeVirtualizationEnabled
 * @property {string} codeVirtualization
 * @property {string} target
 */

/**
 * Load the local ESM client from a CommonJS extension host.
 *
 * @returns {Promise<typeof import("../lib/lua-virtualizer.mjs")>}
 */
async function loadSdk() {
	const sdkUrl = pathToFileURL(path.join(__dirname, "..", "lib", "lua-virtualizer.mjs")).href;
	const module = await import(sdkUrl);
	return module.default;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function readOptionalInt(value) {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	return Math.trunc(parsed);
}

/**
 * @param {import("vscode").WorkspaceConfiguration} config
 * @returns {VirtualizerSettings & Record<string, boolean|string|number|null>}
 */
function readSettings(config) {
	const renameStyleRaw = String(config.get("renameStyle") || "il").trim().toLowerCase();
	const virtRaw = String(config.get("codeVirtualization") || "vm").trim().toLowerCase();
	const targetRaw = String(config.get("target") || "auto").trim().toLowerCase();
	const density = readOptionalInt(config.get("randomizationDensity"));
	const seed = readOptionalInt(config.get("seed"));

	/** @type {VirtualizerSettings & Record<string, boolean|string|number|null>} */
	const settings = {
		apiKey: String(config.get("apiKey") || "").trim(),
		enableCompression: Boolean(config.get("enableCompression")),
		seed: seed !== null && seed !== 0 ? seed : null,
		randomizationDensity: density === null ? 100 : Math.min(100, Math.max(0, density)),
		renameStyle: RENAME_STYLES.includes(renameStyleRaw) ? renameStyleRaw : "il",
		codeVirtualizationEnabled: config.get("codeVirtualizationEnabled") !== false,
		codeVirtualization: CODE_VIRTUALIZATION_MODES.includes(virtRaw) ? virtRaw : "vm",
		target: TARGETS.includes(targetRaw) ? targetRaw : "auto",
	};

	for (const strategy of STRATEGIES) {
		settings[strategy.configKey] = config.get(strategy.configKey, strategy.default) !== false;
	}

	return settings;
}

/**
 * Apply workspace settings onto a JavaScript client instance.
 *
 * @param {object} virtualizer
 * @param {VirtualizerSettings & Record<string, boolean|string|number|null>} settings
 * @returns {object}
 */
function applySettings(virtualizer, settings) {
	virtualizer.enableCompression = Boolean(settings.enableCompression);
	virtualizer.seed = settings.seed;
	virtualizer.randomizationDensity = settings.randomizationDensity;
	virtualizer.renameStyle = settings.renameStyle || null;
	virtualizer.codeVirtualization = settings.codeVirtualizationEnabled
		? (settings.codeVirtualization || "vm")
		: null;
	virtualizer.target = settings.target || "auto";

	for (const strategy of STRATEGIES) {
		virtualizer[strategy.sdkProperty] = Boolean(settings[strategy.configKey]);
	}

	return virtualizer;
}

/**
 * @param {string} [apiKey]
 * @returns {Promise<object>}
 */
async function createVirtualizer(apiKey) {
	const LuaVirtualizer = await loadSdk();
	const key = typeof apiKey === "string" && apiKey.trim() !== "" ? apiKey.trim() : null;
	return new LuaVirtualizer(key);
}

/**
 * @param {VirtualizerSettings & Record<string, boolean|string|number|null>} settings
 * @returns {Promise<object>}
 */
async function createConfiguredVirtualizer(settings) {
	const virtualizer = await createVirtualizer(settings.apiKey);
	return applySettings(virtualizer, settings);
}

/**
 * Settings for virtualizing one function. Strategy checkboxes are ignored:
 * every strategy is off, comments stay, and only `mode` is virtualized.
 *
 * @param {string} apiKey
 * @param {string} mode
 * @returns {VirtualizerSettings & Record<string, boolean|string|number|null>}
 */
function functionVirtualizationSettings(apiKey, mode) {
	const virt = String(mode || "").trim().toLowerCase();
	/** @type {VirtualizerSettings & Record<string, boolean|string|number|null>} */
	const settings = {
		apiKey: String(apiKey || "").trim(),
		enableCompression: false,
		seed: null,
		randomizationDensity: 100,
		renameStyle: null,
		codeVirtualizationEnabled: true,
		codeVirtualization: CODE_VIRTUALIZATION_MODES.includes(virt) ? virt : "vm",
		target: "auto",
	};
	for (const strategy of STRATEGIES) {
		settings[strategy.configKey] = false;
	}
	return settings;
}

module.exports = {
	loadSdk,
	readSettings,
	applySettings,
	createVirtualizer,
	createConfiguredVirtualizer,
	functionVirtualizationSettings,
};
