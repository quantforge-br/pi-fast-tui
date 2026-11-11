// Hanging wrap for card rows made of a prefix and text: wrapped rows start under the text, not under the prefix.

import { visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Below this many text columns the hanging wrap is skipped. */
export const MIN_HANGING_ROOM = 8;

/**
 * Wraps `text` to the columns left after `prefix` and returns the rows joined with "\n".
 * The first row starts with `prefix`, every other row with `continuation`, which must be
 * as wide as `prefix`.
 */
export function wrapHanging(prefix: string, text: string, width: number, continuation?: string): string {
	const body = text.replace(/\t/g, "   ").trimEnd();
	const prefixWidth = visibleWidth(prefix);
	const room = width - prefixWidth;
	if (room < MIN_HANGING_ROOM) return prefix + body;
	const rows = wrapTextWithAnsi(body, room);
	if (rows.length === 0) return prefix;
	const indent = continuation ?? " ".repeat(prefixWidth);
	return rows.map((row, index) => (index === 0 ? prefix : indent) + row).join("\n");
}
