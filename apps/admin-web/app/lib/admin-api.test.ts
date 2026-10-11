import assert from "node:assert/strict"
import test from "node:test"
import { withAdminApiTimeout } from "./admin-api"

test("a request that never settles rejects with a visible timeout error", async () => {
  let requestAborted = false
  const request = withAdminApiTimeout(
    (signal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        requestAborted = true
        reject(signal.reason)
      }, { once: true })
    }),
    5,
  )

  await assert.rejects(request, /API request timed out/)
  assert.equal(requestAborted, true)
})

test("a completed request returns before the timeout", async () => {
  const result = await withAdminApiTimeout(async () => "completed", 100)

  assert.equal(result, "completed")
})

test("a timed-out request can be retried successfully", async () => {
  await assert.rejects(
    withAdminApiTimeout(() => new Promise<never>(() => {}), 5),
    /API request timed out/,
  )

  const result = await withAdminApiTimeout(async () => "retried", 100)

  assert.equal(result, "retried")
})
