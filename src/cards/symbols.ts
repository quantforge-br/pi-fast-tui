// Glyphs every card shares: frame corners, status icons, spinner frames and tree connectors.
// The sets follow fast-tui's icon mode: `ascii` swaps every box-drawing and symbol glyph for plain ASCII.

/** Which glyph set the cards draw with. */
export type CardGlyphMode = "unicode" | "ascii";

/** Characters for card frames. */
export interface BoxGlyphs {
	topLeft: string;
	topRight: string;
	bottomLeft: string;
	bottomRight: string;
	horizontal: string;
	vertical: string;
	teeRight: string;
	teeLeft: string;
}

/** Tree connectors for grouped output and JSON trees. */
export interface TreeGlyphs {
	branch: string;
	last: string;
	vertical: string;
}

/** Glyphs of a card header's status icon; `running` is drawn when no spinner frame is given. */
export interface StatusGlyphs {
	pending: string;
	running: string;
	success: string;
	error: string;
	warning: string;
	info: string;
}

/** Row markers of the codemode card. */
export interface MarkGlyphs {
	cancelled: string;
	edit: string;
}

interface GlyphSet {
	box: BoxGlyphs;
	spinner: readonly string[];
	tree: TreeGlyphs;
	bracket: { left: string; right: string };
	status: StatusGlyphs;
	marks: MarkGlyphs;
}

const UNICODE: GlyphSet = {
	box: { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│", teeRight: "├", teeLeft: "┤" },
	// Braille spinner frames, as oh-my-pi draws a running call.
	spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
	tree: { branch: "├─", last: "└─", vertical: "│" },
	bracket: { left: "⟨", right: "⟩" },
	status: { pending: "◌", running: "⟳", success: "✔", error: "✘", warning: "⚠", info: "•" },
	marks: { cancelled: "⊘", edit: "✎" },
};

const ASCII: GlyphSet = {
	box: { topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|", teeRight: "+", teeLeft: "+" },
	spinner: ["|", "/", "-", "\\"],
	tree: { branch: "|-", last: "`-", vertical: "|" },
	bracket: { left: "<", right: ">" },
	status: { pending: "o", running: "~", success: "+", error: "x", warning: "!", info: "*" },
	marks: { cancelled: "/", edit: "~" },
};

/** Characters for card frames in the active glyph set. */
export const BOX: Readonly<BoxGlyphs> = { ...UNICODE.box };

/** Spinner frames in the active glyph set. */
export const SPINNER_FRAMES: readonly string[] = [...UNICODE.spinner];

/** Tree connectors in the active glyph set. */
export const TREE: Readonly<TreeGlyphs> = { ...UNICODE.tree };

/** Separator between short facts in a header or footer. */
export const SEP = " · ";

/** Brackets around header badges such as diff counts. */
export const BRACKET: Readonly<{ left: string; right: string }> = { ...UNICODE.bracket };

/** Status icon glyphs in the active glyph set. */
export const STATUS_GLYPHS: Readonly<StatusGlyphs> = { ...UNICODE.status };

/** Codemode row markers in the active glyph set. */
export const MARKS: Readonly<MarkGlyphs> = { ...UNICODE.marks };

let activeMode: CardGlyphMode = "unicode";

/** The glyph set cards currently draw with. */
export function cardGlyphMode(): CardGlyphMode {
	return activeMode;
}

/**
 * Switches every card to a glyph set. The exported objects are updated in place, so cards already on
 * screen pick the new set up on their next render. Returns whether anything changed.
 */
export function setCardGlyphMode(mode: CardGlyphMode): boolean {
	if (mode === activeMode) return false;
	const set = mode === "ascii" ? ASCII : UNICODE;
	Object.assign(BOX, set.box);
	Object.assign(TREE, set.tree);
	Object.assign(BRACKET, set.bracket);
	Object.assign(STATUS_GLYPHS, set.status);
	Object.assign(MARKS, set.marks);
	(SPINNER_FRAMES as string[]).splice(0, SPINNER_FRAMES.length, ...set.spinner);
	activeMode = mode;
	return true;
}
