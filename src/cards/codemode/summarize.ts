// Turns what codemode records about a script into short text: call summaries, the script's title and its output.

import { homedir } from "node:os";
import { stripVTControlCharacters } from "node:util";
import { TEXT } from "../symbols.ts";

export interface CallSummary {
	/** What ran: `$` for shell commands, otherwise the tool name. */
	label: string;
	detail: string;
	/** Directory a shell command moved to, when it is not the session's. */
	where?: string;
}

const SCRIPT_HEADER = /^Script (completed|failed)\nWall time ([\d.]+) seconds\nOutput:\n$/;
const OUTPUT_FRAMING = /^(<\/?console_output>|==> text \d+\/\d+ <==)$/;
const OPTIONS_LINE = "// @options:";
/** A leading `cd` or `VAR=value` followed by a separator: setup, not what the command is about. */
const LEADING_CD = /^\s*cd\s+("[^"]*"|'[^']*'|[^\s;&]+)\s*(?:&&|;|\n)\s*/;
const LEADING_ASSIGNMENT = /^\s*[A-Za-z_]\w*=("[^"]*"|'[^']*'|[^\s;&]*)\s*(?:&&|;|\n)\s*/;
const JSON_FIELD = /"([^"\\]+)":(?:"((?:[^"\\]|\\.)*)|(-?\d+(?:\.\d+)?|true|false))/g;
const JSON_ESCAPE = /\\(u[0-9a-fA-F]{4}|.)/g;
const JSON_ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t" };
/** Fields that name what a tool acts on, most telling first. */
const SUBJECT_FIELDS = ["path", "file_path", "url", "query", "pattern"];
const TAIL_CHARS = 2000;

function unescapeJson(text: string): string {
	return text.replace(JSON_ESCAPE, (_, escape: string) =>
		escape.length > 1 ? String.fromCharCode(Number.parseInt(escape.slice(1), 16)) : (JSON_ESCAPES[escape] ?? escape),
	);
}

/**
 * Reads the arguments of a nested call. Codemode keeps the first 200 characters of their JSON, so
 * long arguments end mid-string and are read field by field.
 */
export function parseArgs(preview: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(preview);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return {};
	} catch {
		const fields: Record<string, unknown> = {};
		for (const [, key, text, literal] of preview.matchAll(JSON_FIELD)) {
			if (key in fields) continue;
			fields[key] = text !== undefined ? unescapeJson(text) : literal;
		}
		return fields;
	}
}

function unquote(path: string): string {
	return path.replace(/^["']|["']$/g, "");
}

export function shortenPath(path: string, cwd: string): string {
	if (path === cwd) return ".";
	if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1);
	const home = homedir();
	return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function summarizeCommand(command: string, cwd: string): CallSummary {
	let rest = command;
	let where: string | undefined;
	for (;;) {
		const cd = LEADING_CD.exec(rest);
		const assignment = cd ? null : LEADING_ASSIGNMENT.exec(rest);
		if (!cd && !assignment) break;
		if (cd) where = unquote(cd[1]);
		rest = rest.slice((cd ?? assignment)?.[0].length);
	}
	const lines = rest
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));
	const shortened = where && shortenPath(where, cwd);
	return {
		label: "$",
		// The line-break marker keeps a multi-line command on its row, where the width decides how much of it shows.
		detail: lines.join(TEXT.lineBreak) || command.trim(),
		where: shortened === "." ? undefined : shortened,
	};
}

function describeRange(args: Record<string, unknown>): string {
	if (typeof args.offset !== "number" && typeof args.offset !== "string") return "";
	const limit = Number(args.limit);
	const offset = Number(args.offset);
	return limit && offset ? `:${offset}-${offset + limit - 1}` : `:${args.offset}`;
}

/** `mcp__server__tool` reads as `server › tool`. */
export function displayName(name: string): string {
	const [prefix, server, ...tool] = name.split("__");
	return prefix === "mcp" && server && tool.length > 0 ? `${server}${TEXT.chevron}${tool.join("__")}` : name;
}

function summarizeFields(args: Record<string, unknown>, cwd: string): string {
	const subject = SUBJECT_FIELDS.filter((field) => typeof args[field] === "string");
	const others = Object.keys(args).filter((field) => !SUBJECT_FIELDS.includes(field));
	return [...subject, ...others]
		.map((field) => {
			const value = args[field];
			if (typeof value === "string") {
				return field === "path" || field === "file_path" ? shortenPath(value, cwd) : value;
			}
			return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
		})
		.filter(Boolean)
		.join(TEXT.sep)
		.replace(/\s+/g, " ");
}

/** One-line description of a nested call, from its recorded arguments. */
export function summarizeCall(name: string, preview: string, cwd: string): CallSummary {
	const args = parseArgs(preview);
	if (name === "bash" && typeof args.command === "string") return summarizeCommand(args.command, cwd);
	if (name === "read" && typeof args.path === "string") {
		return { label: "read", detail: shortenPath(args.path, cwd) + describeRange(args) };
	}
	// `models.*` calls record `provider/id` rather than JSON.
	const detail = Object.keys(args).length > 0 ? summarizeFields(args, cwd) : preview === "{}" ? "" : preview;
	return { label: displayName(name), detail };
}

/** The script's opening comment, which says what it is for. */
export function scriptTitle(code: string): string | undefined {
	for (const line of code.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith(OPTIONS_LINE)) continue;
		return /^\/\/\s*(.+)$/.exec(trimmed)?.[1];
	}
	return undefined;
}

export interface ScriptOutput {
	text: string;
	/** Wall time from the result header, in milliseconds. */
	wallTimeMs?: number;
	images: number;
}

/** The output the script produced, without the header and markers that frame it for the model. */
export function parseScriptOutput(content: ReadonlyArray<{ type: string; text?: string }>): ScriptOutput {
	const header = content[0]?.type === "text" ? SCRIPT_HEADER.exec(content[0].text ?? "") : null;
	const items = header ? content.slice(1) : content;
	const text = items
		.filter((item) => item.type === "text")
		.map((item) => item.text ?? "")
		.join("\n")
		.split("\n")
		.filter((line) => !OUTPUT_FRAMING.test(line.trim()))
		.join("\n")
		.trim();
	return {
		text,
		wallTimeMs: header ? Number(header[2]) * 1000 : undefined,
		images: items.filter((item) => item.type === "image").length,
	};
}

/** The last line of a running tool's partial output. */
export function lastOutputLine(content: ReadonlyArray<{ type: string; text?: string }> | undefined): string | undefined {
	const text = (content ?? [])
		.filter((item) => item.type === "text")
		.map((item) => item.text ?? "")
		.join("\n")
		.slice(-TAIL_CHARS);
	const lines = stripVTControlCharacters(text).split(/[\r\n]+/);
	return lines.findLast((line) => line.trim())?.trim();
}

/** Time of one nested call: `176ms` below a second, then `2.1s`. */
export function formatActionTime(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Cents for larger amounts, two significant digits for the fractions of a cent classifier calls cost. */
export function formatCost(cost: number): string {
	return `$${cost >= 0.01 ? cost.toFixed(2) : cost.toPrecision(2)}`;
}
