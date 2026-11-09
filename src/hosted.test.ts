import { afterEach, describe, expect, test } from "bun:test"

import type { JSONRPCMessage, Transport } from "@modelcontextprotocol/server"

import { version } from "../package.json"
import { bridge } from "./bridge"
import { explain, hosted, HOSTED_URL } from "./hosted"

type Server = ReturnType<typeof Bun.serve>
const servers: Server[] = []
afterEach(() => {
  for (const server of servers.splice(0)) void server.stop(true)
})

/** An MCP server over HTTP that answers every POST the way `answer` says. */
function serve(answer: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = []
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      if (request.method !== "POST") return new Response(null, { status: 405 })
      requests.push(request.clone())
      return answer(request)
    },
  })
  servers.push(server)
  return { url: `http://localhost:${server.port}/mcp`, requests }
}

/** The local client's side of a bridge to `env`'s server. */
function client(env: Record<string, string | undefined>) {
  const received: JSONRPCMessage[] = []
  const reported: string[] = []
  let arrived = () => {}
  const local: Transport = {
    start: async () => {},
    close: async () => {},
    send: async (message) => {
      received.push(message)
      arrived()
    },
  }
  const { url, remote } = hosted(env)
  void bridge(local, remote, {
    explain,
    report: (error) => void reported.push(explain(error)),
  })
  return {
    url,
    reported,
    /** Sends a request and waits for what comes back for it. */
    ask: async (message: JSONRPCMessage) => {
      const answered = new Promise<void>((resolve) => (arrived = resolve))
      local.onmessage?.(message)
      await answered
      return received.at(-1)
    },
    close: () => remote.close(),
  }
}

const listTools: JSONRPCMessage = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
}

describe("hosted", () => {
  test("talks to the hosted server unless told otherwise", () => {
    expect(hosted({ AI_INBX_API_KEY: "aibx_live_x" }).url).toBe(HOSTED_URL)
    expect(HOSTED_URL).toBe("https://mcp.aiinbx.com/mcp")
  })

  test("sends the API key and names itself, and hands the answer back", async () => {
    const result = { tools: [{ name: "aiinbx_emails_send", inputSchema: {} }] }
    const server = serve(async (request) =>
      Response.json({ jsonrpc: "2.0", id: (await request.json()).id, result })
    )
    const { ask, close } = client({
      AI_INBX_API_KEY: " aibx_live_secret ",
      AI_INBX_MCP_URL: server.url,
    })

    expect(await ask(listTools)).toEqual({ jsonrpc: "2.0", id: 1, result })
    const [request] = server.requests
    expect(request?.headers.get("authorization")).toBe(
      "Bearer aibx_live_secret"
    )
    expect(request?.headers.get("user-agent")).toBe(`aiinbx-mcp/${version}`)
    expect(await request?.json()).toEqual(listTools)
    await close()
  })

  test("reads a server-sent answer", async () => {
    const answer: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [] },
    }
    const server = serve(
      () =>
        new Response(`event: message\ndata: ${JSON.stringify(answer)}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        })
    )
    const { ask, close } = client({
      AI_INBX_API_KEY: "aibx_live_x",
      AI_INBX_MCP_URL: server.url,
    })

    expect(await ask(listTools)).toEqual(answer)
    await close()
  })

  test("a key the server rejects is answered with the server's reason", async () => {
    // What mcp.aiinbx.com answers an unknown key with.
    const server = serve(() =>
      Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "Unknown API key" },
          id: null,
        },
        { status: 401 }
      )
    )
    const { ask, reported, close } = client({
      AI_INBX_API_KEY: "inbx_gone",
      AI_INBX_MCP_URL: server.url,
    })
    const message =
      "AI Inbx did not accept the API key in AI_INBX_API_KEY: Unknown API key. Create an API key (https://docs.aiinbx.com/authentication) and set it as AI_INBX_API_KEY."

    expect(await ask(listTools)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message },
    })
    expect(reported).toEqual([message])
    await close()
  })

  test("any other refusal is answered with its status and reason", async () => {
    const server = serve(() =>
      Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "This workspace is frozen" },
          id: null,
        },
        { status: 403 }
      )
    )
    const { ask, close } = client({
      AI_INBX_API_KEY: "aibx_live_x",
      AI_INBX_MCP_URL: server.url,
    })

    expect(await ask(listTools)).toMatchObject({
      error: { message: "AI Inbx answered 403: This workspace is frozen" },
    })
    await close()
  })

  test("without a key every request is answered with how to get one", async () => {
    const { ask, reported } = client({ AI_INBX_API_KEY: "  " })
    const answer = await ask(listTools)

    expect(answer).toMatchObject({ id: 1, error: { code: -32000 } })
    expect(reported).toHaveLength(1)
    expect(reported[0]).toStartWith("AI_INBX_API_KEY is not set.")
    expect(reported[0]).toContain("https://mcp.aiinbx.com/mcp")
  })

  test("a server that cannot be reached is named as that", async () => {
    const server = serve(() => new Response(null))
    const { url } = server
    await servers.pop()?.stop(true)
    const { ask, close } = client({
      AI_INBX_API_KEY: "aibx_live_x",
      AI_INBX_MCP_URL: url,
    })

    expect(await ask(listTools)).toMatchObject({
      error: { message: expect.stringContaining(`Could not reach ${url}: `) },
    })
    await close()
  })
})
