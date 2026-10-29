# magpick

**Session-scoped model picker for the [Magpie](https://github.com/yetone/magpie) gateway.**

`magpick` keeps the interaction of [ccsc](https://github.com/terranc/ccsc) — search, arrow keys, preview, history — but selects a Magpie model (`provider/model` or a routing group) instead of a CC Switch provider. Each launch gets its own isolated Claude settings file or Codex `CODEX_HOME`, so parallel sessions can use different models without touching global configs.

## Status

Early scaffold (`v0.1.0`). The product spec lives in `.trellis/tasks/10-30-product-prd/prd.md` (Trellis task `10-30-product-prd`).

## Why

- Magpie providers are not split into `claude` and `codex` buckets. A provider exposes protocol endpoints (`anthropic`, `chat`, `responses`, `gemini`) and its keys can carry a protocol.
- Magpie's gateway translates between OpenAI Chat, OpenAI Responses, Anthropic Messages and Gemini, so Claude Code and Codex can pick from the same model catalog.
- The selection unit is therefore a model, not a provider.

## Requirements

- Node.js >= 18
- Magpie installed and its gateway running (menu bar app, `magpie serve`, or `magpie daemon`)
- Claude Code and/or Codex CLI installed
- The gateway must expose `/v1/models` and, for Codex, `/v1/codex/models`

## Development

```bash
npm install
npm run build
node dist/index.js --json
```

Link locally:

```bash
npm link
magpick --json
```

## Usage

```bash
magpick                  # pick a model, then launch Claude Code
magpick claude           # same
magpick codex            # pick a model, then launch Codex
magpick --clear          # remove generated Claude/Codex configs
magpick --gateway <url>  # override the Magpie gateway
magpick --native         # only models that natively speak the target API
magpick --json           # print the model catalog and exit
```

Target CLI arguments pass through after the subcommand:

```bash
magpick --continue
magpick codex -- --full-auto
```

## How it works

### Claude Code

`magpick` writes `~/.claude/magpick-<slug>-<hash>.settings.json` based on the user's `~/.claude/settings.json`, preserving hooks, plugins, permissions and status line. It sets:

```text
model
env.ANTHROPIC_BASE_URL
env.ANTHROPIC_AUTH_TOKEN
env.ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS,FABLE}_MODEL
env.ANTHROPIC_SMALL_FAST_MODEL
```

Then launches `claude --settings=<file>`. The global settings file is never modified.

### Codex

`magpick` creates `~/.magpick/codex/<slug>-<hash>/` with:

- `config.toml` — `model_provider = "magpie"`, the selected `model`, a `[model_providers.magpie]` block pointing at the gateway, and the user's other Codex settings.
- `magpie-models.json` — the catalog fetched from `GET /v1/codex/models`.

Then launches `codex` with `CODEX_HOME` pointing at that directory.

### Protocol badges

The picker reads `native_endpoints` from `/v1/models`:

- `M` — native Anthropic Messages
- `R` — native OpenAI Responses
- `C` — native OpenAI Chat Completions
- `G` — native Gemini
- no badge — Magpie translates the request

By default all models are shown. `--native` filters to models that natively speak the target agent's API.

## Gateway configuration

Resolution order:

1. `--gateway <url>`
2. `MAGPIE_GATEWAY` (full URL)
3. `MAGPIE_ADDR` (`host:port`)
4. `http://127.0.0.1:3425`

Remote gateways need `MAGPIE_GATEWAY_KEY`; loopback requests use the local `magpie` token.

## Safety

- `magpick` never reads provider API keys; it only reads the gateway's model catalog.
- It never writes `~/.claude/settings.json` or `~/.codex/config.toml`.
- Generated files are written with mode `0600`.
- `magpick --clear` removes only `~/.claude/magpick-*.settings.json` and `~/.magpick/codex/*`.

## Naming

`magpick` = Magpie + pick. The command is `magpick`; the npm package is `@terranc/magpick`.

## License

MIT
