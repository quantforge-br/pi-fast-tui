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
	/** Cells added before Pi's content (rail + space, or prompt). */
	readonly leftInset: number;
	/** Cells added after Pi's content. */
	readonly rightInset: number;
}

const ROUNDED: EditorShapeStyle = {
	id: "rounded",
	glyphs: { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" },
	sideRails: true,
	bottomBorder: true,
	leftInset: 2,
	rightInset: 2,
};

const SHAPES: Partial<Record<EditorShape, EditorShapeStyle>> = {
	rounded: ROUNDED,
};

/** Style for a shape id; unknown ids fall back to `rounded`. */
export function getEditorShapeStyle(shape: EditorShape | undefined): EditorShapeStyle {
	return (shape && SHAPES[shape]) || ROUNDED;
}
