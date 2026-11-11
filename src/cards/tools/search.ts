// Grep, find and ls cards: an inline header with counts, and results as a tree grouped by file.

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { CardBuilder, CardInput, CardSnapshot } from "../card.ts";
import { plural } from "../format.ts";
import { TEXT, TREE } from "../symbols.ts";
import { wrapHanging } from "../wrap.ts";
import { lines, pathArg, resultText, splitNotice, stringArg } from "./common.ts";

/** Result rows a collapsed search card shows. */
export const SEARCH_PREVIEW_LINES = 8;

/** One grep line: a match or a context line around one. */
export interface GrepLine {
	line: number;
	text: string;
	match: boolean;
}

/** Grep results of one file. */
export interface GrepFile {
	path: string;
	lines: GrepLine[];
}

// pi prints matches as `path:12: text` and context as `path-12- text`.
const GREP_ROW = /^(.*?)(?::(\d+): |-(\d+)- )(.*)$/;

/** Group pi's grep output by file; undefined when a row does not parse, so the raw text is shown instead. */
export function parseGrep(text: string): GrepFile[] | undefined {
	const files: GrepFile[] = [];
	for (const row of lines(text)) {
		if (row === "" || row === "--") continue;
		const parsed = GREP_ROW.exec(row);
		if (!parsed) return undefined;
		const [, path, matchLine, contextLine, body] = parsed;
		const entry = { line: Number(matchLine ?? contextLine), text: body, match: matchLine !== undefined };
		const last = files.at(-1);
		if (last?.path === path) last.lines.push(entry);
		else files.push({ path, lines: [entry] });
	}
	return files;
}

function grepTree(files: GrepFile[], theme: Theme, expanded: boolean, expandHint: string, rowWidth: number): string[] {
	const width = String(Math.max(...files.flatMap((file) => file.lines.map((line) => line.line)))).length;
	const rows: string[] = [];
	let shown = 0;
	const total = files.reduce((sum, file) => sum + file.lines.filter((line) => line.match).length, 0);
	const rail = `${theme.fg("dim", TREE.vertical)}  `;
	const gutterRail = `${theme.fg("dim", TREE.vertical)} `;
	const blankGutter = `${rail}${" ".repeat(width + 1)}${gutterRail}`;
	for (const file of files) {
		if (!expanded && rows.length >= SEARCH_PREVIEW_LINES) break;
		rows.push(wrapHanging(`${theme.fg("dim", TREE.branch)} `, theme.fg("accent", file.path), rowWidth, rail));
		for (const line of file.lines) {
			if (!expanded && rows.length >= SEARCH_PREVIEW_LINES) break;
			const number = String(line.line).padStart(width);
			const marker = line.match ? theme.fg("accent", "*") : " ";
			const body = theme.fg(line.match ? "toolOutput" : "dim", line.text);
			rows.push(wrapHanging(`${rail}${marker}${theme.fg("dim", number)}${gutterRail}`, body, rowWidth, blankGutter));
			if (line.match) shown++;
		}
	}
	if (shown < total) {
		rows.push(`${theme.fg("dim", `${TREE.last} ${TEXT.ellipsis} ${plural(total - shown, "more match", "more matches")} (`)}${expandHint}${theme.fg("dim", ")")}`);
	}
	return rows;
}

function listTree(
	items: string[],
	theme: Theme,
	expanded: boolean,
	expandHint: string,
	rowWidth: number,
	style: (item: string) => string,
): string[] {
	const shown = expanded ? items : items.slice(0, SEARCH_PREVIEW_LINES);
	const rows = shown.map((item, index) => {
		const last = index === shown.length - 1 && shown.length === items.length;
		const continuation = last ? "   " : `${theme.fg("dim", TREE.vertical)}  `;
		return wrapHanging(`${theme.fg("dim", last ? TREE.last : TREE.branch)} `, style(item), rowWidth, continuation);
	});
	const hidden = items.length - shown.length;
	if (hidden > 0) rows.push(`${theme.fg("dim", `${TREE.last} ${TEXT.ellipsis} ${hidden} more (`)}${expandHint}${theme.fg("dim", ")")}`);
	return rows;
}

/** Shared shape of a search card: errors, empty results and notices. */
function searchCard(
	input: CardInput,
	title: string,
	description: string,
	empty: RegExp,
	body: (text: string) => { meta: string | undefined; rows: string[] },
): CardSnapshot {
	const { theme } = input;
	const status = { title, description };
	const text = resultText(input.result);
	if (text === undefined || input.isPartial) return { variant: "inline", status };
	if (input.isError) return { variant: "inline", status, sections: [{ lines: lines(text).map((line) => `  ${theme.fg("error", line)}`) }] };
	const { body: output, notice } = splitNotice(text);
	if (empty.test(output.trim())) return { variant: "inline", status, headerMeta: theme.fg("dim", output.trim()) };
	const drawn = body(output);
	const rows = notice ? [...drawn.rows, theme.fg("warning", `  ${notice}`)] : drawn.rows;
	return { variant: "inline", status, headerMeta: drawn.meta ? theme.fg("dim", drawn.meta) : undefined, sections: [{ lines: rows }], state: notice ? "warning" : undefined };
}

function where(input: CardInput, pattern: string): string {
	const path = stringArg(input.args, "path");
	return path ? `${pattern} in ${pathArg(input)}` : pattern;
}

/** Draws a grep call. */
export const grepCard: CardBuilder = (input) => {
	const pattern = stringArg(input.args, "pattern") ?? TEXT.ellipsis;
	const glob = stringArg(input.args, "glob");
	const description = glob ? `${where(input, pattern)} (${glob})` : where(input, pattern);
	return searchCard(input, "Grep", description, /^No matches found$/, (text) => {
		const files = parseGrep(text);
		if (!files) return { meta: undefined, rows: lines(text).map((line) => input.theme.fg("toolOutput", line)) };
		const matches = files.reduce((sum, file) => sum + file.lines.filter((line) => line.match).length, 0);
		return {
			meta: `${plural(matches, "match", "matches")}${TEXT.sep}${plural(files.length, "file")}`,
			rows: grepTree(files, input.theme, input.expanded, input.expandHint, input.inlineWidth),
		};
	});
};

/** Draws a find call. */
export const findCard: CardBuilder = (input) => {
	const pattern = stringArg(input.args, "pattern") ?? TEXT.ellipsis;
	return searchCard(input, "Find", where(input, pattern), /^No files found/, (text) => {
		const items = lines(text).filter(Boolean);
		return { meta: plural(items.length, "file"), rows: listTree(items, input.theme, input.expanded, input.expandHint, input.inlineWidth, (item) => input.theme.fg("toolOutput", item)) };
	});
};

/** Draws an ls call. */
export const lsCard: CardBuilder = (input) => {
	const { theme } = input;
	return searchCard(input, "Ls", pathArg(input, "path", "."), /^\(empty directory\)$/, (text) => {
		const items = lines(text).filter(Boolean);
		const style = (item: string) => (item.endsWith("/") ? theme.fg("accent", item) : theme.fg("toolOutput", item));
		return { meta: plural(items.length, "entry", "entries"), rows: listTree(items, theme, input.expanded, input.expandHint, input.inlineWidth, style) };
	});
};
