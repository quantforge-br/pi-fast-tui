// Bash card: the command, its output following the tail, and wall time, timeout and exit code in the bottom border.

import type { CardBuilder } from "../card.ts";
import type { FrameSection } from "../frame.ts";
import { formatDuration } from "../format.ts";
import { formatOutputPane, splitTerminalLines } from "../output-pane.ts";
import { SEP } from "../symbols.ts";
import { lines, numberArg, resultText, stringArg } from "./common.ts";

/** Output rows a collapsed bash card shows. */
export const BASH_PREVIEW_LINES = 10;

/** What pi appends to bash output, parsed. */
export interface BashOutcome {
	output: string;
	exitCode: number | undefined;
	/** `timed out`, `aborted` or another one-line status. */
	note: string | undefined;
	/** Where pi saved the full output when it cut it. */
	fullOutputPath: string | undefined;
	truncated: string | undefined;
}

const EXIT = /(?:^|\n\n)Command exited with code (\d+)\s*$/;
const STATUS = /(?:^|\n\n)(Command (?:timed out after \d+ seconds[^\n]*|aborted|terminated without an exit code))\s*$/;
const TRUNCATION = /(?:^|\n\n)\[(Showing [^\n]*?)\. Full output: ([^\n\]]+)\]\s*$/;

/** Split pi's bash result into the command's own output and the facts pi appended to it. */
export function parseBashOutput(text: string): BashOutcome {
	let output = text;
	let exitCode: number | undefined;
	let note: string | undefined;
	const exit = EXIT.exec(output);
	if (exit) {
		exitCode = Number(exit[1]);
		output = output.slice(0, exit.index);
	} else {
		const status = STATUS.exec(output);
		if (status) {
			note = status[1].startsWith("Command timed out") ? "timed out" : status[1].replace(/^Command /, "");
			output = output.slice(0, status.index);
		}
	}
	let fullOutputPath: string | undefined;
	let truncated: string | undefined;
	const cut = TRUNCATION.exec(output);
	if (cut) {
		truncated = cut[1];
		fullOutputPath = cut[2];
		output = output.slice(0, cut.index);
	}
	return { output, exitCode, note, fullOutputPath, truncated };
}

/** Draws a bash call. */
export const bashCard: CardBuilder = (input) => {
	const { theme } = input;
	const command = stringArg(input.args, "command") ?? "";
	const timeout = numberArg(input.args, "timeout");
	const text = resultText(input.result);
	const outcome = text === undefined ? undefined : parseBashOutput(text);
	const output = outcome?.output.trimEnd() ?? "";

	const commandLines = lines(command || " ").map((line, index) => `${theme.fg("dim", index === 0 ? "$" : " ")} ${theme.fg("text", line)}`);
	const sections: FrameSection[] = [{ lines: commandLines }];
	if (output) {
		const pane = formatOutputPane(
			{
				lines: splitTerminalLines(output),
				expanded: input.expanded,
				collapsedMaxLines: BASH_PREVIEW_LINES,
				edge: "tail",
				styleLine: (line) => theme.fg(input.isError ? "error" : "toolOutput", line),
				expandHint: input.expandHint,
			},
			theme,
		);
		sections.push({ label: theme.fg("dim", "Output"), lines: pane.lines });
	} else if (outcome && !input.isPartial) {
		sections.push({ lines: [theme.fg("dim", "(no output)")] });
	}
	if (outcome?.truncated) {
		sections.push({ lines: [theme.fg("warning", `${outcome.truncated}. Full output: ${outcome.fullOutputPath}`)] });
	}

	const facts: string[] = [];
	if (input.elapsedMs !== undefined) facts.push(`Wall: ${formatDuration(input.elapsedMs)}`);
	if (timeout !== undefined) facts.push(`Timeout: ${timeout}s`);
	if (outcome?.exitCode !== undefined && outcome.exitCode !== 0) facts.push(theme.fg("error", `Exit: ${outcome.exitCode}`));
	if (outcome?.note) facts.push(theme.fg(outcome.note === "aborted" ? "warning" : "error", outcome.note));

	return {
		variant: "framed",
		status: { title: "Bash" },
		footerMeta: facts.length > 0 ? theme.fg("dim", facts.join(SEP)) : undefined,
		sections,
		state: outcome?.note === "aborted" ? "warning" : undefined,
	};
};
