"use strict";

const { isLuaDocument } = require("./document");
const {
	enclosingFunctionBody,
	isIdentChar,
	isIdentStart,
	readIdent,
	skipLiteral,
} = require("./functions");
const { STRATEGIES } = require("./strategies");

const MARKER = "LUAVIRTUALIZER";

const MODULE_NOTE = "This option is inserted for the whole script. A function ENABLE or DISABLE does not turn it on or off.";
const SCRIPT_WIDE_NOTE = "This option applies to the whole script. The engine ignores it on a function marker.";

const MARKER_DOC = [
	"**LUAVIRTUALIZER**",
	"",
	"Per-function decorator. It must be the first statement of the function. The engine reads it and removes it before the script runs.",
	"",
	"Clauses apply as `VM`, then `ENABLE`, then `DISABLE`, regardless of the order written in the source.",
	"",
	"`VM(...)` selects the dispatcher. `ENABLE(...)` replaces the strategy set. `DISABLE(...)` removes names from that set.",
	"",
	"`self_defending` and `protection_linker` apply to the whole script, not one function. Decoy functions, value-pool options, callback stubs, and the anti-debug probes are also script-wide: a function marker does not turn them on or off.",
].join("\n");

const VM_MODES = Object.freeze([
	{ name: "VM", detail: "Shuffled handler-table dispatcher." },
	{ name: "FSM", detail: "Finite-state machine dispatcher." },
	{ name: "FSA", detail: "Same as FSM." },
	{ name: "WEAVE", detail: "One mutable tape and three superoperators." },
	{ name: "FLAT", detail: "Numeric scheduler. RND never draws FLAT." },
	{ name: "NONE", detail: "Keep this function as native Lua. A virtual marker nested inside it stays native." },
	{ name: "RND", detail: "Draw VM, FSM, or WEAVE once for this function on each run. FLAT is not in the draw." },
]);

const GROUPS = Object.freeze([
	{
		name: "ALL",
		detail: "ENABLE(ALL) is every strategy except the four environment probes. DISABLE(ALL) clears the set.",
	},
	{
		name: "NAMES",
		detail: "rename_variables, rename_parameters, rename_functions, rename_function_calls, resolve_constants.",
	},
	{
		name: "STRINGS",
		detail: "split_strings, modify_strings, string_char_array_vault, encrypt_strings, array_string_crypt.",
	},
	{
		name: "NUMBERS",
		detail: "Integer, float, affine, mixed-boolean-arithmetic, and encrypted numeric-array strategies.",
	},
	{
		name: "BOOLEANS",
		detail: "complexify_booleans, insert_ternary_operators.",
	},
	{
		name: "SHAPE",
		detail: "Dead code, opaque branches, decoys, padding, fake requires, and function shuffling.",
	},
	{
		name: "BUCKET",
		detail: "Module-level decoy value pools. A function marker does not turn these on or off.",
	},
	{
		name: "CALLS",
		detail: "dynamic_getattr_calls, obfuscate_imports, callback_registration_stubs.",
	},
	{
		name: "COMMENTS",
		detail: "remove_comments.",
	},
	{
		name: "PROTECT",
		detail: "Anti-debug, anti-VM, anti-sandbox, and anti-emulator probes. A function marker does not turn these on or off.",
	},
]);

const CLAUSES = Object.freeze([
	{
		name: "VM",
		insertText: "VM(${1:VM})",
		detail: "Selects the dispatcher for this function and the functions nested inside it. The last VM(...) wins.",
	},
	{
		name: "ENABLE",
		insertText: "ENABLE(${1})",
		detail: "Replaces the inherited strategy set with the named strategies and groups.",
	},
	{
		name: "DISABLE",
		insertText: "DISABLE(${1})",
		detail: "Removes the named strategies and groups from the set.",
	},
]);

const SCRIPT_WIDE = Object.freeze({
	self_defending: "selfDefending",
	protection_linker: "protectionLinker",
});

const LUA_SELECTOR = Object.freeze([
	{ language: "lua" },
	{ pattern: "**/*.{lua,luau,wlua}" },
	{ pattern: "**/*.{LUA,LUAU,WLUA}" },
]);

/**
 * @param {string|null|undefined} left
 * @param {string|null|undefined} right
 * @returns {boolean}
 */
function ieq(left, right) {
	return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

/**
 * @param {string} source
 * @param {number} from
 * @param {number} limit
 * @returns {number}
 */
function skipGap(source, from, limit) {
	let index = from;
	while (index < limit) {
		const ch = source[index];
		if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\v") {
			index++;
			continue;
		}
		if (ch === "-" && source[index + 1] === "-") {
			const next = skipLiteral(source, index);
			if (next === index || next > limit) {
				return index;
			}
			index = next;
			continue;
		}
		break;
	}
	return index;
}

/**
 * @param {string} source
 * @param {number} limit
 * @returns {Array<string|null>}
 */
function callStack(source, limit) {
	/** @type {Array<string|null>} */
	const stack = [];
	let index = 0;
	while (index < limit) {
		const ch = source[index];
		if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\v") {
			index++;
			continue;
		}
		const skipped = skipLiteral(source, index);
		if (skipped !== index) {
			if (skipped > limit) {
				break;
			}
			index = skipped;
			continue;
		}
		if (isIdentStart(ch)) {
			const ident = readIdent(source, index);
			if (!ident || ident.end > limit) {
				break;
			}
			const after = skipGap(source, ident.end, limit);
			if (after < limit && source[after] === "(") {
				stack.push(ident.text);
				index = after + 1;
				continue;
			}
			index = ident.end;
			continue;
		}
		if (ch === "(") {
			stack.push(null);
			index++;
			continue;
		}
		if (ch === ")") {
			stack.pop();
			index++;
			continue;
		}
		index++;
	}
	return stack;
}

/**
 * Identifier that ends at or contains `offset`. The range covers the whole token.
 *
 * @param {string} source
 * @param {number} offset
 * @returns {{ start: number, end: number }}
 */
function completionWord(source, offset) {
	let start = offset;
	while (start > 0 && isIdentChar(source[start - 1])) {
		start--;
	}
	if (start < offset && !isIdentStart(source[start])) {
		start = offset;
	}
	let end = offset;
	while (end < source.length && isIdentChar(source[end])) {
		end++;
	}
	if (start < end && !isIdentStart(source[start])) {
		return { start: offset, end: offset };
	}
	return { start, end };
}

/**
 * @param {Array<string|null>} stack
 * @param {boolean} atFunctionStart
 * @returns {"body"|"clauses"|"vm"|"enable"|"disable"|null}
 */
function kindFromStack(stack, atFunctionStart) {
	const top = stack.length ? stack[stack.length - 1] : null;
	const insideMarker = stack.some((name) => ieq(name, MARKER));
	if (insideMarker && ieq(top, "VM")) {
		return "vm";
	}
	if (insideMarker && ieq(top, "ENABLE")) {
		return "enable";
	}
	if (insideMarker && ieq(top, "DISABLE")) {
		return "disable";
	}
	if (insideMarker && ieq(top, MARKER)) {
		return "clauses";
	}
	if (atFunctionStart) {
		return "body";
	}
	return null;
}

/**
 * Where a completion should be offered for the cursor at `offset`.
 *
 * @param {string} source
 * @param {number} offset
 * @returns {{ kind: "body"|"clauses"|"vm"|"enable"|"disable"|null, atFunctionStart: boolean, wordStart: number, wordEnd: number }}
 */
function completionContext(source, offset) {
	const text = String(source || "");
	const at = Math.max(0, Math.min(Number(offset) || 0, text.length));
	const word = completionWord(text, at);
	const stack = callStack(text, word.start);
	const fn = enclosingFunctionBody(text, word.start);
	const atFunctionStart = Boolean(fn) && skipGap(text, fn.bodyStart, word.start) === word.start;
	return {
		kind: kindFromStack(stack, atFunctionStart),
		atFunctionStart,
		wordStart: word.start,
		wordEnd: Math.max(word.end, at),
	};
}

/**
 * @param {string} source
 * @param {number} offset
 * @returns {{ start: number, end: number, text: string }|null}
 */
function hoverWord(source, offset) {
	if (offset < 0 || offset >= source.length || !isIdentChar(source[offset])) {
		return null;
	}
	let start = offset;
	while (start > 0 && isIdentChar(source[start - 1])) {
		start--;
	}
	if (!isIdentStart(source[start])) {
		return null;
	}
	let end = offset + 1;
	while (end < source.length && isIdentChar(source[end])) {
		end++;
	}
	return { start, end, text: source.slice(start, end) };
}

/**
 * @param {string} name
 * @returns {string}
 */
function strategyDoc(name) {
	const strategy = STRATEGIES.find((item) => item.decoratorName && ieq(item.decoratorName, name));
	if (!strategy) {
		return "";
	}
	const extra = strategy.perFunction === false ? `\n\n${MODULE_NOTE}` : "";
	return `**${strategy.label}**\n\n${strategy.note}${extra}`;
}

/**
 * @param {string} source
 * @param {number} offset
 * @returns {{ kind: string, name: string, start: number, end: number }|null}
 */
function hoverTarget(source, offset) {
	const text = String(source || "");
	const word = hoverWord(text, Number(offset) || 0);
	if (!word) {
		return null;
	}
	const stack = callStack(text, word.start);
	const top = stack.length ? stack[stack.length - 1] : null;
	const insideMarker = stack.some((name) => ieq(name, MARKER));
	const span = { start: word.start, end: word.end };

	if (ieq(word.text, MARKER)) {
		return { kind: "marker", name: MARKER, ...span };
	}
	if (!insideMarker) {
		return null;
	}
	if (ieq(top, MARKER)) {
		const clause = CLAUSES.find((item) => ieq(item.name, word.text));
		if (clause) {
			return { kind: "clause", name: clause.name, ...span };
		}
	}
	if (ieq(top, "VM")) {
		const mode = VM_MODES.find((item) => ieq(item.name, word.text));
		if (mode) {
			return { kind: "mode", name: mode.name, ...span };
		}
	}
	if (ieq(top, "ENABLE") || ieq(top, "DISABLE")) {
		const group = GROUPS.find((item) => ieq(item.name, word.text));
		if (group) {
			return { kind: "group", name: group.name, ...span };
		}
		const strategy = STRATEGIES.find((item) => item.decoratorName && ieq(item.decoratorName, word.text));
		if (strategy) {
			return {
				kind: strategy.perFunction === false ? "module" : "strategy",
				name: strategy.decoratorName,
				...span,
			};
		}
		const wideKey = Object.keys(SCRIPT_WIDE).find((item) => ieq(item, word.text));
		if (wideKey) {
			return { kind: "scriptWide", name: wideKey, ...span };
		}
	}
	return null;
}

/**
 * @param {{ kind: string, name: string }|null|undefined} target
 * @returns {string|null}
 */
function hoverMarkdown(target) {
	if (!target) {
		return null;
	}
	if (target.kind === "marker") {
		return MARKER_DOC;
	}
	if (target.kind === "clause") {
		const clause = CLAUSES.find((item) => item.name === target.name);
		return clause ? `**${clause.name}**\n\n${clause.detail}` : null;
	}
	if (target.kind === "mode") {
		const mode = VM_MODES.find((item) => item.name === target.name);
		return mode ? `**${mode.name}**\n\n${mode.detail}` : null;
	}
	if (target.kind === "group") {
		const group = GROUPS.find((item) => item.name === target.name);
		return group ? `**${group.name}**\n\n${group.detail}` : null;
	}
	if (target.kind === "strategy" || target.kind === "module") {
		const doc = strategyDoc(target.name);
		return doc || null;
	}
	if (target.kind === "scriptWide") {
		const strategy = STRATEGIES.find((item) => item.configKey === SCRIPT_WIDE[target.name]);
		if (!strategy) {
			return `**${target.name}**\n\n${SCRIPT_WIDE_NOTE}`;
		}
		return `**${strategy.label}**\n\n${strategy.note}\n\n${SCRIPT_WIDE_NOTE}`;
	}
	return null;
}

/**
 * @param {"body"|"clauses"|"vm"|"enable"|"disable"|null} kind
 * @returns {Array<{ label: string, insertText: string, snippet: boolean, detail: string, documentation: string, sortText: string, itemKind: string }>}
 */
function completionsFor(kind) {
	if (kind === "body") {
		return [{
			label: MARKER,
			insertText: "LUAVIRTUALIZER(VM(${1:VM}))",
			snippet: true,
			detail: "Per-function decorator",
			documentation: MARKER_DOC,
			sortText: "0",
			itemKind: "snippet",
		}];
	}
	if (kind === "clauses") {
		return CLAUSES.map((clause, index) => ({
			label: clause.name,
			insertText: clause.insertText,
			snippet: true,
			detail: clause.detail,
			documentation: `**${clause.name}**\n\n${clause.detail}`,
			sortText: `1${index}`,
			itemKind: "clause",
		}));
	}
	if (kind === "vm") {
		return VM_MODES.map((mode, index) => ({
			label: mode.name,
			insertText: mode.name,
			snippet: false,
			detail: mode.detail,
			documentation: `**${mode.name}**\n\n${mode.detail}`,
			sortText: `2${index}`,
			itemKind: "mode",
		}));
	}
	if (kind === "enable" || kind === "disable") {
		const groups = GROUPS.map((group, index) => ({
			label: group.name,
			insertText: group.name,
			snippet: false,
			detail: group.detail,
			documentation: `**${group.name}**\n\n${group.detail}`,
			sortText: `3${String(index).padStart(2, "0")}`,
			itemKind: "group",
		}));
		const strategies = STRATEGIES.filter((item) => item.decoratorName && item.perFunction !== false);
		return groups.concat(strategies.map((strategy, index) => ({
			label: strategy.decoratorName,
			insertText: strategy.decoratorName,
			snippet: false,
			detail: strategy.label,
			documentation: strategyDoc(strategy.decoratorName),
			sortText: `4${String(index).padStart(2, "0")}`,
			itemKind: "strategy",
		})));
	}
	return [];
}

/**
 * @param {typeof import("vscode")} vscode
 * @param {import("vscode").ExtensionContext} context
 */
function registerDecoratorProviders(vscode, context) {
	const completionKinds = {
		snippet: vscode.CompletionItemKind.Snippet,
		clause: vscode.CompletionItemKind.Function,
		mode: vscode.CompletionItemKind.EnumMember,
		group: vscode.CompletionItemKind.Module,
		strategy: vscode.CompletionItemKind.EnumMember,
	};

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(LUA_SELECTOR, {
		provideCompletionItems(document, position) {
			if (!isLuaDocument(document)) {
				return undefined;
			}
			const offset = document.offsetAt(position);
			const ctx = completionContext(document.getText(), offset);
			const entries = completionsFor(ctx.kind);
			if (entries.length === 0) {
				return undefined;
			}
			const range = new vscode.Range(document.positionAt(ctx.wordStart), document.positionAt(ctx.wordEnd));
			return entries.map((entry) => {
				const item = new vscode.CompletionItem(entry.label, completionKinds[entry.itemKind]);
				item.insertText = entry.snippet ? new vscode.SnippetString(entry.insertText) : entry.insertText;
				item.detail = entry.detail;
				item.documentation = new vscode.MarkdownString(entry.documentation);
				item.range = range;
				item.sortText = entry.sortText;
				return item;
			});
		},
	}, "(", ","));

	context.subscriptions.push(vscode.languages.registerHoverProvider(LUA_SELECTOR, {
		provideHover(document, position) {
			if (!isLuaDocument(document)) {
				return undefined;
			}
			const offset = document.offsetAt(position);
			const target = hoverTarget(document.getText(), offset);
			const markdown = hoverMarkdown(target);
			if (!target || !markdown) {
				return undefined;
			}
			const range = new vscode.Range(document.positionAt(target.start), document.positionAt(target.end));
			return new vscode.Hover(new vscode.MarkdownString(markdown), range);
		},
	}));
}

module.exports = {
	MARKER,
	completionContext,
	hoverTarget,
	hoverMarkdown,
	completionsFor,
	registerDecoratorProviders,
};
