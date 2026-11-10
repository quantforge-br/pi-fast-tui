// Drives renderers the way pi's tool row does: renderCall, then renderResult, then draws the call slot.

import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { plain, theme } from "./helpers.ts";

type Context = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];

/** One tool row: its shared state and lifecycle flags. */
export interface Row {
	state: Record<string, unknown>;
	args: unknown;
	executionStarted: boolean;
	argsComplete: boolean;
	isPartial: boolean;
	isError: boolean;
	expanded: boolean;
	durationMs?: number;
	result?: { content: { type: "text"; text: string }[]; details?: unknown };
	invalidations: number;
	callComponent?: Component;
	resultComponent?: Component;
}

/** A fresh row for the given arguments, before execution starts. */
export function newRow(args: unknown): Row {
	return { state: {}, args, executionStarted: false, argsComplete: false, isPartial: true, isError: false, expanded: false, invalidations: 0 };
}

function context(row: Row, lastComponent: Component | undefined): Context {
	return {
		args: row.args,
		toolCallId: "call-1",
		invalidate: () => {
			row.invalidations++;
		},
		lastComponent,
		state: row.state,
		cwd: "/project",
		executionStarted: row.executionStarted,
		argsComplete: row.argsComplete,
		isPartial: row.isPartial,
		expanded: row.expanded,
		showImages: false,
		isError: row.isError,
		durationMs: row.isPartial ? undefined : row.durationMs,
		outputPad: 1,
		keyText: () => "ctrl+o",
		keyHint: (_id: string, description: string) => `ctrl+o ${description}`,
	} as unknown as Context;
}

/** Run one render pass and return the drawn call slot, without escape codes. */
export function draw(renderers: ToolRenderers, row: Row, width = 60): string {
	row.callComponent = renderers.renderCall?.(row.args, theme, context(row, row.callComponent));
	if (row.result) {
		row.resultComponent = renderers.renderResult?.(
			{ content: row.result.content, details: row.result.details },
			{ expanded: row.expanded, isPartial: row.isPartial },
			theme,
			context(row, row.resultComponent),
		);
	}
	const lines = [...(row.callComponent?.render(width) ?? []), ...(row.resultComponent?.render(width) ?? [])];
	return plain(lines);
}

/** Text content block. */
export function text(value: string): { type: "text"; text: string } {
	return { type: "text", text: value };
}
