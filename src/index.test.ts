import { describe, expect, test } from "bun:test"

import { version } from "../package.json"

/** Runs the command as an MCP client would start it, and feeds it `lines`. */
async function run(
  args: string[],
  env: Record<string, string>,
  lines: object[] = []
) {
  const child = Bun.spawn(["bun", `${import.meta.dir}/index.ts`, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`)
  await child.stdin.flush()
  // A client keeps stdin open until it has read its answers.
  if (lines.length) await new Promise((resolve) => setTimeout(resolve, 500))
  await child.stdin.end()
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, code }
}

describe("aiinbx-mcp", () => {
  test("without a key it answers the handshake with how to get one", async () => {
    const { stdout, stderr, code } = await run(
      // What version 1's README had clients pass.
      ["--client=claude", "--tools=all"],
      {},
      [{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }]
    )

    expect(JSON.parse(stdout)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32000,
        message: expect.stringMatching(/^AI_INBX_API_KEY is not set\./),
      },
    })
    expect(stderr).toContain("ignoring --client=claude --tools=all")
    expect(stderr).toContain(
      "Preferred: connect your MCP client to https://mcp.aiinbx.com/mcp directly"
    )
    expect(code).toBe(0)
  })

  test("--transport http points to the hosted server", async () => {
    for (const args of [["--transport", "http"], ["--transport=http"]]) {
      const { stdout, stderr, code } = await run(args, {})
      expect(code).toBe(1)
      expect(stdout).toBe("")
      expect(stderr).toContain("https://mcp.aiinbx.com/mcp")
    }
  })

  test("--version prints the version", async () => {
    expect(await run(["--version"], {})).toMatchObject({
      stdout: `${version}\n`,
      code: 0,
    })
  })
})
