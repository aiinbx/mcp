import type { JSONRPCMessage, Transport } from "@modelcontextprotocol/server"

/** In the range JSON-RPC leaves to implementations: the bridge's own errors. */
const BRIDGE_ERROR = -32000

type Request = Extract<JSONRPCMessage, { method: string; id: string | number }>

const isRequest = (message: JSONRPCMessage): message is Request =>
  "method" in message && "id" in message

type Reporting = {
  /** What a client is told when its request could not be delivered. */
  explain: (error: unknown) => string
  /** Where errors go besides the wire; called once per error. */
  report: (error: unknown) => void
}

/**
 * Carries every message between a local MCP client and a remote MCP server
 * as it is. The one thing it reads is the handshake's answer: a client tells
 * its HTTP transport which protocol version was settled on, and here no
 * client sits on that transport to do it.
 *
 * A request that cannot be delivered is answered with a JSON-RPC error, so
 * the client hears why. Resolves once either side has closed and both are.
 */
function bridge(
  local: Transport,
  remote: Transport,
  { explain, report }: Reporting
) {
  const handshakes = new Set<string | number>()
  // A transport reports a failed send and then throws it.
  const reported = new WeakSet<object>()
  const once = (error: unknown) => {
    if (typeof error === "object" && error !== null) {
      if (reported.has(error)) return
      reported.add(error)
    }
    report(error)
  }

  local.onmessage = (message) => {
    if (isRequest(message) && message.method === "initialize") {
      handshakes.add(message.id)
    }
    remote.send(message).catch((error: unknown) => {
      once(error)
      if (!isRequest(message)) return
      local
        .send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: BRIDGE_ERROR, message: explain(error) },
        })
        .catch(once)
    })
  }

  remote.onmessage = (message) => {
    if (
      "result" in message &&
      message.id !== undefined &&
      handshakes.delete(message.id)
    ) {
      const version = (message.result as { protocolVersion?: unknown })
        .protocolVersion
      if (typeof version === "string") remote.setProtocolVersion?.(version)
    }
    local.send(message).catch(once)
  }

  local.onerror = once
  remote.onerror = once

  return new Promise<void>((resolve, reject) => {
    let closing = false
    const close = () => {
      if (closing) return
      closing = true
      void Promise.allSettled([local.close(), remote.close()]).then(() =>
        resolve()
      )
    }
    local.onclose = close
    remote.onclose = close
    remote
      .start()
      .then(() => local.start())
      .catch(reject)
  })
}

export { bridge }
