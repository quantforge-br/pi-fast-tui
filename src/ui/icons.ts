export type IconMode = "auto" | "nerd" | "unicode" | "ascii";

export interface IconGlyphs {
	cwd: string;
	host: string;
	session: string;
	git: string;
	working: string;
	done: string;
	/** Footer timer segment of a run that settled with an error or was stopped. */
	failed: string;
	context: string;
	model: string;
	thinking: string;
	input: string;
	output: string;
	cacheHit: string;
	cost: string;
	speed: string;
	latency: string;
	stall: string;
	extensions: string;
	ahead: string;
	behind: string;
	diverged: string;
	conflicted: string;
	stashed: string;
	modified: string;
	staged: string;
	untracked: string;
	renamed: string;
	deleted: string;
	/** Compact tool view: call marker and result gutter. */
	toolCall: string;
	toolResult: string;
	/** Compact tool view: call marker of a failed call. */
	toolError: string;
}

const NERD_GLYPHS: IconGlyphs = {
	cwd: "",
	host: "",
	session: "",
	git: "",
	working: "",
	done: "",
	failed: "✘",
	context: "",
	model: "",
	thinking: "",
	// client network view: input = upload to API, output = download from API
	input: "",
	output: "",
	cacheHit: "",
	cost: "",
	speed: "󰓅",
	latency: "",
	stall: "",
	extensions: "",
	ahead: "↑",
	behind: "↓",
	diverged: "⇕",
	conflicted: "=",
	stashed: "$",
	modified: "!",
	staged: "+",
	untracked: "?",
	renamed: "»",
	deleted: "✘",
	toolCall: "●",
	toolResult: "⎿",
	toolError: "✘",
};

// ponytail: ASCII fallback uses compact symbols (not English words) to keep
// the footer's icon-like feel on non-Nerd-Font terminals. Symbols chosen to
// avoid collisions with the git-status set {= S ! A ? r x ^ v}; the token
// counts use the letters `i` (input) and `o` (output), which only appear next
// to a number on footer row 2.
const ASCII_GLYPHS: IconGlyphs = {
	cwd: "@",
	host: "h",
	session: "s",
	git: "*",
	working: "o",
	done: "+",
	failed: "x",
	context: "#",
	model: "M",
	thinking: "~",
	input: "i",
	output: "o",
	cacheHit: "c",
	cost: "",
	speed: ">",
	latency: "~",
	stall: "!",
	extensions: "&",
	ahead: "^",
	behind: "v",
	diverged: "^v",
	conflicted: "=",
	stashed: "S",
	modified: "!",
	staged: "A",
	untracked: "?",
	renamed: "r",
	deleted: "x",
	toolCall: "*",
	toolResult: "`-",
	toolError: "x",
};

// Portable Unicode icon set for terminals without a Nerd Font. Keeps the
// footer icon-like instead of dropping to letters: emoji glyphs (folder,
// branch, laptop, bulb, floppy, plug, hourglass, bolt) render through the
// client terminal's emoji fallback at 2 columns, which matches
// pi-tui's visibleWidth for RGI emoji; the remaining symbols are
// single-width and covered by DejaVu Sans Mono, JetBrains Mono, Noto Sans
// Mono and Liberation Mono. Glyph choices are easy to adjust per slot.
const UNICODE_GLYPHS: IconGlyphs = {
	cwd: "📁",
	host: "⌂",
	session: "🔖",
	git: "🌿",
	working: "◷",
	done: "✓",
	failed: "✗",
	context: "≡",
	model: "💻",
	thinking: "💡",
	input: "↑",
	output: "↓",
	cacheHit: "💾",
	cost: "",
	speed: "⚡",
	latency: "⌛",
	stall: "⚠",
	extensions: "🔌",
	ahead: "↑",
	behind: "↓",
	diverged: "↕",
	conflicted: "=",
	stashed: "$",
	modified: "!",
	staged: "+",
	untracked: "?",
	renamed: "→",
	deleted: "✗",
	toolCall: "●",
	toolResult: "└",
	toolError: "✘",
};

/** Whether output is an interactive UTF-8 terminal; says nothing about its font. */
export function detectUnicodeTerminal(): boolean {
	// TTY and locale are the only signals available here. An unset locale
	// passes, as most terminals default to UTF-8.
	if (process.env.TERM === "dumb" || process.stdout.isTTY !== true) return false;
	const locale = [process.env.LC_ALL, process.env.LC_CTYPE, process.env.LANG].find(Boolean);
	return locale === undefined || /utf-?8/i.test(locale);
}

/** `auto` resolves to "unicode" or "ascii"; only an explicit "nerd" yields "nerd". */
export function resolveIconMode(mode: IconMode): "nerd" | "unicode" | "ascii" {
	if (mode === "nerd") return "nerd";
	if (mode === "ascii") return "ascii";
	if (mode === "unicode") return "unicode";
	// Auto never picks the Nerd Font set: the font belongs to the terminal that
	// draws the session, locally or over SSH, and cannot be seen from here. Its
	// private-use glyphs show as boxes without the font, so Nerd is an explicit
	// opt-in and auto settles on portable Unicode symbols.
	return detectUnicodeTerminal() ? "unicode" : "ascii";
}

export function resolveGlyphs(mode: IconMode): IconGlyphs {
	const resolved = resolveIconMode(mode);
	if (resolved === "unicode") return UNICODE_GLYPHS;
	return resolved === "nerd" ? NERD_GLYPHS : ASCII_GLYPHS;
}

const RUNTIME_SYMBOLS: Record<string, string> = {
	nodejs: "\uE718",
	rust: "\uE7A8",
	go: "\uE626",
	python: "\uE73C",
	ruby: "\uE739",
	java: "\uE256",
	cpp: "\uE61D",
	c: "\uE61E",
	swift: "\uE755",
	kotlin: "\uE634",
	deno: "\uE7FB",
	bun: "\uE76F",
	php: "\uE73D",
	haskell: "\uE777",
	julia: "\uE624",
	lua: "\uE620",
	elixir: "\uE62B",
	erlang: "\uE7B1",
	gleam: "\uE6B4",
	crystal: "\uE62F",
	dart: "\uE7C0",
	nim: "\uE677",
	zig: "\uE6A9",
	ocaml: "\uE67A",
	clojure: "\uE76A",
	scala: "\uE747",
	perl: "\uE769",
	r: "\uE68A",
	elm: "\uE62C",
	haxe: "\uE7B7",
	vagrant: "\uE21A",
	terraform: "\uE1A5",
};

const RUNTIME_ASCII_SYMBOLS: Record<string, string> = {
	nodejs: "node",
	rust: "rs",
	go: "go",
	python: "py",
	ruby: "rb",
	java: "java",
	swift: "swift",
	kotlin: "kt",
	cpp: "c++",
	c: "c",
	deno: "deno",
	bun: "bun",
	php: "php",
	haskell: "hs",
	julia: "jl",
	lua: "lua",
	elixir: "ex",
	erlang: "erl",
	gleam: "gleam",
	crystal: "cr",
	dart: "dart",
	nim: "nim",
	zig: "zig",
	ocaml: "ml",
	clojure: "clj",
	scala: "scala",
	perl: "pl",
	r: "R",
	elm: "elm",
	haxe: "hx",
	vagrant: "vag",
	terraform: "tf",
};

export function runtimeSymbol(name: string, mode: IconMode): string {
	if (resolveIconMode(mode) !== "nerd") return RUNTIME_ASCII_SYMBOLS[name] ?? name;
	return RUNTIME_SYMBOLS[name] ?? "";
}
