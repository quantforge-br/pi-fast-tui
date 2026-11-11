import type { EditorShape } from "./config.ts";

/** Glyphs for the frame rows; rule-only shapes use the horizontal glyph for corners. */
export interface FrameGlyphs {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
}

/**
 * Layout of one editor shape. Content rows are Pi's own editor rows rendered at
 * `width - leftInset - rightInset`; the shape only adds chrome around them.
 */
export interface EditorShapeStyle {
	readonly id: EditorShape;
	readonly glyphs: FrameGlyphs;
	/** Content rows are enclosed by `vertical` rails (box shapes). */
	readonly sideRails: boolean;
	/** Prompt drawn before the first content row; later rows get a matching indent. */
	readonly prompt?: string;
	/** Whether the bottom border row is drawn. Without it, Pi's bottom rule row is dropped. */
	readonly bottomBorder: boolean;
	/**
	 * Filled panel behind an accent rail (`vertical`): a padding row on top, then the content
	 * rows, a blank row and an info row. Replaces both of Pi's rules.
	 */
	readonly panel?: boolean;
	/**
	 * Rows without rules: Pi's top and bottom rules are dropped and only the content rows are
	 * drawn, wrapped in optional accent caps on a filled or transparent surface.
	 */
	readonly bare?: BareShapeStyle;
	/** Lower half of the panel rail, drawn on the half-height opening row. */
	readonly panelRailStart?: string;
	/** Upper half of the panel rail, drawn on the half-height closing row. */
	readonly panelRailEnd?: string;
	/** Cells added before Pi's content (rail + space, or prompt). */
	readonly leftInset: number;
	/** Cells added after Pi's content. */
	readonly rightInset: number;
}

/** Chrome of a rule-less shape, drawn around each content row. */
export interface BareShapeStyle {
	/** Accent glyph before each content row; without it the shape's `prompt` leads the row. */
	readonly leftCap?: string;
	/** Accent glyph after each content row. */
	readonly rightCap?: string;
	/** Paint the panel background behind the row between the caps. */
	readonly filled: boolean;
	/** Draw a scroll thumb in the rightmost column while the content is scrolled. */
	readonly scrollbar: boolean;
	/** Blank row after the editor so the separate footer does not sit flush against the input. */
	readonly footerGap: boolean;
}

const ROUNDED: EditorShapeStyle = {
	id: "rounded",
	glyphs: { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" },
	sideRails: true,
	bottomBorder: true,
	leftInset: 2,
	rightInset: 2,
};

/** Full-width rules: corners are plain horizontal cells. */
const RULE: FrameGlyphs = { topLeft: "─", topRight: "─", bottomLeft: "─", bottomRight: "─", horizontal: "─", vertical: "" };
const PROMPT = "❯ ";

function boxShape(id: EditorShape, glyphs: FrameGlyphs): EditorShapeStyle {
	return { ...ROUNDED, id, glyphs };
}

const SHAPES: Partial<Record<EditorShape, EditorShapeStyle>> = {
	rounded: ROUNDED,
	square: boxShape("square", { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "─", vertical: "│" }),
	heavy: boxShape("heavy", { topLeft: "┏", topRight: "┓", bottomLeft: "┗", bottomRight: "┛", horizontal: "━", vertical: "┃" }),
	double: boxShape("double", { topLeft: "╔", topRight: "╗", bottomLeft: "╚", bottomRight: "╝", horizontal: "═", vertical: "║" }),
	ascii: boxShape("ascii", { topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|" }),
	native: { id: "native", glyphs: RULE, sideRails: false, bottomBorder: true, leftInset: 0, rightInset: 0 },
	claude: { id: "claude", glyphs: RULE, sideRails: false, prompt: PROMPT, bottomBorder: true, leftInset: 2, rightInset: 0 },
	rule: { id: "rule", glyphs: RULE, sideRails: false, prompt: PROMPT, bottomBorder: false, leftInset: 2, rightInset: 0 },
	borderless: { id: "borderless", glyphs: RULE, sideRails: false, prompt: PROMPT, bottomBorder: false, bare: { filled: false, scrollbar: false, footerGap: false }, leftInset: 2, rightInset: 0 },
	field: { id: "field", glyphs: RULE, sideRails: false, bottomBorder: false, bare: { leftCap: "▐", rightCap: "▌", filled: true, scrollbar: true, footerGap: true }, leftInset: 2, rightInset: 2 },
	rail: { id: "rail", glyphs: RULE, sideRails: false, bottomBorder: false, bare: { leftCap: "▎", filled: true, scrollbar: true, footerGap: true }, leftInset: 2, rightInset: 1 },
	opencode: { id: "opencode", glyphs: { ...RULE, vertical: "▌" }, sideRails: false, panel: true, panelRailStart: "▖", panelRailEnd: "▘", bottomBorder: false, leftInset: 2, rightInset: 1 },
};

/** Whether the shape has a row below the content that can hold the footer's second line. */
export function canEmbedInlineFooter(style: EditorShapeStyle): boolean {
	return style.bottomBorder || style.panel === true;
}

/** Style for a shape id; unknown ids fall back to `rounded`. */
export function getEditorShapeStyle(shape: EditorShape | undefined): EditorShapeStyle {
	return (shape && SHAPES[shape]) || ROUNDED;
}
