# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-11-13

### Fixed

- Codex launches now pass `--no-daemon` when supported (Codex 0.156+), avoiding the "Running without the shared background server" warning caused by the embedded-only `-c` model overrides. The flag is skipped when the user already passed it or uses `--remote`.

## [0.2.1] - 2026-11-13

### Fixed

- Routing-group deduplication now prefers gateway-qualified ids such as `<gateway>/auto/<name>` and `<gateway>/group/<name>`, avoiding short ids like `auto/free` that the gateway rejects as ambiguous.
- Pi model configuration now always lists `text` as an input modality and keeps only `text` and `image` values.

### Changed

- Both READMEs document the updated deduplication order for models and routing groups.

## [0.2.0] - 2026-11-13

### Added

- Pi, Kimi Code, OpenCode and ZCode support, each with protocol-aware model filtering and session-scoped launch configuration.
- `magpick kimi-code` as an alias for `magpick kimi`.
- Pi configuration isolation through a mirrored `PI_CODING_AGENT_DIR` and generated `models.json`.
- Kimi Code model selection through `KIMI_MODEL_*` environment variables without writing files.
- OpenCode configuration through `OPENCODE_CONFIG_CONTENT` using the v2 provider schema.
- ZCode configuration through an isolated `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`.

### Changed

- Agent metadata, protocol resolution and launch preparation now use a shared agent registry.
- Protocol priority is Chat Completions, Responses, then Messages; routing groups use each agent's default protocol.
- `magpick --clear` also removes `~/.magpick/pi` and `~/.magpick/zcode`.
- Help text, package metadata and both READMEs now cover all supported agents.

### Fixed

- History validation recognizes every supported agent while continuing to ignore unknown entries.

## [0.1.3] - 2026-11-13

### Fixed

- Codex launches now keep the user's real `CODEX_HOME` and override only the model/provider through `-c`, so plugins, plugin-provided MCP servers (such as `context-mode`), skills, hooks, `AGENTS.md` and session history match a direct `codex` invocation.

## [0.1.2] - 2026-11-06

### Fixed

- Provider parsing and model deduplication now cleanly separate same-named models across different providers (such as `antigravity/gemini-3.8-flash` vs `opencode-zen/gemini-3.8-flash`), preventing them from colliding and being dropped.
- Universal routing group and provider identification across multi-tier gateway paths and upstream proxies without local file dependencies or hardcoded instance names.

## [0.1.1] - 2026-10-30

### Fixed

- Claude Code sessions now receive the real context window of the selected model, capped at 1M, instead of being held to the 200K default Claude Code assumes for unrecognized model ids. Models reporting 1M or more get a 1M window; models between 200K and 1M (for example 872K) get their reported window.

### Added

- Initial public release of `magpick`, a session-scoped model picker for the Magpie gateway that launches Claude Code and Codex with the selected model.
- Model picker that filters by the agent's native protocol and de-duplicates aliases, routing groups, and provider-qualified ids.
- Codex support through a generated `CODEX_HOME` with a Magpie provider and model catalog.
- `--clear` to remove generated Claude and Codex configs, and `--json` to print the model list without launching.
