import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import setupUi from "./ui/index.ts";

export default function (pi: ExtensionAPI) {
	setupUi(pi);
}
