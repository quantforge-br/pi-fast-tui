import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import extension from "../src/index.ts";

/** Records every call the entrypoint makes on pi; unknown methods are no-ops. */
function recordingPi() {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const events = { on: () => () => {}, emit: () => {} };
	const pi = new Proxy({} as Record<string, unknown>, {
		get(_target, key) {
			if (key === "events") return events;
			if (typeof key !== "string" || key === "then") return undefined;
			return (...args: unknown[]) => {
				calls.push({ method: key, args });
			};
		},
	}) as unknown as ExtensionAPI;
	return { pi, calls };
}

describe("entrypoint", () => {
	it("registers exactly one tool renderer", () => {
		const { pi, calls } = recordingPi();
		extension(pi);
		expect(calls.filter((call) => call.method === "registerToolRenderer")).toHaveLength(1);
	});

	it("registers the /fast-tui command and the codemode events", () => {
		const { pi, calls } = recordingPi();
		extension(pi);
		const commands = calls.filter((call) => call.method === "registerCommand").map((call) => call.args[0]);
		expect(commands).toContain("fast-tui");
		expect(commands).not.toContain("open-tui");
		const events = new Set(calls.filter((call) => call.method === "on").map((call) => call.args[0]));
		for (const event of ["before_agent_start", "session_start", "tool_execution_start", "tool_execution_update", "tool_execution_end"]) {
			expect(events.has(event)).toBe(true);
		}
	});
});
