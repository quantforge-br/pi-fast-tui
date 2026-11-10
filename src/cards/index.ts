/**
 * Draws pi's tool rows as oh-my-pi cards: built-in tools, codemode scripts, and a generic card for MCP and
 * any other tool that has no renderer of its own. The package entrypoint plugs the resolver into the single tool
 * renderer that src/ui/tool-view.ts registers.
 */

import type { ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type CardBuilder, createCardRenderers } from "./card.ts";
import { CODEMODE_TOOL_NAME } from "./codemode/extension.ts";
import { bashCard } from "./tools/bash.ts";
import { editCard } from "./tools/edit.ts";
import { createGenericCard } from "./tools/generic.ts";
import { readCard } from "./tools/read.ts";
import { findCard, grepCard, lsCard } from "./tools/search.ts";
import { writeCard } from "./tools/write.ts";

const MCP_PREFIX = "mcp__";

const BUILT_IN_CARDS: Record<string, CardBuilder> = {
	bash: bashCard,
	read: readCard,
	edit: editCard,
	write: writeCard,
	grep: grepCard,
	find: findCard,
	ls: lsCard,
};

/** Picks the renderers for a tool; `next` is what the rest of the chain would draw. */
export function createResolver(codemode: CardBuilder): (toolName: string, next: () => ToolRenderers | undefined) => ToolRenderers | undefined {
	const cache = new Map<string, ToolRenderers>();
	const cached = (name: string, build: () => ToolRenderers): ToolRenderers => {
		let renderers = cache.get(name);
		if (!renderers) {
			renderers = build();
			cache.set(name, renderers);
		}
		return renderers;
	};
	return (toolName, next) => {
		// The codemode card replaces pi-codemode-render and pi's own codemode rows, so it does not chain to them.
		if (toolName === CODEMODE_TOOL_NAME) return cached(toolName, () => createCardRenderers(codemode));
		const builtIn = BUILT_IN_CARDS[toolName];
		if (builtIn) return cached(toolName, () => createCardRenderers(builtIn));
		// pi's MCP support draws its tools as one plain line, so MCP tools get the generic card too.
		if (toolName.startsWith(MCP_PREFIX)) return cached(toolName, () => createCardRenderers(createGenericCard(toolName)));
		// A tool whose extension draws it keeps that drawing; the generic card is only a fallback.
		const own = next();
		if (own?.renderCall || own?.renderResult) return own;
		return cached(toolName, () => createCardRenderers(createGenericCard(toolName)));
	};
}
