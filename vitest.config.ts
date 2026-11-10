import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// The reference checkouts of the merged plugins live next to the package and must not be collected.
		include: ["test/**/*.test.ts"],
		exclude: ["node_modules/**", "pi-omp-tools/**", "pi-open-tui/**"],
		setupFiles: ["test/setup/hermetic-env.ts"],
	},
});
