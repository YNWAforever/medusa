import assert from "node:assert/strict"
import test from "node:test"

import { waitForHealthyBackend } from "./staging-health.mjs"

test("returns immediately when Medusa is healthy", async () => {
  const calls = []
  const result = await waitForHealthyBackend("https://api.example", {
    fetchImpl: async (url, options) => {
      calls.push(url)
      assert.deepEqual(options, { headers: { accept: "text/plain" } })
      return new Response("OK", { status: 200 })
    },
    sleep: async () => {},
  })

  assert.deepEqual(result, { attempt: 1, status: 200 })
  assert.deepEqual(calls, ["https://api.example/health"])
})

test("retries a container 503 and then succeeds", async () => {
  const statuses = [503, 503, 200]
  const sleeps = []
  const result = await waitForHealthyBackend("https://api.example/", {
    attempts: 3,
    delayMs: 25,
    fetchImpl: async () => new Response(null, { status: statuses.shift() }),
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  })

  assert.deepEqual(result, { attempt: 3, status: 200 })
  assert.deepEqual(sleeps, [25, 25])
})

test("retries a transient network error and then succeeds", async () => {
  let attempts = 0
  const result = await waitForHealthyBackend("https://api.example", {
    attempts: 2,
    delayMs: 0,
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) throw new Error("transient connection failure")
      return new Response(null, { status: 200 })
    },
    sleep: async () => {},
  })

  assert.deepEqual(result, { attempt: 2, status: 200 })
})

test("reports the final status after exhausting attempts", async () => {
  await assert.rejects(
    waitForHealthyBackend("https://api.example", {
      attempts: 2,
      delayMs: 0,
      fetchImpl: async () => new Response(null, { status: 503 }),
      sleep: async () => {},
    }),
    /Medusa health check failed after 2 attempts: GET \/health returned 503/,
  )
})
test("sanitizes the final network error", async () => {
  await assert.rejects(
    waitForHealthyBackend("https://api.example", {
      attempts: 1,
      fetchImpl: async () => {
        throw new Error("connection failed with secret-token")
      },
      sleep: async () => {},
    }),
    (error) => {
      assert.match(error.message, /network request failed/)
      assert.doesNotMatch(error.message, /secret-token/)
      return true
    },
  )
})
test("uses the default 30-attempt policy with 2000ms delays", async () => {
  let fetchCount = 0
  const sleeps = []

  await assert.rejects(
    waitForHealthyBackend("https://api.example", {
      fetchImpl: async () => {
        fetchCount += 1
        return new Response(null, { status: 503 })
      },
      sleep: async (milliseconds) => sleeps.push(milliseconds),
    }),
    /Medusa health check failed after 30 attempts/,
  )

  assert.equal(fetchCount, 30)
  assert.equal(sleeps.length, 29)
  assert.ok(sleeps.every((milliseconds) => milliseconds === 2_000))
})
