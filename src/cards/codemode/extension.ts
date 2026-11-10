// Wires codemode into the extension: follows nested calls for live progress and diffs, and asks the model to title its scripts.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CardBuilder } from "../card.ts";
import { createCodemodeCard } from "./card.ts";
import { CHANGES_ENTRY, ChangeLog, readChange } from "./changes.ts";
import { LiveCalls } from "./live.ts";
import { lastOutputLine } from "./summarize.ts";

/** Name of pi's codemode tool. */
export const CODEMODE_TOOL_NAME = "codemode";

const TITLE_GUIDELINE =
	"Start every codemode script with a one-line `// <what this script does>` comment in the language the user writes in. The user sees it as the script's title. A `// @options:` line, when used, stays first and the comment follows it.";

/** Subscribes to the events the codemode card needs and returns its builder. */
export function setupCodemode(pi: ExtensionAPI): CardBuilder {
	const live = new LiveCalls();
	const changes = new ChangeLog();

	pi.on("session_start", (_event, ctx) => changes.restore(ctx.sessionManager.getEntries()));

	pi.on("before_agent_start", (event) => {
		// A named section is patched into the transcript, so the model's cached prefix survives.
		const { sections } = event.systemPromptOptions;
		if (pi.getActiveTools().includes(CODEMODE_TOOL_NAME)) sections.codemode_titles = TITLE_GUIDELINE;
		else delete sections.codemode_titles;
	});

	pi.on("tool_execution_start", (event) => {
		if (event.parentToolCallId) live.start(event.parentToolCallId, event.toolCallId, event.toolName, event.args);
	});
	pi.on("tool_execution_update", (event) => {
		if (event.parentToolCallId) live.update(event.parentToolCallId, event.toolCallId, lastOutputLine(event.partialResult?.content));
	});
	pi.on("tool_execution_end", (event, ctx) => {
		if (event.parentToolCallId) {
			const call = live.end(event.parentToolCallId, event.toolCallId);
			const change = event.isError ? undefined : readChange(event.toolName, call?.args, event.result, ctx.cwd);
			if (change) changes.record(event.parentToolCallId, event.toolCallId, change);
		} else if (event.toolName === CODEMODE_TOOL_NAME) {
			live.clear(event.toolCallId);
			const entry = changes.entry(event.toolCallId);
			if (entry) pi.appendEntry(CHANGES_ENTRY, entry);
		}
	});

	return createCodemodeCard(live, changes);
}
