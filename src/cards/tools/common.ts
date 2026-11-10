// Helpers the tool cards share: reading arguments and results, and splitting pi's trailing notices off output.

import type { CardInput, CardResult } from "../card.ts";
import { displayPath } from "../format.ts";

/** A string argument, or undefined when the model sent something else or it has not streamed yet. */
export function stringArg(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === "string" ? value : undefined;
}

/** A finite number argument, accepting numeric strings as models sometimes send them. */
export function numberArg(args: Record<string, unknown>, key: string): number | undefined {
	const value = args[key];
	const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

/** The text blocks of a result joined, or undefined before there is a result. */
export function resultText(result: CardResult | undefined): string | undefined {
	if (!result) return undefined;
	return result.content
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

/** Text with pi's trailing `[...]` notice split off, as grep, find, ls and read append it. */
export interface Noticed {
	body: string;
	notice: string | undefined;
}

const NOTICE = /\n\n\[([^\n]*)\]\s*$/;
const NOTICE_WORDS = /limit reached|Showing lines|more lines in file|Use offset=|Full output:|truncated|exceeds/i;

/** Split a trailing notice off pi's output; leaves text alone when its last bracket is content. */
export function splitNotice(text: string): Noticed {
	const match = NOTICE.exec(text);
	if (!match || !NOTICE_WORDS.test(match[1])) return { body: text, notice: undefined };
	return { body: text.slice(0, match.index), notice: match[1] };
}

/** A path argument as the card shows it, or the fallback while it streams in. */
export function pathArg(input: CardInput, key = "path", fallback = "…"): string {
	const path = stringArg(input.args, key);
	return path ? displayPath(path, input.cwd) : fallback;
}

/** Lines of text, dropping one trailing empty line. */
export function lines(text: string): string[] {
	const rows = text.replace(/\r\n/g, "\n").split("\n");
	if (rows.length > 1 && rows.at(-1) === "") rows.pop();
	return rows;
}
