"use strict";

/** VS Code configuration section and command namespace. */
const EXTENSION_ID = "lua-virtualizer";
const CONFIG_SECTION = "luaVirtualizer";
const COMMAND_VIRTUALIZE = `${EXTENSION_ID}.virtualize`;
const COMMAND_VIRTUALIZE_CONTEXT = `${EXTENSION_ID}.virtualizeContext`;
const COMMAND_VIRTUALIZE_FUNCTION = `${EXTENSION_ID}.virtualizeFunction`;
const CODE_ACTION_KIND = "LuaVirtualizer";
const CONTEXT_IS_LUA = `${CONFIG_SECTION}.isLua`;
const CONTEXT_MENU_TITLE = "Lua Virtualizer";

const OUTPUT_FILE_STEM = "virtualized";
const DEFAULT_OUTPUT_EXTENSION = ".lua";
const LUA_LANGUAGE_ID = "lua";

/** Lua-compatible extensions recognized by this extension. */
const LUA_EXTENSIONS = Object.freeze([
	".lua",
	".luau",
	".wlua",
]);

const URLS = Object.freeze({
	product: "https://www.pelock.com/products/lua-virtualizer",
	buy: "https://www.pelock.com/products/lua-virtualizer/buy",
	api: "https://www.pelock.com/products/lua-virtualizer/api",
	download: "https://www.pelock.com/products/lua-virtualizer/download",
	screenshots: "https://www.pelock.com/products/lua-virtualizer/screenshots",
	history: "https://www.pelock.com/products/lua-virtualizer/history",
	online: "https://www.pelock.com/lua-virtualizer/",
	contact: "https://www.pelock.com/contact",
	status: "https://downforeveryoneorjustme.com/pelock.com",
});

const LABELS = Object.freeze({
	pricing: "Check Full Version Pricing",
	isItDown: "Check Server Status",
	reportBug: "Report a Bug",
});

const DEMO_SOURCE_LIMIT = 1000;
const FULL_SOURCE_LIMIT = 10000000;

const RENAME_STYLES = Object.freeze([
	"il",
	"o0",
	"hex",
	"mangled",
]);

const CODE_VIRTUALIZATION_MODES = Object.freeze([
	"vm",
	"fsm",
	"weave",
	"flat",
	"rnd",
]);

const CODE_VIRTUALIZATION_LABELS = Object.freeze([
	"Virtualize code",
	"Finite-State Machine (FSM)",
	"Weave tape",
	"Mix code flow",
	"Random VM, FSM, or WEAVE",
]);

/** Lightbulb titles. The submenu label is the code-action kind `LuaVirtualizer`. */
const FUNCTION_ACTIONS = Object.freeze([
	{ title: "Virtualize Function (VM)", mode: "vm" },
	{ title: "Finite-State Machine (FSM)", mode: "fsm" },
	{ title: "Weave Tape VM", mode: "weave" },
	{ title: "Mix Code Flow", mode: "flat" },
]);

const TARGETS = Object.freeze([
	"auto",
	"5.1",
	"5.2",
	"5.3",
	"5.4",
	"5.5",
	"luajit",
	"luau",
]);

const TARGET_LABELS = Object.freeze([
	"Automatic",
	"5.1",
	"5.2",
	"5.3",
	"5.4",
	"5.5",
	"LuaJIT",
	"Luau",
]);

const TARGET_HELP = "Automatic tries the source as 5.1, then 5.2, 5.3, 5.4, 5.5, then Luau, and keeps the oldest dialect that parses. LuaJIT is not inferred. A script whose only newer feature is goto is detected as 5.2, because goto arrived in Lua 5.2. Choose LuaJIT explicitly when the script must be treated as LuaJIT.";

const DEMO_MESSAGE = "Only flat code virtualization is applied, other options are ignored, and scripts are limited to 1000 bytes.";

module.exports = {
	EXTENSION_ID,
	CONFIG_SECTION,
	COMMAND_VIRTUALIZE,
	COMMAND_VIRTUALIZE_CONTEXT,
	COMMAND_VIRTUALIZE_FUNCTION,
	CODE_ACTION_KIND,
	CONTEXT_IS_LUA,
	CONTEXT_MENU_TITLE,
	OUTPUT_FILE_STEM,
	DEFAULT_OUTPUT_EXTENSION,
	LUA_LANGUAGE_ID,
	LUA_EXTENSIONS,
	URLS,
	LABELS,
	DEMO_SOURCE_LIMIT,
	FULL_SOURCE_LIMIT,
	RENAME_STYLES,
	CODE_VIRTUALIZATION_MODES,
	CODE_VIRTUALIZATION_LABELS,
	FUNCTION_ACTIONS,
	TARGETS,
	TARGET_LABELS,
	TARGET_HELP,
	DEMO_MESSAGE,
};
