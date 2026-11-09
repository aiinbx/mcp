#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio"

import { version } from "../package.json"
import { bridge } from "./bridge"
import { explain, hosted, HOSTED_URL, KEY_ENV, URL_ENV } from "./hosted"

const USAGE = `aiinbx-mcp ${version}

The AI Inbx MCP server over stdio, for an MCP client that starts a command.
It passes every message to ${HOSTED_URL}, with your API key.

  ${KEY_ENV}   the API key to act as (required)
  ${URL_ENV}   another AI Inbx MCP server, such as a local sandbox

Preferred: connect your client to ${HOSTED_URL} directly. It signs
in with OAuth and there is nothing to install. https://docs.aiinbx.com/mcp`

const log = (line: string) => process.stderr.write(`aiinbx-mcp: ${line}\n`)

/** The value of `--name value` or `--name=value`, when the flag was given. */
function flag(args: string[], name: string) {
  const at = args.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
  if (at === -1) return null
  return args[at]!.includes("=") ? args[at]!.split("=")[1] : args[at + 1]
}

const args = process.argv.slice(2)

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`${USAGE}\n`)
  process.exit(0)
}
if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${version}\n`)
  process.exit(0)
}
// Version 1 could also serve HTTP itself; the hosted server is that now.
if (flag(args, "--transport") === "http") {
  log(`--transport http: connect your client to ${HOSTED_URL} instead`)
  process.exit(1)
}
// Version 1 picked and reshaped tools with flags; the hosted server decides
// what a client is offered, so they change nothing here.
if (args.length) log(`ignoring ${args.join(" ")}`)

const { url, remote } = hosted(process.env)

log(
  `${version}, passing to ${url}. Preferred: connect your MCP client to ${HOSTED_URL} directly (OAuth sign-in, nothing to install). This also works.`
)

await bridge(new StdioServerTransport(), remote, {
  explain,
  report: (error) => log(explain(error)),
})
