// Adapts the node:test API these suites were written against to vitest, so only their imports changed.
import { onTestFinished, test as vitestTest } from "vitest";

export interface TestContext {
	/** Runs `fn` after the test finishes, pass or fail. */
	after(fn: () => unknown): void;
}

export interface TestOptions {
	skip?: boolean | string;
	timeout?: number;
}

type TestFn = (t: TestContext) => unknown;

const context: TestContext = {
	after(fn) {
		onTestFinished(async () => {
			await fn();
		});
	},
};

export default function test(name: string, optionsOrFn: TestOptions | TestFn, maybeFn?: TestFn): void {
	const options = typeof optionsOrFn === "function" ? {} : optionsOrFn;
	const fn = typeof optionsOrFn === "function" ? optionsOrFn : maybeFn;
	if (!fn) throw new Error(`test "${name}" has no body`);
	const run = vitestTest.skipIf(Boolean(options.skip));
	run(name, async () => {
		await fn(context);
	}, options.timeout);
}
