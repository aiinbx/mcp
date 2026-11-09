# AI Inbx over MCP

[AI Inbx](https://aiinbx.com) is an email API: sending and receiving on your domains and connected Gmail and Outlook mailboxes, threads, webhooks, suppressions and pacing. It runs two MCP servers, so an assistant in Claude, ChatGPT, Cursor, VS Code, Codex or any other MCP client can read threads, send, reply and schedule mail, set up domains and manage the rest of a workspace, or have an email address of its own.

Both are remote servers (Streamable HTTP). There is nothing to install or run, and the first call opens a browser to sign in. This repository holds [`aiinbx-mcp`](#stdio-package), the stdio package for clients that start MCP servers as a command.

## Workspace server

```
https://mcp.aiinbx.com/mcp
```

The workspace server, `aiinbx`, lets an assistant work in AI Inbx for you. It can read threads, send and schedule mail, set up domains, tune pacing, manage suppressions and webhooks, and invite teammates.

### Claude Code

In a terminal:

```sh
claude mcp add --transport http aiinbx https://mcp.aiinbx.com/mcp
```

Then run `/mcp` and pick aiinbx to sign in.

### Codex

In a terminal:

```sh
codex mcp add aiinbx --url https://mcp.aiinbx.com/mcp
codex mcp login aiinbx
```

The Codex CLI, app and IDE extension share this configuration.

### Cursor

In `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aiinbx": {
      "url": "https://mcp.aiinbx.com/mcp"
    }
  }
}
```

`.cursor/mcp.json` in a project takes the same entry, for that project only.

### Claude

In **Customize → Connectors → Add custom connector**:

```text
https://mcp.aiinbx.com/mcp
```

Name it AI Inbx and paste the URL, then Connect to sign in and choose the workspaces it may run.

On a Team or Enterprise plan, an owner adds it under **Organization settings** → **Connectors** first, and members then connect it from **Customize** → **Connectors**.

### ChatGPT

In **Settings → Apps & Connectors → Create**:

```text
https://mcp.aiinbx.com/mcp
```

Turn on developer mode first. Name it AI Inbx, pick OAuth, then sign in and choose the workspaces it may run.

Developer mode is on the Plus, Pro, Business, Enterprise and Edu plans.

### VS Code

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "aiinbx": {
      "type": "http",
      "url": "https://mcp.aiinbx.com/mcp"
    }
  }
}
```

### Other clients

Setup for Gemini CLI, OpenClaw, Windsurf, OpenCode, Antigravity, Devin, Zed, Warp and Hermes is in the [MCP docs](https://docs.aiinbx.com/mcp). Any client that speaks MCP's authorization flow signs in on its own when pointed at the URL.

## Inbox server

```
https://mcp.aiinbx.com/inbox
```

The inbox server, `aiinbx-inbox`, gives the assistant an email address of its own. It sends from it and reads the replies, and nothing else in the workspace is visible to it.

Claude Code:

```sh
claude mcp add --transport http aiinbx-inbox https://mcp.aiinbx.com/inbox
```

Codex:

```sh
codex mcp add aiinbx-inbox --url https://mcp.aiinbx.com/inbox
codex mcp login aiinbx-inbox
```

Other clients take the same entry as for the workspace server, with the name `aiinbx-inbox` and this URL. Add it beside the workspace server and the client keeps both. What the sign-in asks and what the inbox may do are in [Give your agent an inbox](https://docs.aiinbx.com/guides/agent-inbox).

## With an API key

A client that cannot open a browser, such as one on a server, in CI or in a headless agent, can send an [API key](https://docs.aiinbx.com/authentication) to the workspace server instead of signing in. It then acts as the key: in the key's workspace, at the key's scope. Keep the key in the environment, never in a file you commit.

Claude Code:

```sh
claude mcp add --transport http aiinbx https://mcp.aiinbx.com/mcp \
  --header "Authorization: Bearer $AI_INBX_API_KEY"
```

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.aiinbx]
url = "https://mcp.aiinbx.com/mcp"
bearer_token_env_var = "AI_INBX_API_KEY"
```

Cursor takes a `headers` object beside `url`. Other clients take the same `headers` in their own entry:

```json
{
  "mcpServers": {
    "aiinbx": {
      "url": "https://mcp.aiinbx.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:AI_INBX_API_KEY}"
      }
    }
  }
}
```

The inbox server takes no API key: a key acts for its whole workspace, and an inbox reaches only its own addresses.

## Stdio package

`aiinbx-mcp` is the workspace server over stdio, for a client that starts MCP servers as a command. It passes every message between the client and `https://mcp.aiinbx.com/mcp`, signed with your API key. The hosted server is the preferred way to connect; this package also works.

Create an [API key](https://docs.aiinbx.com/authentication) and give it to the command as `AI_INBX_API_KEY`:

```json
{
  "mcpServers": {
    "aiinbx": {
      "command": "npx",
      "args": ["-y", "aiinbx-mcp"],
      "env": {
        "AI_INBX_API_KEY": "aibx_live_…"
      }
    }
  }
}
```

Claude Code:

```sh
claude mcp add --transport stdio aiinbx --env AI_INBX_API_KEY=aibx_live_… -- npx -y aiinbx-mcp
```

The assistant acts as the key: in the key's workspace, at the key's scope (read, read and send, or full access).

### Environment

| Variable          | What it is                                                                    |
| ----------------- | ----------------------------------------------------------------------------- |
| `AI_INBX_API_KEY` | The API key to act as. Required.                                              |
| `AI_INBX_MCP_URL` | Another AI Inbx MCP server to pass to. Default: `https://mcp.aiinbx.com/mcp`. |

Without a key, or with one AI Inbx does not accept, every request is answered with an error that says so, and the same line goes to stderr.

### Coming from version 1

- The command and `AI_INBX_API_KEY` are the same, so an existing config keeps working. Keys from the previous aiinbx.com (`inbx_…`) are accepted.
- The tools are the hosted server's: names follow `aiinbx_emails_send`, `aiinbx_threads_reply`, `aiinbx_domains_list`. See the [tool reference](https://docs.aiinbx.com/mcp/tools).
- The flags that picked and reshaped tools (`--tools`, `--tool`, `--resource`, `--operation`, `--tag`, `--client`, `--capability` and their `--no-` forms) are accepted and change nothing.
- `--transport http` is the hosted server now: connect your client to `https://mcp.aiinbx.com/mcp`.

## Tools

On the workspace server, the daily work has tools of its own: `aiinbx_emails_send`, `aiinbx_threads_reply`, `aiinbx_domains_verify` and so on. Everything else in the API is reached through four more:

- `aiinbx_api_list` and `aiinbx_api_describe` find an operation and what it takes.
- `aiinbx_api_read` and `aiinbx_api_write` call it.

The inbox server offers only the mail tools an inbox may call, and none of the four.

The [tool reference](https://docs.aiinbx.com/mcp/tools) lists every tool and operation with its arguments. The stdio package defines no tools itself: a tool added to the hosted server is available through it on the next start, with no update of the package.

## Development

```sh
bun install
bun run typecheck
bun test
bun run build
```

`bun run build` writes `dist/index.js`, the file `npx aiinbx-mcp` runs on Node 20 or later. A release is a version bump in `package.json` plus a `v<version>` tag.

## License

MIT
