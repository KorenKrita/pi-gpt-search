import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CodexWebSearchProvider } from "./codex-provider.js";
import { createResearchTool } from "./research-tool.js";
import { registerSearchCommand } from "./search-command.js";

export default function (pi: ExtensionAPI) {
  const provider = new CodexWebSearchProvider();

  // Register codex-research harness tool
  pi.registerTool(createResearchTool(provider));

  // Register /codex-search and /codex-research slash commands
  registerSearchCommand(pi, provider);
}
