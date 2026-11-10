import type { ExtensionAPI, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import extension, { createResolver } from "../../src/cards/index.ts";
import { draw, newRow } from "./row.ts";

const resolve = createResolver(() => ({ variant: "inline", status: { title: "Codemode" } }));
const none = () => undefined;

describe("resolver", () => {
	it("draws built-in tools and codemode as self-framed cards, ignoring the rest of the chain", () => {
		const other: ToolRenderers = { renderCall: () => new Text("other", 0, 0) };
		for (const name of ["bash", "read", "edit", "write", "grep", "find", "ls", "codemode"]) {
			const renderers = resolve(name, () => other);
			expect(renderers?.renderShell).toBe("self");
			expect(renderers).not.toBe(other);
		}
		expect(draw(resolve("codemode", none) as ToolRenderers, newRow({ code: "" }))).toBe(" ◌ Codemode");
	});

	it("keeps renderers a tool's extension provides", () => {
		const own: ToolRenderers = { renderCall: () => new Text("own", 0, 0) };
		expect(resolve("ask_user_question", () => own)).toBe(own);
	});

	it("draws MCP tools with the generic card even when pi's MCP support has renderers for them", () => {
		const mcpOwn: ToolRenderers = { renderCall: () => new Text("server/tool", 0, 0) };
		const renderers = resolve("mcp__codegraph__explore", () => mcpOwn);
		expect(renderers).not.toBe(mcpOwn);
		expect(draw(renderers as ToolRenderers, newRow({ query: "x" }))).toContain("codegraph › explore");
	});

	it("falls back to the generic card for MCP tools and tools without renderers", () => {
		const mcp = resolve("mcp__context7__docs", none);
		expect(mcp?.renderShell).toBe("self");
		expect(draw(mcp as ToolRenderers, newRow({ id: "x" }))).toContain("context7 › docs");
		expect(resolve("plain_tool", () => ({ renderShell: "default" }))?.renderShell).toBe("self");
	});

	it("reuses renderers per tool", () => {
		expect(resolve("bash", none)).toBe(resolve("bash", none));
		expect(resolve("mcp__a__b", none)).toBe(resolve("mcp__a__b", none));
	});
});

describe("extension", () => {
	it("registers one renderer resolver and the codemode events", () => {
		const resolvers: unknown[] = [];
		const events: string[] = [];
		const pi = {
			registerToolRenderer: (resolver: unknown) => resolvers.push(resolver),
			on: (event: string) => events.push(event),
		} as unknown as ExtensionAPI;
		extension(pi);
		expect(resolvers).toHaveLength(1);
		expect(events.sort()).toEqual(["before_agent_start", "session_start", "tool_execution_end", "tool_execution_start", "tool_execution_update"]);
	});
});
