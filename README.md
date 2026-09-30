# pi-gpt-search

> **Native, Model-Independent Web Search for Pi using OpenAI Codex Standalone Search Engine.**

`pi-gpt-search` gives **any** Pi model (Gemini, Claude, local models, OpenRouter) real-time web search capabilities by reusing OpenAI Codex's standalone web retrieval infrastructure - with **ZERO GPT Model Inference Turns** and **ZERO GPT Tokens Consumed**.

---

## ⚡ Quick Start: 1-Line Installation

> This is a fork of [`mateusdcc/pi-gpt-search`](https://github.com/mateusdcc/pi-gpt-search). The npm package `pi-gpt-search` is the upstream version; install this fork from git.

Install via GitHub:

```bash
pi install git:github.com/KorenKrita/pi-gpt-search
```

Or install project-locally for your current repository (`-l` flag):

```bash
pi install git:github.com/KorenKrita/pi-gpt-search -l
```

Or try it temporarily in a single session without installing:

```bash
pi -e git:github.com/KorenKrita/pi-gpt-search
```

---

## ⚡ Key Highlights: ZERO-GPT INFERENCE

- 🚀 **Zero GPT Tokens Spent:** Pure web retrieval via OpenAI's backend endpoint. No GPT/Codex LLM turns are executed, meaning **0 input tokens, 0 output tokens, and 0 reasoning credits are billed**.
- 👑 **Model Sovereign:** Your active Pi model (e.g., Gemini 3.5 Flash / Gemini 3.1 Pro) remains the sole reasoning model.
- 🛠️ **Slash Command & LLM Tools:** Works automatically as a single LLM tool (`codex-research`) and as direct user commands (`/codex-search`, `/codex-research`).
- 🔑 **Credential Reuse:** Automatically uses your existing `codex login` session (`~/.codex/auth.json`) or custom `.env` tokens.
- 🛡️ **Data Privacy:** Query-only by default. Does not send conversation history, project files, or system prompts to search.

---

## 🏗️ Architecture

```text
Pi Coding Agent
 └── Gemini (or active model)
      └── codex-research(search_query: [...], open: [...], find: [...])
           └── Multi-Step Web Research Harness
                └── Deep document content, pattern matching & citations
```

---

## 🛠️ Usage & Commands

### 1. Direct Slash Commands

Run Codex search yourself without spending LLM tokens:

```text
/codex-search Rust 1.97 release notes
/codex-research OpenAI Codex GitHub repository
```

Use `/codex-search` for a quick single-query lookup (`short` output, accepts `{"query","recency","domains","response_length"}` JSON) and `/codex-research` for full research commands (`long` output by default).

### 2. Automatic LLM Tool: `codex-research`

Ask any model a question requiring current facts:

```bash
pi --model antigravity/gemini-3.5-flash "What is the latest release of Rust and what changed?"
```

For simple lookups the model issues a single `search_query`. It can also conduct deep, iterative web research with multi-query execution, page content inspection, pattern finding, and link navigation. The model manages the research steps and sources for you.

Supported operations (combine freely in one call):

| Operation | Purpose |
|---|---|
| `search_query` | Web search; results carry ref_ids such as `turn0search0` |
| `open` | Open a ref_id or a full URL (HTML and PDF; PDFs come back with per-page line markers) |
| `find` / `click` | Search inside, or follow a link from, an opened page |
| `image_query` | Image search; returns source page, image URL and a text description (images are not attached) |
| `weather` | Current conditions and forecast for a `location`, optional `start` (YYYY-MM-DD) and `duration` (days). Unknown place names can resolve to a different place, so check the returned location |

**Research sessions.** ref_ids only resolve inside the backend session that produced them. The extension keeps that backend session id stable for a Pi session (recorded in tool results and reused after `/reload` and resume), so references keep working as long as the backend still retains them; retention is not documented, so stale refs fail with a hint to search again or open the full URL. A fork inherits and shares the parent's backend session rather than getting an independent copy. A brand-new Pi session starts a fresh backend session. Sessions created before this version used a random per-process id that cannot be recovered.

**Failures.** The backend reports invalid arguments and unresolved refs inside HTTP 200 bodies. The extension marks these as tool errors (or, for mixed calls, prefixes a `Some operations failed` note while keeping the successful content).

The endpoint also accepts `finance`, `sports`, `time` and PDF `screenshot`; they are intentionally not exposed (limited market coverage, strict parameters, local clock available, and screenshot output is not returned in readable form).

## Example Log Output (with `PI_WEB_SEARCH_DEBUG=1`):

```text
[PI_WEB_SEARCH_DEBUG] req_id=maqk8a5 query="latest Rust release version and date 2026" provider=codex
[PI_WEB_SEARCH_DEBUG] req_id=maqk8a5 status=200 elapsed_ms=1863 results=41
```

---

## 📋 Requirements

1. **Pi Coding Agent:** `pi` CLI installed (`v0.80+`).
2. **Node.js:** `v18.0.0` or higher.
3. **OpenAI Codex Auth:** An authenticated Codex session (run `codex login` in terminal, or set `CODEX_ACCESS_TOKEN` in `.env`).

---

## ⚙️ Manual Installation & Environment Setup

If you prefer manual placement instead of `pi install`:

### 1. Manual Placement

```bash
# Global (All projects)
mkdir -p ~/.pi/agent/extensions
cp -r pi-gpt-search ~/.pi/agent/extensions/

# Project-local
mkdir -p .pi/extensions
cp -r pi-gpt-search .pi/extensions/
```

### 2. Environment Variables (Optional)

Copy `.env.example` to `.env` if you want to explicitly override your Codex access token:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Optional: If unset, automatically reads ~/.codex/auth.json
CODEX_ACCESS_TOKEN=your_token_here
CODEX_ACCOUNT_ID=your_account_id_here

# Enable debug logging
PI_WEB_SEARCH_DEBUG=1
```

> **Security Note:** Never commit `.env` to Git. `.env` is listed in `.gitignore`.

---

## 🧪 Running Tests

`pi-gpt-search` comes with a 4-level test suite:

```bash
npm test
```

Test suite breakdown:
- **Unit Tests (`unit.test.ts`, `commands.test.ts`, `normalize.test.ts`, `output.test.ts`, `web-tool.test.ts`):** Schema validation, DTO normalization, error classes, output formatting, collapsible display.
- **Integration Tests (`provider-integration.test.ts`):** Mock server handling for 200, 401, 403, 429, 500, timeouts, cancellation.
- **Real Search Test (`real-search.test.ts` & `real-endpoint.test.ts`):** Live execution against OpenAI's search endpoint and session continuity.
- **Zero-GPT Verification (`zero-gpt.test.ts`):** Network interception test proving **0 GPT inference calls** are made.
- **E2E Research Harness Suite (`e2e-research.test.ts`):** Full end-to-end multi-step web research test suite.

---

## 📖 Documentation

- [HOW-IT-WORKS.md](./HOW-IT-WORKS.md) - Deep architectural breakdown of modules, data flow, TUI renderers, context isolation, and cancellation.
- [HOW-IT-WAS-EXTRACT.md](./HOW-IT-WAS-EXTRACT.md) - Reverse-engineering guide documenting how the standalone search endpoint was discovered.

---

## ⚠️ Limitations

- **Search Index Scope:** Returns search result snippets, URLs, and document views; does not include a full headless browser DOM renderer.
- **Session Auth:** Requires an active ChatGPT/Codex login session (`codex login`). Expired sessions require running `codex login` to re-authenticate.

---

## 📜 License

MIT License.
