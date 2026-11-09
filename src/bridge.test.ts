import { describe, expect, test } from "bun:test"

import type { JSONRPCMessage, Transport } from "@modelcontextprotocol/server"

import { bridge } from "./bridge"

/** A transport end held by the test: what was sent to it, and a way to speak as it. */
function end(send?: (message: JSONRPCMessage) => Promise<void>) {
  const sent: JSONRPCMessage[] = []
  const versions: string[] = []
  let closed = 0
  const transport: Transport = {
    start: async () => {},
    close: async () => {
      closed++
      transport.onclose?.()
    },
    send: async (message) => {
      await send?.(message)
      sent.push(message)
    },
    setProtocolVersion: (version) => void versions.push(version),
  }
  return {
    transport,
    sent,
    versions,
    closed: () => closed,
    says: (message: JSONRPCMessage) => transport.onmessage?.(message),
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function connect(
  local = end(),
  remote = end(),
  explain = (error: unknown) => `could not deliver: ${(error as Error).message}`
) {
  const reported: unknown[] = []
  const done = bridge(local.transport, remote.transport, {
    explain,
    report: (error) => void reported.push(error),
  })
  return { local, remote, reported, done }
}

const initialize: JSONRPCMessage = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  },
}

describe("bridge", () => {
  test("carries requests, answers and notifications as they are", async () => {
    const { local, remote } = connect()
    const call: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: "a",
      method: "tools/call",
      params: { name: "aiinbx_emails_list", arguments: { limit: 2 } },
    }
    const answer: JSONRPCMessage = {
      jsonrpc: "2.0",
      id: "a",
      result: { content: [{ type: "text", text: "{}" }] },
    }
    const progress: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: { progressToken: "t", progress: 1 },
    }
    const cancelled: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: "a" },
    }

    local.says(call)
    local.says(cancelled)
    remote.says(progress)
    remote.says(answer)
    await settle()

    expect(remote.sent).toEqual([call, cancelled])
    expect(local.sent).toEqual([progress, answer])
  })

  test("tells the remote transport the protocol version the handshake settled on", async () => {
    const { local, remote } = connect()
    local.says(initialize)
    remote.says({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        serverInfo: { name: "aiinbx", version: "1.0.0" },
      },
    })
    // A later answer that happens to carry the same field settles nothing.
    local.says({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    remote.says({
      jsonrpc: "2.0",
      id: 2,
      result: { protocolVersion: "1999-01-01", tools: [] },
    })
    await settle()

    expect(remote.versions).toEqual(["2025-03-26"])
  })

  test("answers a request that could not be delivered, and reports it once", async () => {
    const failure = new Error("no route")
    const remote = end(async () => {
      // As the HTTP transport does: reports, then throws.
      remote.transport.onerror?.(failure)
      throw failure
    })
    const { local, reported } = connect(end(), remote)

    local.says({ jsonrpc: "2.0", id: 7, method: "tools/list" })
    local.says({ jsonrpc: "2.0", method: "notifications/initialized" })
    await settle()

    expect(local.sent).toEqual([
      {
        jsonrpc: "2.0",
        id: 7,
        error: { code: -32000, message: "could not deliver: no route" },
      },
    ])
    expect(reported).toEqual([failure])
  })

  test("closes both sides when either closes, then resolves", async () => {
    const stdinEnds = connect()
    await stdinEnds.local.transport.close()
    await stdinEnds.done
    expect(stdinEnds.remote.closed()).toBe(1)

    const serverEnds = connect()
    await serverEnds.remote.transport.close()
    await serverEnds.done
    expect(serverEnds.local.closed()).toBe(1)
  })
})
