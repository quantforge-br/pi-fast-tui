import { describe, expect, it } from "vitest";
import { formatArgsInline, formatScalar, JSON_TREE_COLLAPSED, JSON_TREE_EXPANDED, renderJsonTree } from "../../src/cards/json-tree.ts";
import { plain, theme } from "./helpers.ts";

describe("formatScalar", () => {
	it("escapes and cuts strings, sizes containers", () => {
		expect(formatScalar("a\nb", 10)).toBe('"a\\nb"');
		expect(formatScalar("abcdefghij", 5)).toBe('"abcd…"');
		expect(formatScalar([1, 2], 5)).toBe("[2 items]");
		expect(formatScalar({ a: 1 }, 5)).toBe("{1 keys}");
		expect(formatScalar(null, 5)).toBe("null");
	});
});

describe("formatArgsInline", () => {
	it("lists every key while it fits", () => {
		expect(formatArgsInline({ query: "pi", limit: 5 }, 60)).toBe('query="pi", limit=5');
	});

	it("keeps room for later keys when a value is long", () => {
		const text = formatArgsInline({ query: "x".repeat(100), limit: 5 }, 40);
		expect(text).toContain("limit=5");
		expect(text.length).toBeLessThanOrEqual(40);
	});
});

describe("renderJsonTree", () => {
	it("draws nested values with connectors and keeps small containers inline", () => {
		const tree = renderJsonTree({ name: "pi", tags: ["a", "b"], nested: { deep: { value: "x".repeat(80) } } }, theme, JSON_TREE_EXPANDED);
		expect(plain(tree.lines)).toBe(
			[
				'├─ name: "pi"',
				'├─ tags: ["a","b"]',
				"└─ nested: {1 keys}",
				"   └─ deep: {1 keys}",
				`      └─ value: "${"x".repeat(80)}"`,
			].join("\n"),
		);
		expect(tree.truncated).toBe(false);
	});

	it("stops at the line and depth bounds", () => {
		const many = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`k${index}`, index]));
		const tree = renderJsonTree(many, theme, JSON_TREE_COLLAPSED);
		expect(tree.lines).toHaveLength(6);
		expect(tree.truncated).toBe(true);
		const deep = renderJsonTree({ a: { b: { c: { d: "x".repeat(70) } } } }, theme, JSON_TREE_COLLAPSED);
		expect(deep.truncated).toBe(true);
	});

	it("draws a scalar root as one line", () => {
		expect(plain(renderJsonTree(42, theme, JSON_TREE_COLLAPSED).lines)).toBe("42");
	});
});
