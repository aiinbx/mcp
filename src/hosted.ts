import {
  type FetchLike,
  SdkHttpError,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import type { Transport } from "@modelcontextprotocol/server"

import { version } from "../package.json"

/** The workspace MCP server AI Inbx hosts. */
const HOSTED_URL = "https://mcp.aiinbx.com/mcp"
const KEY_ENV = "AI_INBX_API_KEY"
/** Another server to talk to, such as a local AI Inbx sandbox. */
const URL_ENV = "AI_INBX_MCP_URL"
const KEYS_DOCS = "https://docs.aiinbx.com/authentication"

const NO_KEY = `${KEY_ENV} is not set. Create an API key (${KEYS_DOCS}) and set it as ${KEY_ENV}, or connect your MCP client to ${HOSTED_URL} directly and sign in.`

/** A server that takes nothing: every request to it fails with `reason`. */
function refusing(reason: string): Transport {
  return {
    start: async () => {},
    close: async () => {},
    send: async () => {
      throw new Error(reason)
    },
  }
}

/** fetch, with getting no answer at all said as that. */
function reaching(url: string): FetchLike {
  return async (input, init) => {
    try {
      return await fetch(input, init)
    } catch (error) {
      // The transport closing; nothing failed.
      if (init?.signal?.aborted) throw error
      const failure = error instanceof Error ? error : new Error(String(error))
      const cause = failure.cause instanceof Error ? failure.cause : failure
      throw new Error(`Could not reach ${url}: ${cause.message}`)
    }
  }
}

/**
 * The hosted server as this process reaches it: with the API key from the
 * environment, or refusing every request when there is none.
 */
function hosted(env: Record<string, string | undefined>) {
  const url = env[URL_ENV]?.trim() || HOSTED_URL
  const key = env[KEY_ENV]?.trim()
  const remote = key
    ? new StreamableHTTPClientTransport(new URL(url), {
        fetch: reaching(url),
        requestInit: {
          headers: {
            Authorization: `Bearer ${key}`,
            "User-Agent": `aiinbx-mcp/${version}`,
          },
        },
      })
    : refusing(NO_KEY)
  return { url, remote }
}

/** The server's own words for a refusal: it answers with a JSON-RPC error. */
function serverMessage(body: unknown) {
  if (typeof body !== "string") return null
  try {
    const message: unknown = JSON.parse(body)?.error?.message
    return typeof message === "string" ? message : null
  } catch {
    return null
  }
}

/** Why a message did not get through, for the person reading the client's log. */
function explain(error: unknown) {
  if (error instanceof SdkHttpError) {
    const said = serverMessage(error.data.text) ?? error.statusText
    if (error.status === 401) {
      return `AI Inbx did not accept the API key in ${KEY_ENV}${said ? `: ${said}` : ""}. Create an API key (${KEYS_DOCS}) and set it as ${KEY_ENV}.`
    }
    return `AI Inbx answered ${error.status}${said ? `: ${said}` : ""}`
  }
  return error instanceof Error ? error.message : String(error)
}

export { explain, hosted, HOSTED_URL, KEY_ENV, URL_ENV }
