// Inline argument summaries and bounded JSON trees for tools without a renderer of their own.

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { TEXT, TREE } from "./symbols.ts";

/** Bounds of a JSON tree. */
export interface JsonTreeOptions {
	maxDepth: number;
	maxLines: number;
	maxScalarLen: number;
}

/** Tree rows and whether a bound cut anything. */
export interface JsonTree {
	lines: string[];
	truncated: boolean;
}

/** Collapsed and expanded bounds, as oh-my-pi uses them. */
export const JSON_TREE_COLLAPSED: JsonTreeOptions = { maxDepth: 2, maxLines: 6, maxScalarLen: 60 };
export const JSON_TREE_EXPANDED: JsonTreeOptions = { maxDepth: 6, maxLines: 200, maxScalarLen: 2000 };

// Containers whose one-line form fits this many characters stay on one row.
const INLINE_LEN = 60;

/** Cut plain text to a width, ending in the glyph set's ellipsis when cut. Unlike pi-tui's truncation it adds no escape codes. */
export function clipText(text: string, maxWidth: number): string {
	if (visibleWidth(text) <= maxWidth) return text;
	const ellipsis = TEXT.ellipsis;
	const room = maxWidth - visibleWidth(ellipsis);
	let result = "";
	for (const char of text) {
		if (visibleWidth(result + char) > room) break;
		result += char;
	}
	return `${result}${ellipsis}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A scalar as one short line; containers become their size. */
export function formatScalar(value: unknown, maxLen: number): string {
	if (typeof value === "string") {
		return `"${clipText(value.replace(/\n/g, "\\n").replace(/\t/g, "\\t"), Math.max(1, maxLen))}"`;
	}
	if (Array.isArray(value)) return `[${value.length} items]`;
	if (isRecord(value)) return `{${Object.keys(value).length} keys}`;
	return String(value);
}

/** Arguments as `key=value` pairs within a width; later keys keep a little room so a long value cannot hide them. */
export function formatArgsInline(args: Record<string, unknown>, maxWidth: number): string {
	const keys = Object.keys(args);
	let result = "";
	for (const [index, key] of keys.entries()) {
		const sep = result ? ", " : "";
		const used = visibleWidth(result) + sep.length;
		const reserve = keys.slice(index + 1).reduce((sum, next) => sum + next.length + 7, 0);
		const budget = Math.max(key.length + 4, maxWidth - used - reserve);
		if (used + key.length + 2 > maxWidth) return `${result}${sep}${TEXT.ellipsis}`;
		const piece = `${key}=${formatScalar(args[key], budget - key.length - 3)}`;
		result += sep + clipText(piece, Math.min(budget, maxWidth - used));
	}
	return result;
}

function scalarColor(value: unknown): ThemeColor {
	if (typeof value === "string") return "syntaxString";
	if (typeof value === "number") return "syntaxNumber";
	if (typeof value === "boolean") return "syntaxKeyword";
	return "dim";
}

function inlineForm(value: unknown): string | undefined {
	if (!Array.isArray(value) && !isRecord(value)) return undefined;
	let text: string;
	try {
		text = JSON.stringify(value);
	} catch {
		return undefined;
	}
	return text.length <= INLINE_LEN ? text : undefined;
}

/** A JSON value as tree rows with `├─`/`└─` connectors, cut at the given bounds. */
export function renderJsonTree(value: unknown, theme: Theme, options: JsonTreeOptions): JsonTree {
	const lines: string[] = [];
	let truncated = false;
	const leaf = (entry: unknown): string => {
		const inline = inlineForm(entry);
		if (inline !== undefined) return theme.fg("muted", inline);
		return theme.fg(scalarColor(entry), formatScalar(entry, options.maxScalarLen));
	};

	const walk = (node: Record<string, unknown> | unknown[], prefix: string, depth: number): void => {
		const entries = Array.isArray(node) ? node.map((child, index) => [String(index), child] as const) : Object.entries(node);
		for (const [index, [key, child]] of entries.entries()) {
			if (lines.length >= options.maxLines) {
				truncated = true;
				return;
			}
			const last = index === entries.length - 1;
			const label = `${theme.fg("dim", `${prefix}${last ? TREE.last : TREE.branch} `)}${theme.fg(Array.isArray(node) ? "dim" : "muted", key)}`;
			const container = (Array.isArray(child) || isRecord(child)) && inlineForm(child) === undefined;
			if (!container) {
				lines.push(`${label}: ${leaf(child)}`);
				continue;
			}
			lines.push(`${label}: ${theme.fg("dim", formatScalar(child, 0))}`);
			if (depth >= options.maxDepth) {
				truncated = true;
				continue;
			}
			walk(child as Record<string, unknown> | unknown[], `${prefix}${last ? "   " : `${TREE.vertical}  `}`, depth + 1);
		}
	};

	if (Array.isArray(value) || isRecord(value)) walk(value, "", 1);
	else lines.push(leaf(value));
	return { lines, truncated };
}
