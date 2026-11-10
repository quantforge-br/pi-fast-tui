import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { lastOutputLine, parseArgs, parseScriptOutput, scriptTitle, summarizeCall } from "../../src/cards/codemode/summarize.ts";

const CWD = "/home/user/project";

describe("parseArgs", () => {
	it("reads arguments cut off mid-string", () => {
		const preview = '{"command":"cd /x && echo \\"hi\\"\\nsleep 1 ...';
		expect(parseArgs(preview)).toEqual({ command: 'cd /x && echo "hi"\nsleep 1 ...' });
	});

	it("does not take keys from inside string values", () => {
		expect(parseArgs('{"command":"echo \\"path\\":\\"x\\" and more ...')).toEqual({
			command: 'echo "path":"x" and more ...',
		});
	});

	it("reads complete arguments as JSON", () => {
		expect(parseArgs('{"path":"a","limit":3}')).toEqual({ path: "a", limit: 3 });
	});
});

describe("summarizeCall", () => {
	const bash = (command: string) => summarizeCall("bash", JSON.stringify({ command }), CWD);

	it("drops the setup in front of a command and keeps where it runs", () => {
		expect(bash("cd /home/user/project/backends && for d in a b; do echo $d; done")).toEqual({
			label: "$",
			detail: "for d in a b; do echo $d; done",
			where: "backends",
		});
	});

	it("does not repeat the session's directory", () => {
		expect(bash(`cd ${CWD} && git status`)).toEqual({ label: "$", detail: "git status", where: undefined });
	});

	it("strips assignments and keeps a multi-line command on one line", () => {
		expect(bash('BK=~/state\ncd /opt/app\n# build it\nmake all > "$BK/log"\ntail -1 "$BK/log"')).toEqual({
			label: "$",
			detail: 'make all > "$BK/log" ↵ tail -1 "$BK/log"',
			where: "/opt/app",
		});
	});

	it("keeps a command that is only a cd", () => {
		expect(bash("cd /tmp").detail).toBe("cd /tmp");
	});

	it("shortens paths and shows read ranges", () => {
		expect(summarizeCall("read", '{"path":"/home/user/project/src/a.ts","offset":10,"limit":5}', CWD)).toEqual({
			label: "read",
			detail: "src/a.ts:10-14",
		});
		expect(summarizeCall("read", `{"path":"${homedir()}/notes.md"}`, CWD).detail).toBe("~/notes.md");
	});

	it("names MCP tools by server and leads with the subject", () => {
		expect(summarizeCall("mcp__dev-radius__search", '{"limit":3,"query":"auth"}', CWD)).toEqual({
			label: "dev-radius › search",
			detail: "auth · 3",
		});
	});

	it("keeps the provider and model of models calls", () => {
		expect(summarizeCall("models.classify", "typesafe/jev-latest", CWD).detail).toBe("typesafe/jev-latest");
	});

	it("handles tools without arguments", () => {
		expect(summarizeCall("get_goal", "{}", CWD)).toEqual({ label: "get_goal", detail: "" });
	});
});

describe("scriptTitle", () => {
	it("reads the opening comment, also after the options line", () => {
		expect(scriptTitle("// Check versions\nawait x();")).toBe("Check versions");
		expect(scriptTitle('// @options: {"timeout_ms": 1}\n\n// Check versions\nawait x();')).toBe("Check versions");
	});

	it("ignores comments after the first statement", () => {
		expect(scriptTitle("const a = 1;\n// not a title")).toBeUndefined();
	});
});

describe("parseScriptOutput", () => {
	it("removes the framing the model gets", () => {
		const output = parseScriptOutput([
			{ type: "text", text: "Script completed\nWall time 240.1 seconds\nOutput:\n" },
			{ type: "text", text: "==> text 1/2 <==\nfirst" },
			{ type: "text", text: "<console_output>\nsecond\n</console_output>" },
			{ type: "image" },
		]);
		expect(output).toEqual({ text: "first\nsecond", wallTimeMs: 240100, images: 1 });
	});

	it("keeps rejected input, which has no header", () => {
		expect(parseScriptOutput([{ type: "text", text: "Bad options" }])).toEqual({
			text: "Bad options",
			wallTimeMs: undefined,
			images: 0,
		});
	});
});

describe("lastOutputLine", () => {
	it("returns the last line with text, without colors or carriage-return progress", () => {
		expect(lastOutputLine([{ type: "text", text: "a\n\x1b[32m[1/3]\x1b[0m\r[2/3]\n\n" }])).toBe("[2/3]");
	});

	it("is undefined without output", () => {
		expect(lastOutputLine(undefined)).toBeUndefined();
		expect(lastOutputLine([{ type: "text", text: " \n" }])).toBeUndefined();
	});
});
