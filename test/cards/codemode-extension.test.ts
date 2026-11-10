import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { setupCodemode } from "../../src/cards/codemode/extension.ts";

type Handler = (event: unknown, ctx?: unknown) => unknown;

function fakePi(activeTools: string[]) {
	const handlers = new Map<string, Handler>();
	const pi = {
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		getActiveTools: () => activeTools,
		appendEntry: () => {},
	} as unknown as ExtensionAPI;
	const beforeAgentStart = (sections: Record<string, string>) => {
		handlers.get("before_agent_start")!({ systemPromptOptions: { sections } });
		return sections;
	};
	return { pi, beforeAgentStart };
}

describe("codemode title guideline", () => {
	it("is asked for only while cards are active and codemode is on", () => {
		let active = true;
		const { pi, beforeAgentStart } = fakePi(["codemode"]);
		setupCodemode(pi, () => active);
		expect(beforeAgentStart({}).codemode_titles).toContain("codemode script");
		active = false;
		expect(beforeAgentStart({ codemode_titles: "stale" })).not.toHaveProperty("codemode_titles");
	});

	it("defaults to active and skips sessions without codemode", () => {
		const withCodemode = fakePi(["codemode"]);
		setupCodemode(withCodemode.pi);
		expect(withCodemode.beforeAgentStart({})).toHaveProperty("codemode_titles");
		const without = fakePi(["read"]);
		setupCodemode(without.pi);
		expect(without.beforeAgentStart({})).not.toHaveProperty("codemode_titles");
	});
});
