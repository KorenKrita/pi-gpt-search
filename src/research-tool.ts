import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { WebSearchProvider } from "./provider.js";
import type { WebRunCommand } from "./commands.js";
import { formatWebToolResult } from "./output.js";
import { makeWebToolRenderer } from "./render.js";
import { BROWSING_GUIDELINES, ResearchToolParameters } from "./web-schemas.js";
import { describeCommandStatus } from "./web-format.js";

export const RESEARCH_TOOL_NAME = "codex-research";
/** Custom entry type used by the slash commands to show output in the transcript. */
export const SEARCH_OUTPUT_ENTRY_TYPE = "gpt-search-output";

/** Minimal slice of the Pi session context used to keep backend refs stable. */
export interface ResearchSessionContext {
  sessionManager?: { getSessionId(): string; getBranch(): unknown[] };
}

/**
 * Backend research session id for the current Pi session.
 *
 * Codex resolves ref_ids like `turn0search0` only within the backend session that produced
 * them, so the id must survive reloads, resumes and forks. Reuse the newest id recorded on
 * the current branch (tool results and slash-command entries both record one); otherwise
 * derive it from the Pi session id, which is stable across reload/resume.
 */
export function resolveResearchSessionId(ctx: ResearchSessionContext | undefined): string | undefined {
  const manager = ctx?.sessionManager;
  if (!manager) return undefined;
  const branch = manager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i] as {
      type?: string;
      customType?: string;
      data?: { researchSessionId?: unknown };
      message?: { role?: string; toolName?: string; details?: { researchSessionId?: unknown } };
    };
    const recorded =
      entry.type === "message" && entry.message?.role === "toolResult" && entry.message.toolName === RESEARCH_TOOL_NAME
        ? entry.message.details?.researchSessionId
        : entry.type === "custom" && entry.customType === SEARCH_OUTPUT_ENTRY_TYPE
          ? entry.data?.researchSessionId
          : undefined;
    if (typeof recorded === "string" && recorded) return recorded;
  }
  return `pi-session-${manager.getSessionId()}`;
}

/** Shared execution path for the `codex-research` tool. */
export async function executeResearch(
  provider: WebSearchProvider,
  params: WebRunCommand,
  signal: AbortSignal | undefined,
  onUpdate: ((update: { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }) => void) | undefined,
  researchSessionId?: string
) {
  const command = params;
  if (!command.response_length) {
    command.response_length = "long";
  }
  if (typeof onUpdate === "function") {
    const statusMsg = describeCommandStatus(command);
    onUpdate({
      content: [{ type: "text", text: statusMsg }],
      details: { status: statusMsg, command },
    });
  }
  const sessionDetails = researchSessionId ? { researchSessionId } : {};
  try {
    const response = await provider.execute(command, researchSessionId ? { sessionId: researchSessionId } : undefined, signal);
    const formatted = formatWebToolResult(command, response);
    return { ...formatted, details: { ...formatted.details, ...sessionDetails } };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const content: Array<{ type: "text"; text: string }> = [
      { type: "text", text: `Web execution failed: ${errorMsg}` },
    ];
    return {
      content,
      details: { error: errorMsg, ...sessionDetails },
      isError: true,
    };
  }
}

export function createResearchTool(provider: WebSearchProvider): ToolDefinition {
  return {
    name: RESEARCH_TOOL_NAME,
    label: "Codex Research Harness",
    description:
      "Execute iterative web research actions (search_query, image_query, open, find, click, weather, response_length) against live web search & document browser engine. Use to search current information, inspect official docs, find images, look up weather, and perform iterative multi-step research. open also accepts a full URL, including PDFs.",
    promptSnippet: "Perform iterative web research with search, open, find, click, plus image search and weather",
    promptGuidelines: BROWSING_GUIDELINES,
    parameters: ResearchToolParameters,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return executeResearch(provider, params as WebRunCommand, signal, onUpdate, resolveResearchSessionId(ctx));
    },
    renderResult: makeWebToolRenderer("codex-research"),
  };
}
