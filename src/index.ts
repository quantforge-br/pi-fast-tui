// fast-tui: Open TUI's interface with oh-my-pi style tool cards behind one tool renderer.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createResolver } from "./cards/index.ts";
import { setupCodemode } from "./cards/codemode/extension.ts";
import setupUi from "./ui/index.ts";

export default function (pi: ExtensionAPI) {
	setupUi(pi, { cards: (isActive) => createResolver(setupCodemode(pi, isActive)) });
}
