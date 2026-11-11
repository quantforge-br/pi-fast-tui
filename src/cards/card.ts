// One card per tool call: the call and its result drawn together in a single frame, with a live spinner and timer.

import type { Theme, ThemeColor, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, Container, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { type CardState, type FrameSection, frameContentWidth, renderFrame, stateBg } from "./frame.ts";
import { renderStatusLine, type StatusIcon, type StatusLineOptions } from "./status-line.ts";

/** A tool result as the card reads it. */
export interface CardResult {
	content: ReadonlyArray<{ type: string; text?: string }>;
	details: unknown;
}

/** What a card spec gets to build its snapshot from. */
export interface CardInput {
	/** The call's arguments; streamed arguments can be partial, and models send anything, so read them defensively. */
	args: Record<string, unknown>;
	result: CardResult | undefined;
	phase: CardState;
	isPartial: boolean;
	isError: boolean;
	expanded: boolean;
	executionStarted: boolean;
	argsComplete: boolean;
	/** Live while the call runs, final once it settles; undefined before it starts. */
	elapsedMs: number | undefined;
	cwd: string;
	/** Id of this tool call; nested calls of a codemode script are keyed by it. */
	toolCallId: string;
	/** Current spinner frame while the call runs, for cards that animate rows of their own. */
	spinnerFrame: number | undefined;
	/** The configured expand key with its description, styled, such as `ctrl+o to expand`. */
	expandHint: string;
	/** Width for body lines inside the card. */
	contentWidth: number;
	/** Width for body rows of an inline card. */
	inlineWidth: number;
	theme: Theme;
	/** What another renderer in the chain would draw for this call, for cards that wrap it. */
	base: BaseComponents;
}

/** Components of the next renderer in the chain, already rendered for this call. */
export interface BaseComponents {
	call: Component | undefined;
	result: Component | undefined;
}

/** What a card draws. */
export interface CardSnapshot {
	/** `framed` draws the rounded frame; `inline` draws the header with the body under it. */
	variant: "framed" | "inline";
	status: Omit<StatusLineOptions, "icon" | "spinnerFrame"> & { icon?: StatusIcon };
	headerMeta?: string;
	footerMeta?: string;
	sections?: FrameSection[];
	/** Overrides the state derived from the call's lifecycle, as for a warning. */
	state?: CardState;
	borderColor?: ThemeColor;
}

/** Builds a card for one tool. */
export type CardBuilder = (input: CardInput) => CardSnapshot;

/** Lifecycle flags the last render pass reported. */
interface View {
	isPartial: boolean;
	isError: boolean;
	expanded: boolean;
	executionStarted: boolean;
	argsComplete: boolean;
	durationMs: number | undefined;
	cwd: string;
	toolCallId: string;
	outputPad: number;
	args: unknown;
	expandHint: string;
}

/** Row state shared by renderCall and renderResult through the render context. */
interface RowState {
	view?: View;
	result?: CardResult;
	baseCall?: Component;
	baseResult?: Component;
	startedAt?: number;
	endedAt?: number;
	interval?: ReturnType<typeof setInterval>;
	lastRenderAt?: number;
	invalidate?: () => void;
	version?: number;
}

type RenderCall = NonNullable<ToolRenderers["renderCall"]>;
type RenderResult = NonNullable<ToolRenderers["renderResult"]>;
type Context = Parameters<RenderCall>[2];

/** Spinner frame period, and how often a running card redraws. */
export const TICK_MS = 100;
// A row that has not been drawn for this long is gone from the transcript, so its timer stops.
const STALE_MS = 5_000;

/** Renderers that draw every call of a tool as one card. `base` is what the next renderer in the chain would use. */
export function createCardRenderers(build: CardBuilder, base?: ToolRenderers): ToolRenderers {
	const renderCall: RenderCall = (args, theme, context) => {
		const state = rowState(context);
		state.view = viewOf(context);
		state.invalidate = context.invalidate;
		state.version = (state.version ?? 0) + 1;
		state.baseCall = callBase(base, args, theme, context, state);
		tick(state, context);
		return context.lastComponent instanceof Card ? context.lastComponent : new Card(state, build, theme);
	};
	const renderResult: RenderResult = (result, options, theme, context) => {
		const state = rowState(context);
		state.result = { content: result.content, details: result.details };
		state.view = viewOf(context);
		state.version = (state.version ?? 0) + 1;
		state.baseResult = resultBase(base, result, options, theme, context, state);
		// The card drawn by renderCall shows the result, so this slot stays empty.
		return context.lastComponent instanceof Container ? context.lastComponent : new Container();
	};
	return { renderShell: "self", renderCall, renderResult };
}

function rowState(context: Context): RowState {
	return context.state as RowState;
}

function viewOf(context: Context): View {
	return {
		isPartial: context.isPartial,
		isError: context.isError,
		expanded: context.expanded,
		executionStarted: context.executionStarted,
		argsComplete: context.argsComplete,
		durationMs: context.durationMs,
		cwd: context.cwd,
		toolCallId: context.toolCallId,
		outputPad: context.outputPad,
		args: context.args,
		expandHint: context.keyHint("app.tools.expand", "to expand"),
	};
}

function callBase(base: ToolRenderers | undefined, args: unknown, theme: Theme, context: Context, state: RowState): Component | undefined {
	if (!base?.renderCall) return undefined;
	try {
		return base.renderCall(args, theme, { ...context, lastComponent: state.baseCall });
	} catch {
		return undefined;
	}
}

function resultBase(
	base: ToolRenderers | undefined,
	result: Parameters<RenderResult>[0],
	options: Parameters<RenderResult>[1],
	theme: Theme,
	context: Context,
	state: RowState,
): Component | undefined {
	if (!base?.renderResult) return undefined;
	try {
		return base.renderResult(result, options, theme, { ...context, lastComponent: state.baseResult });
	} catch {
		return undefined;
	}
}

/** Starts the row's clock and redraw timer while the call runs, and stops both once it settles. */
function tick(state: RowState, context: Context): void {
	const now = Date.now();
	// A row first drawn settled, as after a reload, has no clock of its own: its time comes from the result.
	if (context.executionStarted && context.isPartial) state.startedAt ??= now;
	const running = context.executionStarted && context.isPartial && !context.isError;
	if (running) {
		if (!state.interval) {
			state.lastRenderAt = now;
			state.interval = setInterval(() => {
				if (Date.now() - (state.lastRenderAt ?? 0) > STALE_MS) stopTimer(state);
				else state.invalidate?.();
			}, TICK_MS);
			state.interval.unref?.();
		}
		return;
	}
	if (state.startedAt !== undefined && !context.isPartial) state.endedAt ??= now;
	stopTimer(state);
}

function stopTimer(state: RowState): void {
	if (!state.interval) return;
	clearInterval(state.interval);
	state.interval = undefined;
}

/** Whether a row's redraw timer is running; for tests. */
export function hasTimer(state: object): boolean {
	return (state as RowState).interval !== undefined;
}

function phaseOf(view: View, result: CardResult | undefined): CardState {
	if (view.isError) return "error";
	if (result && !view.isPartial) return "success";
	return view.executionStarted || result ? "running" : "pending";
}

function elapsedOf(view: View, state: RowState): number | undefined {
	if (!view.isPartial && view.durationMs !== undefined) return view.durationMs;
	if (state.startedAt === undefined) return undefined;
	return (state.endedAt ?? Date.now()) - state.startedAt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const DEFAULT_ICON: Record<CardState, StatusIcon> = {
	pending: "pending",
	running: "running",
	success: "success",
	warning: "warning",
	error: "error",
};

/** The card itself. It reads the row state when drawn, so the result that renderResult stores after it is built shows up. */
class Card implements Component {
	private readonly state: RowState;
	private readonly build: CardBuilder;
	private readonly theme: Theme;
	private cacheKey = "";
	private cache: string[] = [];

	constructor(state: RowState, build: CardBuilder, theme: Theme) {
		this.state = state;
		this.build = build;
		this.theme = theme;
	}

	invalidate(): void {
		this.cacheKey = "";
	}

	render(width: number): string[] {
		const { state } = this;
		state.lastRenderAt = Date.now();
		const view = state.view;
		if (!view) return [];
		const phase = phaseOf(view, state.result);
		const running = phase === "running" && state.interval !== undefined;
		const frame = running ? Math.floor(Date.now() / TICK_MS) : 0;
		const key = `${width}:${state.version}:${frame}`;
		if (key === this.cacheKey) return this.cache;

		const pad = Math.max(0, Math.min(view.outputPad, Math.floor((width - 1) / 2)));
		const inner = Math.max(1, width - pad * 2);
		const input: CardInput = {
			args: isRecord(view.args) ? view.args : {},
			result: state.result,
			phase,
			isPartial: view.isPartial,
			isError: view.isError,
			expanded: view.expanded,
			executionStarted: view.executionStarted,
			argsComplete: view.argsComplete,
			elapsedMs: elapsedOf(view, state),
			cwd: view.cwd,
			toolCallId: view.toolCallId,
			spinnerFrame: running ? frame : undefined,
			expandHint: view.expandHint,
			contentWidth: frameContentWidth(inner),
			inlineWidth: inner,
			theme: this.theme,
			base: { call: state.baseCall, result: state.baseResult },
		};
		const snapshot = this.build(input);
		const cardState = snapshot.state ?? phase;
		const icon = snapshot.status.icon ?? DEFAULT_ICON[cardState];
		const header = renderStatusLine({ ...snapshot.status, icon, spinnerFrame: running ? frame : undefined }, this.theme);
		const lines =
			snapshot.variant === "framed"
				? renderFrame(
						{
							width: inner,
							header,
							headerMeta: snapshot.headerMeta,
							footerMeta: snapshot.footerMeta,
							state: cardState,
							sections: snapshot.sections,
							applyBg: true,
							borderColor: snapshot.borderColor,
						},
						this.theme,
					)
				: this.inline(header, snapshot, cardState, inner);
		const margin = " ".repeat(pad);
		this.cache = lines.map((line) => `${margin}${line}${margin}`);
		this.cacheKey = key;
		return this.cache;
	}

	private inline(header: string, snapshot: CardSnapshot, state: CardState, width: number): string[] {
		const rows = [snapshot.headerMeta ? `${header} ${snapshot.headerMeta}` : header];
		for (const section of snapshot.sections ?? []) {
			if (section.label) rows.push(this.theme.fg("dim", section.label));
			rows.push(...section.lines.flatMap((line) => line.split("\n")));
		}
		if (snapshot.footerMeta) rows.push(snapshot.footerMeta);
		const bg = this.theme.getBgAnsi(stateBg(state));
		return rows
			.flatMap((row) => wrapTextWithAnsi(row.replace(/\t/g, "   ").trimEnd(), width))
			.map((row) => {
				const padded = `${row}${" ".repeat(Math.max(0, width - visibleWidth(row)))}`;
				return `${bg}${padded.replace(/\x1b\[(?:0|49)?m/g, (reset) => `${reset}${bg}`)}\x1b[49m`;
			});
	}
}
