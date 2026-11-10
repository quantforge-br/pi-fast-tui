// Short text helpers shared by the tool cards: durations, paths and plurals.

import { homedir } from "node:os";
import { isAbsolute, relative } from "node:path";

/** Duration as `0.18s` below ten seconds, `12.5s` below a minute, then `1m 30s` and `2h 3m`. */
export function formatDuration(ms: number): string {
	if (ms < 10_000) return `${(ms / 1000).toFixed(2)}s`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const seconds = Math.round(ms / 1000);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m ${seconds % 60}s`;
}

/** A path relative to the working directory when inside it, else with the home directory as `~`. */
export function displayPath(path: string, cwd: string): string {
	if (isAbsolute(path)) {
		const inside = relative(cwd, path);
		if (inside && !inside.startsWith("..") && !isAbsolute(inside)) return inside;
		const home = homedir();
		if (path === home || path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
	}
	return path;
}

/** `1 match`, `2 matches`. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}
