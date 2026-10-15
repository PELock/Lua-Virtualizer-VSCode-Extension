"use strict";

const VM_TOKENS = Object.freeze({
	vm: "VM",
	fsm: "FSM",
	weave: "WEAVE",
	flat: "FLAT",
});

/**
 * @param {string} mode
 * @returns {string}
 */
function vmToken(mode) {
	const token = VM_TOKENS[String(mode || "").toLowerCase()];
	if (!token) {
		throw new Error(`Unknown virtualization mode "${mode}".`);
	}
	return token;
}

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isIdentStart(ch) {
	return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_";
}

/**
 * @param {string} ch
 * @returns {boolean}
 */
function isIdentChar(ch) {
	return isIdentStart(ch) || (ch >= "0" && ch <= "9");
}

/**
 * Opening long bracket at `i`, or -1. The return value is the equals count.
 *
 * @param {string} source
 * @param {number} i
 * @returns {number}
 */
function longEquals(source, i) {
	if (source[i] !== "[") {
		return -1;
	}
	let j = i + 1;
	while (source[j] === "=") {
		j++;
	}
	if (source[j] !== "[") {
		return -1;
	}
	return j - (i + 1);
}

/**
 * @param {string} source
 * @param {number} i Index of the opening `[`.
 * @param {number} equals
 * @returns {number}
 */
function skipLongBracket(source, i, equals) {
	const close = `]${"=".repeat(equals)}]`;
	const at = source.indexOf(close, i + 2 + equals);
	return at < 0 ? source.length : at + close.length;
}

/**
 * @param {string} source
 * @param {number} i Index of the first `-`.
 * @returns {number}
 */
function skipComment(source, i) {
	let j = i + 2;
	if (source[j] === "[") {
		const equals = longEquals(source, j);
		if (equals >= 0) {
			return skipLongBracket(source, j, equals);
		}
	}
	while (j < source.length && source[j] !== "\n") {
		j++;
	}
	return j;
}

/**
 * @param {string} source
 * @param {number} i Index of the quote.
 * @returns {number}
 */
function skipShortString(source, i) {
	const quote = source[i];
	let j = i + 1;
	while (j < source.length) {
		const ch = source[j];
		if (ch === "\\") {
			if (source[j + 1] === "z") {
				j += 2;
				while (j < source.length && /\s/.test(source[j])) {
					j++;
				}
				continue;
			}
			j += 2;
			continue;
		}
		if (ch === quote) {
			return j + 1;
		}
		if (ch === "\n") {
			return j;
		}
		j++;
	}
	return j;
}

/**
 * Skip a comment or string that starts at `i`. Returns `i` when there is none.
 *
 * @param {string} source
 * @param {number} i
 * @returns {number}
 */
function skipLiteral(source, i) {
	if (source[i] === "-" && source[i + 1] === "-") {
		return skipComment(source, i);
	}
	if (source[i] === "\"" || source[i] === "'") {
		return skipShortString(source, i);
	}
	if (source[i] === "[") {
		const equals = longEquals(source, i);
		if (equals >= 0) {
			return skipLongBracket(source, i, equals);
		}
	}
	return i;
}

/**
 * @param {string} source
 * @param {number} i
 * @returns {number}
 */
function skipSpaceAndComments(source, i) {
	while (i < source.length) {
		const ch = source[i];
		if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\v") {
			i++;
			continue;
		}
		const next = skipLiteral(source, i);
		if (next !== i && source[i] === "-" && source[i + 1] === "-") {
			i = next;
			continue;
		}
		break;
	}
	return i;
}

/**
 * @param {string} source
 * @param {number} i
 * @returns {{ text: string, end: number }|null}
 */
function readIdent(source, i) {
	if (!isIdentStart(source[i])) {
		return null;
	}
	let j = i + 1;
	while (j < source.length && isIdentChar(source[j])) {
		j++;
	}
	return { text: source.slice(i, j), end: j };
}

/**
 * Index just after the `)` that closes the parenthesis at `i`.
 *
 * @param {string} source
 * @param {number} i
 * @returns {number}
 */
function skipBalancedParen(source, i) {
	let depth = 0;
	while (i < source.length) {
		const next = skipLiteral(source, i);
		if (next !== i) {
			i = next;
			continue;
		}
		if (source[i] === "(") {
			depth++;
		} else if (source[i] === ")") {
			depth--;
			if (depth === 0) {
				return i + 1;
			}
		}
		i++;
	}
	return i;
}

/**
 * @param {string} source
 * @param {number} i Index just after the `function` keyword.
 * @returns {{ name: string|null, bodyStart: number }}
 */
function parseFunctionHeader(source, i) {
	let j = skipSpaceAndComments(source, i);
	let name = null;
	const ident = readIdent(source, j);
	if (ident) {
		name = ident.text;
		j = skipSpaceAndComments(source, ident.end);
		while (source[j] === ".") {
			j = skipSpaceAndComments(source, j + 1);
			const field = readIdent(source, j);
			if (!field) {
				break;
			}
			name = field.text;
			j = skipSpaceAndComments(source, field.end);
		}
		if (source[j] === ":") {
			j = skipSpaceAndComments(source, j + 1);
			const method = readIdent(source, j);
			if (method) {
				name = method.text;
				j = skipSpaceAndComments(source, method.end);
			}
		}
	}
	j = skipSpaceAndComments(source, j);
	if (source[j] !== "(") {
		return { name: null, bodyStart: j };
	}
	return { name, bodyStart: skipBalancedParen(source, j) };
}

/**
 * Named and anonymous functions, paired with `end`. Strings and comments are ignored.
 * `name` is null for an anonymous function. `bodyStart` is the index just after
 * the parameter list, where the first statement is inserted.
 *
 * @param {string} source
 * @returns {Array<{ name: string|null, start: number, bodyStart: number, end: number, endEnd: number }>}
 */
function scanFunctions(source) {
	/** @type {Array<{ name: string|null, start: number, bodyStart: number, end: number, endEnd: number }>} */
	const functions = [];
	/** @type {Array<{ kind: string, name: string|null, start: number, bodyStart: number }>} */
	const blocks = [];
	const text = String(source || "");
	let i = 0;

	while (i < text.length) {
		const skipped = skipLiteral(text, i);
		if (skipped !== i) {
			i = skipped;
			continue;
		}
		if (isIdentStart(text[i])) {
			const ident = readIdent(text, i);
			const word = ident.text;
			if (word === "function") {
				const header = parseFunctionHeader(text, ident.end);
				blocks.push({
					kind: "function",
					name: header.name,
					start: i,
					bodyStart: header.bodyStart,
				});
				i = header.bodyStart;
				continue;
			}
			if (word === "if" || word === "while" || word === "for" || word === "do") {
				blocks.push({ kind: "block", name: null, start: i, bodyStart: ident.end });
				i = ident.end;
				continue;
			}
			if (word === "end") {
				const top = blocks.pop();
				if (top && top.kind === "function") {
					functions.push({
						name: top.name,
						start: top.start,
						bodyStart: top.bodyStart,
						end: i,
						endEnd: ident.end,
					});
				}
				i = ident.end;
				continue;
			}
			i = ident.end;
			continue;
		}
		i++;
	}

	return functions;
}

/**
 * Innermost named function whose span contains `offset`.
 * An anonymous function under the cursor yields null.
 *
 * @param {string} source
 * @param {number} offset
 * @returns {{ name: string, start: number, bodyStart: number, end: number, endEnd: number }|null}
 */
function functionAtOffset(source, offset) {
	const functions = scanFunctions(source);
	let best = null;
	for (const fn of functions) {
		if (offset < fn.start || offset >= fn.endEnd) {
			continue;
		}
		if (!best || (fn.start >= best.start && fn.endEnd <= best.endEnd)) {
			best = fn;
		}
	}
	if (!best || !best.name) {
		return null;
	}
	return best;
}

/**
 * A `LUAVIRTUALIZER(...)` call that is the first statement of the function at
 * `bodyStart`. The engine only honors that first statement, so a second marker
 * would be left as a real call.
 *
 * @param {string} source
 * @param {number} bodyStart
 * @returns {{ start: number, end: number }|null}
 */
function leadingDecorator(source, bodyStart) {
	const at = skipSpaceAndComments(source, bodyStart);
	const ident = readIdent(source, at);
	if (!ident || ident.text.toLowerCase() !== "luavirtualizer") {
		return null;
	}
	const paren = skipSpaceAndComments(source, ident.end);
	if (source[paren] !== "(") {
		return null;
	}
	return { start: at, end: skipBalancedParen(source, paren) };
}

/**
 * Copy `source` and mark every named function. The selected function is virtualized
 * in `mode` with ENABLE(ALL). Every other named function is VM(NONE) and DISABLE(ALL).
 * An existing leading marker is replaced so it is not executed later.
 *
 * @param {string} source
 * @param {{ name: string, start: number }} selected
 * @param {string} mode `vm`, `fsm`, `weave`, or `flat`
 * @returns {string|null}
 */
function decorateNamedFunctions(source, selected, mode) {
	const token = vmToken(mode);
	const functions = scanFunctions(source);
	const target = functions.find((fn) => fn.name === selected.name && fn.start === selected.start);
	if (!target) {
		return null;
	}

	const edits = [];
	for (const fn of functions) {
		if (!fn.name) {
			continue;
		}
		const marker = fn.start === target.start
			? `LUAVIRTUALIZER(VM(${token}), ENABLE(ALL))`
			: "LUAVIRTUALIZER(VM(NONE), DISABLE(ALL))";
		const existing = leadingDecorator(source, fn.bodyStart);
		if (existing) {
			edits.push({ at: existing.start, end: existing.end, text: marker });
		} else {
			edits.push({ at: fn.bodyStart, end: fn.bodyStart, text: `\n${marker}\n` });
		}
	}
	edits.sort((a, b) => b.at - a.at);

	let out = source;
	for (const edit of edits) {
		out = `${out.slice(0, edit.at)}${edit.text}${out.slice(edit.end)}`;
	}
	return out;
}

/**
 * Innermost function whose body contains `offset`, including a function that
 * has not been closed with `end` yet. The cursor in the parameter list does
 * not count.
 *
 * @param {string} source
 * @param {number} offset
 * @returns {{ bodyStart: number }|null}
 */
function enclosingFunctionBody(source, offset) {
	const text = String(source || "");
	const limit = Math.max(0, Math.min(Number(offset) || 0, text.length));
	/** @type {Array<{ kind: string, bodyStart: number }>} */
	const blocks = [];
	let i = 0;

	while (i < limit) {
		const skipped = skipLiteral(text, i);
		if (skipped !== i) {
			if (skipped > limit) {
				break;
			}
			i = skipped;
			continue;
		}
		if (!isIdentStart(text[i])) {
			i++;
			continue;
		}
		const ident = readIdent(text, i);
		if (!ident || ident.end > limit) {
			break;
		}
		const word = ident.text;
		if (word === "function") {
			const header = parseFunctionHeader(text, ident.end);
			if (header.bodyStart > limit) {
				break;
			}
			blocks.push({ kind: "function", bodyStart: header.bodyStart });
			i = header.bodyStart;
			continue;
		}
		if (word === "if" || word === "while" || word === "for" || word === "do") {
			blocks.push({ kind: "block", bodyStart: ident.end });
			i = ident.end;
			continue;
		}
		if (word === "end") {
			blocks.pop();
			i = ident.end;
			continue;
		}
		i = ident.end;
	}

	for (let index = blocks.length - 1; index >= 0; index--) {
		if (blocks[index].kind === "function") {
			return blocks[index];
		}
	}
	return null;
}

module.exports = {
	VM_TOKENS,
	scanFunctions,
	functionAtOffset,
	decorateNamedFunctions,
	enclosingFunctionBody,
	skipLiteral,
	isIdentStart,
	isIdentChar,
	readIdent,
};
