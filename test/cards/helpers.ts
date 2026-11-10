// Shared test helpers: a theme that tags each color with its own escape code, and ANSI stripping.

import { stripVTControlCharacters } from "node:util";
import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";

// highlightCode and renderDiff read pi's global theme.
initTheme("dark");

const codes = new Map<string, number>();

/** The 256-color index the test theme uses for a token. */
export function colorCode(token: string): number {
	let code = codes.get(token);
	if (code === undefined) {
		code = 16 + codes.size;
		codes.set(token, code);
	}
	return code;
}

/** Escape sequence the test theme emits for a token. */
export function fgOf(token: string): string {
	return `\x1b[38;5;${colorCode(token)}m`;
}

/** A theme whose colors are distinct escape codes, so tests can tell which token painted what. */
export const theme = {
	fg: (token: string, text: string) => `${fgOf(token)}${text}\x1b[39m`,
	bg: (token: string, text: string) => `\x1b[48;5;${colorCode(token)}m${text}\x1b[49m`,
	getBgAnsi: (token: string) => `\x1b[48;5;${colorCode(token)}m`,
	bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
	italic: (text: string) => text,
	underline: (text: string) => text,
	inverse: (text: string) => text,
} as unknown as Theme;

/** Lines without escape codes or trailing spaces. */
export function plain(lines: readonly string[]): string {
	return lines.map((line) => stripVTControlCharacters(line).trimEnd()).join("\n");
}
