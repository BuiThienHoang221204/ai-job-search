import { describe, expect, test } from "bun:test"
import { BlockedError, fetchVerdict, isBlockedPage } from "../src/helpers.ts"
import type { BrowserFetchResult } from "../src/browser-fetch.ts"

describe("Nhánh BLOCKED và Fallback Trình duyệt", () => {
  test("fetchVerdict xác định đúng trạng thái blocked cho 403 hoặc trang thử thách Cloudflare", () => {
    expect(fetchVerdict(403, "Forbidden")).toBe("blocked")
    expect(fetchVerdict(200, "<title>Just a moment...</title>")).toBe("blocked")
    expect(
      fetchVerdict(
        200,
        '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>',
      ),
    ).toBe("blocked")
    expect(
      fetchVerdict(
        200,
        '<html><body><div class="job-item-search-result">Viec lam ReactJS</div></body></html>',
      ),
    ).toBe("ok")
  })

  test("Khi browser fallback thành công và fetchVerdict xác nhận 'ok', dữ liệu trả về hợp lệ", () => {
    const validBrowserResult: BrowserFetchResult = {
      status: 200,
      body: '<div class="job-item-search-result"><h3>Job ReactJS</h3></div>',
    }
    const verdict = fetchVerdict(validBrowserResult.status, validBrowserResult.body)
    expect(verdict).toBe("ok")
  })

  test("Khi browser fallback vẫn nhận trang challenge Cloudflare, fetchVerdict trả về blocked", () => {
    const blockedBrowserResult: BrowserFetchResult = {
      status: 200,
      body: '<title>Just a moment...</title><div class="cf-chl-widget"></div>',
    }
    expect(isBlockedPage(blockedBrowserResult.body)).toBe(true)
    const verdict = fetchVerdict(blockedBrowserResult.status, blockedBrowserResult.body)
    expect(verdict).toBe("blocked")
  })

  test("BlockedError là instance của Error và BlockedError để CLI kích hoạt cầu dao BLOCKED", () => {
    const error = new BlockedError("TopCV chặn (403, Cloudflare); tạm dừng quét portal này")
    expect(error instanceof BlockedError).toBe(true)
    expect(error instanceof Error).toBe(true)
    expect(error.message).toContain("TopCV chặn")
  })
})
