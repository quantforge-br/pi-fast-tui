import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component, Container, EditorComponent, TUI } from "@earendil-works/pi-tui";
import { CURSOR_MARKER, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { CursorStyle, EditorShape } from "./config.ts";
import { canEmbedInlineFooter, getEditorShapeStyle, type EditorShapeStyle, type FrameGlyphs } from "./editor-shapes.ts";
import { findBottomBorderIndex, isEditorBorderLine, stripAnsi } from "./utils.ts";

function fillLine(content: string, width: number): string {
	const truncated = truncateToWidth(content, Math.max(0, width), "");
	const pad = " ".repeat(Math.max(0, width - visibleWidth(truncated)));
	return `${truncated}${pad}`;
}

const CURSOR_STYLE_SEQUENCES: Partial<Record<CursorStyle, string>> = {
	bar: "\x1b[6 q",
	underline: "\x1b[4 q",
};
const DEFAULT_CURSOR_STYLE_SEQUENCE = "\x1b[0 q";

type EditorFactory = NonNullable<Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]>;

interface WorkingStatusIndicator {
	renderInBorder(width: number): string;
	renderSpinnerInBorder(width: number): string;
}

export interface InlineFooterLine {
	left: string;
	right: string;
}

export interface InlineFooterRenderer {
	enabled(): boolean;
	render(width: number): { top: InlineFooterLine; bottom: InlineFooterLine } | undefined;
	/** Model summary for the info row of panel shapes when the footer is not embedded. */
	renderInfo?(width: number): string | undefined;
}

interface HiddenThinkingLabelComponent {
	children: unknown[];
	outputPad?: unknown;
	render(width: number): string[];
	setHiddenThinkingLabel(label: string): void;
	setHideThinkingBlock(hide: boolean): void;
	updateContent(message: unknown, isStreaming?: boolean): void;
}

function isHiddenThinkingLabelComponent(value: object): value is HiddenThinkingLabelComponent {
	const component = value as unknown as Record<string, unknown>;
	return Array.isArray(component.children)
		&& typeof component.render === "function"
		&& typeof component.setHiddenThinkingLabel === "function"
		&& typeof component.setHideThinkingBlock === "function"
		&& typeof component.updateContent === "function";
}

/** Ponytail until Pi exposes a per-message hidden-thinking label API. */
function findLatestHiddenThinkingLabel(tui: TUI): HiddenThinkingLabelComponent {
	const pending: unknown[] = [tui];
	const visited = new Set<object>();
	let latest: HiddenThinkingLabelComponent | undefined;
	while (pending.length > 0) {
		const value = pending.pop();
		if (!value || typeof value !== "object" || visited.has(value)) continue;
		visited.add(value);
		if (isHiddenThinkingLabelComponent(value)) latest = value;
		const children = (value as { children?: unknown }).children;
		if (!Array.isArray(children)) continue;
		for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
	}
	if (!latest) throw new Error("Unable to find the active hidden-thinking component");
	return latest;
}

/** Width Pi's hidden-thinking `Text(label, outputPad, 0)` wraps at when its message renders at `width`. */
function hiddenThinkingTextWidth(width: number, outputPad: unknown): number {
	const pad = typeof outputPad === "number" && Number.isFinite(outputPad) ? Math.max(0, Math.floor(outputPad)) : 1;
	const paddingX = Math.min(pad, Math.max(0, Math.floor((width - 1) / 2)));
	return Math.max(1, width - paddingX * 2);
}

// pi-tui's renderFakeCursor() markers (FAKE_CURSOR_START/END, not exported). Truncation can drop the end marker.
const FAKE_CURSOR = /\x1b_pi:fc\x07([\s\S]*?)(?:\x1b_pi:\/fc\x07|$)/g;

function removeSoftwareCursor(line: string, cursorMarker = ""): string {
	return line.replace(FAKE_CURSOR, (_match, cursor: string) => {
		const replacement = `${cursorMarker}${cursor}`;
		cursorMarker = "";
		return replacement;
	});
}

function configureCursor(tui: TUI, cursorStyle: CursorStyle): void {
	if (cursorStyle === "block") return;
	tui.setShowHardwareCursor(true);
	const sequence = CURSOR_STYLE_SEQUENCES[cursorStyle];
	if (sequence) tui.terminal.write(sequence);
}

const SCROLL_INDICATOR = /([↑↓]\s+\d+\s+more)/;

/** The `↑ N more` / `↓ N more` label Pi draws in its editor rules, if any. */
function scrollLabelOf(sourceLine: string | undefined): string | undefined {
	return sourceLine ? stripAnsi(sourceLine).match(SCROLL_INDICATOR)?.[1] : undefined;
}

function borderCorners(glyphs: FrameGlyphs, kind: "top" | "bottom"): readonly [string, string] {
	return kind === "top" ? [glyphs.topLeft, glyphs.topRight] : [glyphs.bottomLeft, glyphs.bottomRight];
}

function frameBorder(
	width: number,
	kind: "top" | "bottom",
	glyphs: FrameGlyphs,
	paint: (s: string) => string,
	scrollLabel?: string,
	indicator?: WorkingStatusIndicator,
): string {
	const corners = borderCorners(glyphs, kind);
	if (width < 2) return paint(truncateToWidth(corners.join(""), width, ""));
	const h = glyphs.horizontal;

	if (kind === "top" && indicator) {
		const contentWidth = width - 2;
		let status = indicator.renderInBorder(Math.max(1, contentWidth - 5));
		let statusWidth = visibleWidth(status);
		if (statusWidth > 0) {
			const overflowLabel = scrollLabel ? ` ${scrollLabel} ` : undefined;
			const overflowLabelWidth = overflowLabel ? visibleWidth(overflowLabel) : 0;
			const overflowStart = Math.floor((contentWidth - overflowLabelWidth) / 2);
			const canFitOverflow = () => overflowLabel !== undefined
				&& overflowLabelWidth + 2 <= contentWidth
				&& overflowStart - (3 + statusWidth + 1) >= 1;
			if (overflowLabel && !canFitOverflow()) {
				status = indicator.renderSpinnerInBorder(contentWidth);
				statusWidth = visibleWidth(status);
			}
			if (canFitOverflow()) {
				const leftBlockWidth = 3 + statusWidth + 1;
				return `${paint(`${corners[0]}${h}${h} `)}${status}${paint(` ${h.repeat(overflowStart - leftBlockWidth)}${overflowLabel}${h.repeat(contentWidth - overflowStart - overflowLabelWidth)}${corners[1]}`)}`;
			}
			if (contentWidth >= statusWidth + 5) {
				return `${paint(`${corners[0]}${h}${h} `)}${status}${paint(` ${h.repeat(contentWidth - statusWidth - 4)}${corners[1]}`)}`;
			}
			status = indicator.renderSpinnerInBorder(contentWidth);
			statusWidth = visibleWidth(status);
			const prefixWidth = Math.min(3, Math.max(0, contentWidth - statusWidth));
			return `${paint(`${corners[0]}${h.repeat(prefixWidth)}`)}${status}${paint(`${h.repeat(Math.max(0, contentWidth - prefixWidth - statusWidth))}${corners[1]}`)}`;
		}
	}

	if (scrollLabel) {
		const label = `${h.repeat(3)} ${scrollLabel} `;
		const fill = Math.max(0, width - 2 - visibleWidth(label));
		return paint(`${corners[0]}${label}${h.repeat(fill)}${corners[1]}`);
	}

	return paint(`${corners[0]}${h.repeat(Math.max(0, width - 2))}${corners[1]}`);
}

function trimTrailingSpaces(text: string): string {
	const ansiSuffix = text.match(/(?:\x1b\[[0-?]*[ -/]*[@-~])+$/)?.[0] ?? "";
	const content = ansiSuffix ? text.slice(0, -ansiSuffix.length) : text;
	return `${content.replace(/ +$/, "")}${ansiSuffix}`;
}

function inlineBorder(
	width: number,
	kind: "top" | "bottom",
	glyphs: FrameGlyphs,
	paint: (s: string) => string,
	renderLine: (width: number) => InlineFooterLine | undefined,
	scrollLabel?: string,
	indicator?: WorkingStatusIndicator,
): string {
	const corners = borderCorners(glyphs, kind);
	if (width < 2) return paint(truncateToWidth(corners.join(""), width, ""));

	const h = glyphs.horizontal;
	const contentWidth = width - 2;
	const right = scrollLabel ? paint(` ${scrollLabel} `) : "";
	let left = paint(h);

	if (kind === "top" && indicator) {
		const statusBudget = Math.max(1, contentWidth - visibleWidth(right) - 7);
		let status = indicator.renderInBorder(statusBudget);
		if (visibleWidth(status) > statusBudget) status = indicator.renderSpinnerInBorder(statusBudget);
		const leftBudget = Math.max(0, contentWidth - visibleWidth(right) - 1);
		status = truncateToWidth(status, Math.max(0, leftBudget - 4), "");
		if (visibleWidth(status) > 0) left = `${paint(`${h}${h} `)}${status}${paint(" ")}`;
	}

	const lineBudget = Math.max(0, contentWidth - visibleWidth(left) - visibleWidth(right) - 6);
	const line = renderLine(lineBudget);
	if (!line) return frameBorder(width, kind, glyphs, paint, scrollLabel, indicator);
	const leftContent = trimTrailingSpaces(line.left);
	const rightContent = trimTrailingSpaces(line.right);
	if (visibleWidth(leftContent) === 0 && visibleWidth(rightContent) === 0) {
		return frameBorder(width, kind, glyphs, paint, scrollLabel, indicator);
	}

	const leftCell = leftContent ? ` ${leftContent} ` : "";
	const rightCell = rightContent ? ` ${rightContent} ` : "";
	const fill = Math.max(1, contentWidth - visibleWidth(left) - visibleWidth(leftCell) - visibleWidth(rightCell) - visibleWidth(right) - 1);
	return `${paint(corners[0])}${left}${leftCell}${paint(h.repeat(fill))}${rightCell}${right}${paint(h)}${paint(corners[1])}`;
}

interface FastTuiEditorOptions {
	cursorStyle?: CursorStyle;
	editorShape?: EditorShape;
	inlineFooter?: InlineFooterRenderer;
	/** SGR sequence that opens the panel background of panel shapes; empty leaves it unfilled. */
	panelBackground?: () => string;
}

/** Capabilities this decorator adds to the editor instance it wraps. */
interface FastTuiEditorDecoration {
	embedWorkingStatus?: boolean;
	setWorkingStatusIndicator(indicator: WorkingStatusIndicator | undefined): void;
	setCursorStyle(cursorStyle: CursorStyle, blockHardwareCursor?: boolean): void;
	setEditorShape(shape: EditorShape): void;
}

type FrameableEditor = EditorComponent & Pick<CustomEditor,
	"focused" | "borderColor" | "handleMouse" | "getPaddingX" | "setPaddingX"
>;

// 按能力识别，避免跨模块加载时 instanceof 失效；仅支持保留 Pi 原生布局的编辑器。
function isFrameableEditor(editor: EditorComponent): editor is FrameableEditor {
	return typeof editor.borderColor === "function"
		&& typeof editor.handleMouse === "function"
		&& "getPaddingX" in editor && typeof editor.getPaddingX === "function"
		&& typeof editor.setPaddingX === "function"
		&& "focused" in editor && typeof editor.focused === "boolean";
}

interface EditorDecoration {
	tui: TUI;
	editor: FrameableEditor;
	cursorStyle: CursorStyle;
	previewHardwareCursor: boolean;
	inlineFooter: InlineFooterRenderer | undefined;
	indicator: WorkingStatusIndicator | undefined;
	shape: EditorShapeStyle;
	panelBackground: (() => string) | undefined;
	baseRender: (width: number) => string[];
	frame: FrameLayout | undefined;
	active: boolean;
	cleanup(): void;
}

// One decoration per instance: installing twice must not stack two frames.
const DECORATIONS = new WeakMap<object, EditorDecoration>();

function applyCursorStyle(
	decoration: EditorDecoration,
	cursorStyle: CursorStyle,
	blockHardwareCursor = false,
): void {
	const styleChanged = cursorStyle !== decoration.cursorStyle;
	decoration.previewHardwareCursor = cursorStyle !== "block";
	decoration.cursorStyle = cursorStyle;
	if (styleChanged) {
		const tui = decoration.tui;
		if (cursorStyle === "block") {
			tui.terminal.write(DEFAULT_CURSOR_STYLE_SEQUENCE);
			tui.setShowHardwareCursor(blockHardwareCursor);
		} else {
			configureCursor(tui, cursorStyle);
		}
	}
	decoration.tui.requestRender();
}

function overlayHoldsFocus(tui: TUI, editor: FrameableEditor): boolean {
	if (editor.focused) return false;
	const host = tui as { hasOverlay?: () => boolean; getFocusedComponent?: () => unknown };
	if (typeof host.hasOverlay !== "function" || typeof host.getFocusedComponent !== "function") return false;
	const focused = host.getFocusedComponent();
	return host.hasOverlay() && focused !== null && focused !== editor;
}

function renderWithCursor(decoration: EditorDecoration, width: number): string[] {
	const renderedLines = decoration.baseRender(width);
	const tui = decoration.tui;
	if (decoration.cursorStyle === "block") {
		// Pi's editor draws its software cursor even when unfocused. Behind a
		// focused popup that would show two cursors, so drop the editor's one.
		return overlayHoldsFocus(tui, decoration.editor)
			? renderedLines.map((line) => removeSoftwareCursor(line))
			: renderedLines;
	}

	// Pi re-applies settings.showHardwareCursor after session_start (/reload,
	// /new, session switches). Non-block styles have no software cursor left to
	// fall back on, so re-assert the hardware cursor instead of losing it.
	if (!tui.getShowHardwareCursor()) configureCursor(tui, decoration.cursorStyle);

	// A focused overlay suppresses the editor's cursor marker. Preserve its
	// position only for the live settings preview, then clear it on refocus.
	const focused = decoration.editor.focused;
	let cursorMarker = decoration.previewHardwareCursor && !focused ? CURSOR_MARKER : "";
	if (focused) decoration.previewHardwareCursor = false;
	return renderedLines.map((line) => {
		const rendered = removeSoftwareCursor(line, cursorMarker);
		if (rendered !== line) cursorMarker = "";
		return rendered;
	});
}

/** Layout of the last framed render; mouse events at that width are mapped through it. */
interface FrameLayout {
	width: number;
	leftInset: number;
	horizontalChrome: number;
	/** Rows to add to a framed content y to reach Pi's layout. */
	contentRowShift: number;
	/** First chrome row after the content; chrome rows up to `belowFrameRow` map onto Pi's bottom rule. */
	contentEndRow: number;
	/** First row below the frame (completion list); those rows keep Pi's own x coordinates. */
	belowFrameRow: number;
	/** Rows to add to a y at or below `belowFrameRow` to reach Pi's layout (frames can drop or add chrome rows). */
	belowFrameShift: number;
}

// Resets that would clear the panel background mid-row: SGR 0 (`[0m`, `[m`) and default background (`[49m`).
const BACKGROUND_RESET = /\x1b\[(?:0|49)?m/g;

function fillBackground(open: string, text: string): string {
	if (!open) return text;
	return `${open}${text.replace(BACKGROUND_RESET, (reset) => `${reset}${open}`)}\x1b[49m`;
}

/** Foreground SGR for the color of a 256-color or truecolor background SGR, if it is one. */
function backgroundAsForeground(open: string): string | undefined {
	const color = open.match(/^\x1b\[48;((?:2;\d+;\d+;\d+)|(?:5;\d+))m$/)?.[1];
	return color ? `\x1b[38;${color}m` : undefined;
}

/** `left` and `right` spread over `width` cells; `right` keeps its room when space runs short. */
function spreadRow(left: string, right: string, width: number): string {
	const fittedRight = truncateToWidth(right, Math.max(0, width), "");
	const rightWidth = visibleWidth(fittedRight);
	const leftBudget = width - rightWidth - (rightWidth > 0 ? 1 : 0);
	const fittedLeft = leftBudget > 0 ? truncateToWidth(left, leftBudget, "") : "";
	return `${fittedLeft}${" ".repeat(Math.max(0, width - visibleWidth(fittedLeft) - rightWidth))}${fittedRight}`;
}

/** Working indicator followed by the scroll labels, shrunk to the spinner when the timer does not fit. */
function panelStatus(width: number, scrollLabel: string | undefined, indicator: WorkingStatusIndicator | undefined): string {
	const label = scrollLabel ?? "";
	const labelWidth = visibleWidth(label);
	if (!indicator) return label;
	const budget = Math.max(1, width - labelWidth - (labelWidth > 0 ? 1 : 0));
	let status = indicator.renderInBorder(budget);
	if (visibleWidth(status) > budget) status = indicator.renderSpinnerInBorder(budget);
	return [status, label].filter((part) => visibleWidth(part) > 0).join(" ");
}

/**
 * Panel shapes: an accent rail beside a filled block holding a padding row with the
 * indicators, Pi's content rows, a blank row and an info row (model or the footer's second line).
 * Opening lower half blocks and closing upper half blocks in the panel color add half a row
 * of padding above the indicators and below the info row; without a usable color they stay blank.
 */
function renderPanel(
	decoration: EditorDecoration,
	width: number,
	baseLines: string[],
	bottomIdx: number,
	scrollLabel: string | undefined,
	embedFooter: boolean,
): string[] {
	const shape = decoration.shape;
	const contentWidth = Math.max(0, width - shape.leftInset - shape.rightInset);
	const open = decoration.panelBackground?.() ?? "";
	const rail = decoration.editor.borderColor(shape.glyphs.vertical);
	const gap = " ".repeat(Math.max(0, shape.leftInset - visibleWidth(shape.glyphs.vertical)));
	const tail = " ".repeat(shape.rightInset);
	const row = (content: string) => `${rail}${fillBackground(open, `${gap}${fillLine(content, contentWidth)}${tail}`)}`;

	const footer = embedFooter ? decoration.inlineFooter?.render(contentWidth) : undefined;
	const status = panelStatus(contentWidth, scrollLabel, decoration.indicator);
	const topRight = [footer?.top.right ?? "", status].filter((part) => visibleWidth(part) > 0).join(" ");
	const halfBlock = backgroundAsForeground(open);
	const railWidth = visibleWidth(shape.glyphs.vertical);
	const railStart = shape.panelRailStart ? decoration.editor.borderColor(shape.panelRailStart) : " ".repeat(railWidth);
	const result = [
		halfBlock
			? `${railStart}${halfBlock}${"▄".repeat(Math.max(0, width - railWidth))}\x1b[39m`
			: " ".repeat(Math.max(0, width)),
		row(spreadRow(footer?.top.left ?? "", topRight, contentWidth)),
	];
	for (let i = 1; i < bottomIdx; i++) result.push(row(baseLines[i] ?? ""));
	result.push(row(""));
	result.push(row(footer
		? spreadRow(footer.bottom.left, footer.bottom.right, contentWidth)
		: decoration.inlineFooter?.renderInfo?.(contentWidth) ?? ""));
	const railEnd = shape.panelRailEnd ? decoration.editor.borderColor(shape.panelRailEnd) : " ".repeat(railWidth);
	result.push(halfBlock
		? `${railEnd}${halfBlock}${"▀".repeat(Math.max(0, width - railWidth))}\x1b[39m`
		: " ".repeat(Math.max(0, width)));
	return result;
}

function renderFrame(decoration: EditorDecoration, width: number): string[] {
	decoration.frame = undefined;
	const shape = decoration.shape;
	const horizontalChrome = shape.leftInset + shape.rightInset;
	if (width < Math.max(2, horizontalChrome)) return renderWithCursor(decoration, width);

	const innerWidth = Math.max(0, width - horizontalChrome);
	const baseLines = renderWithCursor(decoration, innerWidth);
	const bottomIdx = findBottomBorderIndex(baseLines);
	if (bottomIdx <= 1 || !isEditorBorderLine(baseLines[0] ?? "") || !isEditorBorderLine(baseLines[bottomIdx] ?? "")) {
		return renderWithCursor(decoration, width);
	}
	const borderPaint = (text: string) => decoration.editor.borderColor(text);
	const glyphs = shape.glyphs;

	const result: string[] = [];
	const inlineFooter = decoration.inlineFooter?.enabled() === true;
	const renderInlineLine = (kind: "top" | "bottom", budget: number): InlineFooterLine | undefined =>
		decoration.inlineFooter?.render(budget)?.[kind];
	const topLabel = scrollLabelOf(baseLines[0]);
	const bottomLabel = scrollLabelOf(baseLines[bottomIdx]);
	// Without a bottom border, the `↓ N more` label moves up to the top rule.
	const topScrollLabel = shape.bottomBorder
		? topLabel
		: [topLabel, bottomLabel].filter((label) => label !== undefined).join(" ") || undefined;
	// Bottom-less shapes cannot hold the footer's second row, so the footer stays separate.
	const embedFooter = inlineFooter && canEmbedInlineFooter(shape);
	if (shape.panel) {
		result.push(...renderPanel(decoration, width, baseLines, bottomIdx, topScrollLabel, embedFooter));
		// The blank, info and closing rows replace Pi's single bottom rule.
		decoration.frame = {
			width,
			leftInset: shape.leftInset,
			horizontalChrome,
			contentRowShift: -1,
			contentEndRow: bottomIdx,
			belowFrameRow: bottomIdx + 4,
			belowFrameShift: -3,
		};
		for (let i = bottomIdx + 1; i < baseLines.length; i++) result.push(baseLines[i]!);
		return result.map((line) => truncateToWidth(line, width, ""));
	}
	result.push(embedFooter
		? inlineBorder(width, "top", glyphs, borderPaint, (budget) => renderInlineLine("top", budget), topScrollLabel, decoration.indicator)
		: frameBorder(width, "top", glyphs, borderPaint, topScrollLabel, decoration.indicator));

	const rail = borderPaint(glyphs.vertical);
	const prompt = shape.prompt === undefined ? undefined : borderPaint(shape.prompt);
	const promptIndent = " ".repeat(shape.leftInset);
	for (let i = 1; i < bottomIdx; i++) {
		const line = fillLine(baseLines[i] ?? "", innerWidth);
		if (shape.sideRails) result.push(`${rail} ${line} ${rail}`);
		else if (prompt !== undefined) result.push(`${i === 1 ? prompt : promptIndent}${line}`);
		else result.push(line);
	}

	if (shape.bottomBorder) {
		result.push(embedFooter
			? inlineBorder(width, "bottom", glyphs, borderPaint, (budget) => renderInlineLine("bottom", budget), bottomLabel)
			: frameBorder(width, "bottom", glyphs, borderPaint, bottomLabel));
	}

	for (let i = bottomIdx + 1; i < baseLines.length; i++) {
		result.push(baseLines[i]!);
	}

	decoration.frame = {
		width,
		leftInset: shape.leftInset,
		horizontalChrome,
		contentRowShift: 0,
		contentEndRow: bottomIdx,
		belowFrameRow: shape.bottomBorder ? bottomIdx + 1 : bottomIdx,
		// Pi's bottom rule is not drawn, so rows below the frame sit one row higher than in Pi's layout.
		belowFrameShift: shape.bottomBorder ? 0 : 1,
	};
	return result.map((line) => truncateToWidth(line, width, ""));
}

function mapMouseEvent<T extends { x: number; y: number; width: number }>(decoration: EditorDecoration, event: T): T {
	const frame = decoration.frame;
	if (!decoration.active || !frame || event.width !== frame.width) return event;
	const width = event.width - frame.horizontalChrome;
	// Completion rows are copied unshifted from Pi's render, so only their row index moves.
	if (event.y >= frame.belowFrameRow) return { ...event, y: event.y + frame.belowFrameShift, width };
	const y = Math.min(Math.max(0, event.y + frame.contentRowShift), frame.contentEndRow);
	return { ...event, x: event.x - frame.leftInset, y, width };
}

/**
 * Adds the fast-tui frame to an existing editor **in place** and returns that same
 * instance. Patching (instead of wrapping) keeps `onSubmit` / `onChange` / `handleInput`
 * on one object, so Pi and every extension that wrapped the factory before us keep working.
 */
export function decorateFastTuiEditor<T extends FrameableEditor>(
	editor: T,
	tui: TUI,
	options: FastTuiEditorOptions = {},
): T & FastTuiEditorDecoration {
	const existing = DECORATIONS.get(editor);
	if (existing) return editor as T & FastTuiEditorDecoration;

	const decorated = editor as FrameableEditor & FastTuiEditorDecoration;
	const restore: (() => void)[] = [];
	const baseHandleMouse = editor.handleMouse.bind(editor);
	const baseSetPaddingX = editor.setPaddingX.bind(editor);
	const baseSetWorkingStatus = decorated.setWorkingStatusIndicator?.bind(editor);
	const baseSetCursorStyle = decorated.setCursorStyle?.bind(editor);
	const baseSetEditorShape = decorated.setEditorShape?.bind(editor);
	let padding = editor.getPaddingX();
	const decoration: EditorDecoration = {
		tui,
		editor,
		cursorStyle: options.cursorStyle ?? "block",
		previewHardwareCursor: false,
		inlineFooter: options.inlineFooter,
		indicator: undefined,
		shape: getEditorShapeStyle(options.editorShape),
		panelBackground: options.panelBackground,
		baseRender: editor.render.bind(editor),
		frame: undefined,
		active: true,
		cleanup() {
			if (!decoration.active) return;
			decoration.active = false;
			for (const undo of restore) undo();
			baseSetPaddingX(padding);
			DECORATIONS.delete(editor);
		},
	};
	// 只撤销仍属于自己的属性；后来包装的方法会通过 active=false 调用原实现。
	const patch = <K extends keyof FastTuiEditorDecoration | "render" | "handleMouse" | "setPaddingX">(
		key: K,
		value: (FrameableEditor & FastTuiEditorDecoration)[K],
	): void => {
		const descriptor = Object.getOwnPropertyDescriptor(editor, key);
		decorated[key] = value;
		restore.push(() => {
			if (decorated[key] !== value) return;
			if (descriptor) Object.defineProperty(editor, key, descriptor);
			else Reflect.deleteProperty(editor, key);
		});
	};
	DECORATIONS.set(editor, decoration);
	configureCursor(tui, decoration.cursorStyle);
	patch("embedWorkingStatus", true);
	patch("setWorkingStatusIndicator", (indicator) => {
		if (!decoration.active) return baseSetWorkingStatus?.(indicator);
		decoration.indicator = indicator;
		tui.requestRender();
	});
	patch("setCursorStyle", (style, hardware = false) => {
		if (decoration.active) applyCursorStyle(decoration, style, hardware);
		else baseSetCursorStyle?.(style, hardware);
	});
	patch("setEditorShape", (shape) => {
		if (!decoration.active) return baseSetEditorShape?.(shape);
		decoration.shape = getEditorShapeStyle(shape);
		tui.requestRender();
	});
	patch("render", (width) => decoration.active
		? renderFrame(decoration, width)
		: decoration.baseRender(width));
	patch("handleMouse", (event) => baseHandleMouse(mapMouseEvent(decoration, event)));
	patch("setPaddingX", (nextPadding) => {
		padding = nextPadding;
		baseSetPaddingX(decoration.active ? 0 : nextPadding);
	});
	baseSetPaddingX(0);
	return editor as T & FastTuiEditorDecoration;
}

type StreamWrite = (...args: unknown[]) => boolean;

/**
 * Calls `requestRepaint` after each raw write to a TTY stream. Pi's fullscreen renderer only
 * rewrites changed rows, so text other extensions print straight to the terminal would
 * otherwise stay over the editor and footer until a resize.
 */
export function repaintAfterStreamWrites(
	requestRepaint: () => void,
	stream: NodeJS.WriteStream = process.stderr,
): () => void {
	if (!stream.isTTY) return () => {};
	const original = stream.write as unknown as StreamWrite;
	let enabled = true;
	const patched = ((...args: unknown[]) => {
		const callback = typeof args[args.length - 1] === "function"
			? (args.pop() as (error?: Error | null) => void)
			: undefined;
		// Repaint from the write callback so the redraw lands after the stray text.
		return original.call(stream, ...args, (error?: Error | null) => {
			try {
				if (enabled) requestRepaint();
			} catch {
				// A failed repaint must not break the caller's write; logging it here would recurse.
			}
			callback?.(error);
		});
	}) as typeof stream.write;
	stream.write = patched;
	return () => {
		enabled = false;
		// A later wrapper may still delegate to ours; leave it as a passthrough then.
		if (stream.write === patched) stream.write = original as unknown as typeof stream.write;
	};
}

export function installEditor(
	_pi: ExtensionAPI,
	ctx: ExtensionContext,
	cursorStyle: CursorStyle = "block",
	inlineFooter?: InlineFooterRenderer,
	editorShape: EditorShape = "rounded",
) {
	let activeTui: TUI | undefined;
	let activeEditor: (FrameableEditor & FastTuiEditorDecoration) | undefined;
	let enabled = true;
	let previousHardwareCursor: boolean | undefined;
	let currentCursorStyle = cursorStyle;
	let currentEditorShape = editorShape;
	let hiddenThinkingTarget: HiddenThinkingLabelComponent | undefined;
	let restoreHiddenThinkingRender: (() => void) | undefined;
	let buildHiddenThinkingLabel: ((width: number) => string) | undefined;
	const getActiveTui = (): TUI => {
		if (!activeTui) throw new Error("Fast TUI editor is not mounted");
		return activeTui;
	};
	const resetHiddenThinkingTarget = (): void => {
		restoreHiddenThinkingRender?.();
		restoreHiddenThinkingRender = undefined;
		hiddenThinkingTarget = undefined;
		buildHiddenThinkingLabel = undefined;
	};
	// Build the label at the width Pi actually renders the message with; layout
	// extensions (e.g. pi-sidebar) can make it much narrower than the terminal.
	const patchHiddenThinkingRender = (target: HiddenThinkingLabelComponent): void => {
		const originalRender = target.render;
		let lastWidth: number | undefined;
		let lastBuild: ((width: number) => string) | undefined;
		let active = true;
		const patched = function (this: HiddenThinkingLabelComponent, width: number): string[] {
			if (!active) return originalRender.call(this, width);
			const build = buildHiddenThinkingLabel;
			const textWidth = hiddenThinkingTextWidth(width, this.outputPad);
			if (build && (build !== lastBuild || textWidth !== lastWidth)) {
				lastBuild = build;
				lastWidth = textWidth;
				this.setHiddenThinkingLabel(build(textWidth));
			}
			return originalRender.call(this, width);
		};
		target.render = patched;
		restoreHiddenThinkingRender = () => {
			active = false;
			// Another copy of this extension may have wrapped us; unwinding then would drop its wrapper.
			if (target.render === patched) target.render = originalRender;
		};
	};
	// Only the fullscreen renderer clears and rewrites the whole screen on a forced render.
	const restoreStderr = repaintAfterStreamWrites(() => {
		if (activeTui?.mode === "fullscreen") activeTui.requestRender(true);
	});

	const ui = ctx.ui;
	const originalSetEditor = ui.setEditorComponent;
	const originalGetEditor = ui.getEditorComponent;
	let inheritedFactory = originalGetEditor.call(ui);
	let mountedEditor: EditorComponent | undefined;
	let mountedFactory: EditorFactory | undefined;
	let mountedRender: EditorComponent["render"] | undefined;
	let restoreEditorMount: (() => void) | undefined;
	const releaseEditor = (): void => {
		if (activeEditor) DECORATIONS.get(activeEditor)?.cleanup();
		activeEditor = undefined;
		if (activeTui && previousHardwareCursor !== undefined) {
			if (currentCursorStyle !== "block") activeTui.terminal.write(DEFAULT_CURSOR_STYLE_SEQUENCE);
			activeTui.setShowHardwareCursor(previousHardwareCursor);
		}
		previousHardwareCursor = undefined;
	};
	const mountEditor = (tui: TUI, editor: EditorComponent): void => {
		releaseEditor();
		activeTui = tui;
		mountedEditor = editor;
		mountedFactory = originalGetEditor.call(ui);
		resetHiddenThinkingTarget();
		if (isFrameableEditor(editor)) {
			let lines: string[] = [];
			try {
				lines = editor.render(tui.terminal.columns);
			} catch {
				// A failed layout probe must not prevent Pi from mounting the editor.
			}
			const bottom = findBottomBorderIndex(lines);
			// Capabilities alone do not guarantee that the first and bottom rows are replaceable borders.
			if (bottom > 1 && isEditorBorderLine(lines[0] ?? "") && isEditorBorderLine(lines[bottom] ?? "")) {
				previousHardwareCursor = tui.getShowHardwareCursor?.();
				activeEditor = decorateFastTuiEditor(editor, tui, {
					cursorStyle: currentCursorStyle,
					editorShape: currentEditorShape,
					inlineFooter,
					panelBackground: () => ctx.ui.theme?.getBgAnsi?.("userMessageBg") ?? "",
				});
			}
		}
		mountedRender = editor.render;
	};
	const wrapFactory = (delegate: EditorFactory | undefined): EditorFactory => {
		const wrapped: EditorFactory = (tui, editorTheme, keybindings) => {
			let inner: EditorComponent | undefined;
			try {
				inner = delegate?.(tui, editorTheme, keybindings);
			} catch {
				// 上游工厂不可用时保留默认编辑器。
			}
			inner ??= new CustomEditor(tui, editorTheme, keybindings, { paddingX: 0 });
			// A factory captured by another context must keep its original delegate.
			if (enabled && originalGetEditor.call(ui) === wrapped) mountEditor(tui, inner);
			return inner;
		};
		return wrapped;
	};
	let factory = wrapFactory(inheritedFactory);
	const getEditor: typeof ui.getEditorComponent = () => {
		const current = originalGetEditor.call(ui);
		return enabled && current === factory ? inheritedFactory : current;
	};
	const setEditor: typeof ui.setEditorComponent = (next) => {
		if (!enabled) return originalSetEditor.call(ui, next);
		inheritedFactory = next;
		factory = wrapFactory(next);
		originalSetEditor.call(ui, factory);
	};
	ui.getEditorComponent = getEditor;
	ui.setEditorComponent = setEditor;
	originalSetEditor.call(ui, factory);

	// Shortcut contexts have a fresh ui object; intercept their shared mount before status routing.
	const pending: Component[] = activeTui ? [activeTui] : [];
	const visited = new Set<Component>();
	while (pending.length > 0) {
		const component = pending.pop()!;
		if (visited.has(component)) continue;
		visited.add(component);
		const container = component as Partial<Container>;
		if (!Array.isArray(container.children)) continue;
		if (!mountedEditor || !container.children.includes(mountedEditor) || typeof container.addChild !== "function") {
			pending.push(...container.children);
			continue;
		}
		const target = container as Container;
		const original = target.addChild;
		const descriptor = Object.getOwnPropertyDescriptor(target, "addChild");
		const patched: typeof original = function (this: Container, child) {
			const candidate = child as Partial<EditorComponent>;
			// Reused instances can have a new factory or render; unchanged dialog returns need no remount.
			if (enabled && activeTui
				&& (child !== mountedEditor || originalGetEditor.call(ui) !== mountedFactory || child.render !== mountedRender)
				&& typeof candidate.getText === "function" && typeof candidate.setText === "function"
				&& typeof candidate.handleInput === "function"
				&& typeof candidate.onSubmit === "function" && candidate.onSubmit === mountedEditor?.onSubmit
				&& typeof candidate.onChange === "function" && candidate.onChange === mountedEditor?.onChange) {
				mountEditor(activeTui, candidate as EditorComponent);
			}
			original.call(this, child);
		};
		target.addChild = patched;
		restoreEditorMount = () => {
			if (target.addChild !== patched) return;
			if (descriptor) Object.defineProperty(target, "addChild", descriptor);
			else Reflect.deleteProperty(target, "addChild");
		};
		break;
	}
	return {
		isFramed: () => enabled && activeEditor !== undefined,
		/** Whether the footer can move into the frame: it needs both a top and a bottom border. */
		canEmbedFooter: () => enabled && activeEditor !== undefined && canEmbedInlineFooter(getEditorShapeStyle(currentEditorShape)),
		/** `build` receives the hidden-thinking text width and runs again whenever that width changes. */
		setLatestHiddenThinkingLabel(build: (width: number) => string): void {
			const tui = getActiveTui();
			if (!hiddenThinkingTarget) {
				hiddenThinkingTarget = findLatestHiddenThinkingLabel(tui);
				patchHiddenThinkingRender(hiddenThinkingTarget);
			}
			buildHiddenThinkingLabel = build;
			tui.requestRender();
		},
		resetHiddenThinkingLabelTarget: resetHiddenThinkingTarget,
		getTui: (): TUI | undefined => activeTui,
		setCursorStyle(nextCursorStyle: CursorStyle): void {
			currentCursorStyle = nextCursorStyle;
			activeEditor?.setCursorStyle(nextCursorStyle, previousHardwareCursor);
		},
		setEditorShape(nextEditorShape: EditorShape): void {
			currentEditorShape = nextEditorShape;
			activeEditor?.setEditorShape(nextEditorShape);
		},
		cleanup(): void {
			if (!enabled) return;
			enabled = false;
			restoreEditorMount?.();
			releaseEditor();
			restoreStderr();
			resetHiddenThinkingTarget();
			// 只恢复自己的代理；后来捕获的代理会在停用后透传到原接口。
			if (ui.setEditorComponent === setEditor) ui.setEditorComponent = originalSetEditor;
			if (ui.getEditorComponent === getEditor) ui.getEditorComponent = originalGetEditor;
			const current = originalGetEditor.call(ui);
			if (current === factory || current === mountedFactory) {
				try {
					originalSetEditor.call(ui, current === factory ? inheritedFactory : current);
				} catch {
					originalSetEditor.call(ui, undefined);
				}
			}
		},
	};
}
