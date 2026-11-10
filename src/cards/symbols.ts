// Glyphs every card shares: frame corners, status icons, spinner frames and tree connectors.

/** Rounded box-drawing characters for card frames. */
export const BOX = {
	topLeft: "╭",
	topRight: "╮",
	bottomLeft: "╰",
	bottomRight: "╯",
	horizontal: "─",
	vertical: "│",
	teeRight: "├",
	teeLeft: "┤",
} as const;

/** Braille spinner frames, as oh-my-pi draws a running call. */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Tree connectors for grouped output and JSON trees. */
export const TREE = {
	branch: "├─",
	last: "└─",
	vertical: "│",
} as const;

/** Separator between short facts in a header or footer. */
export const SEP = " · ";

/** Brackets around header badges such as diff counts. */
export const BRACKET = { left: "⟨", right: "⟩" } as const;
