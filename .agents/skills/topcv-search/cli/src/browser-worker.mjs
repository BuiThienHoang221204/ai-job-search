#!/usr/bin/env node
import { chromium } from "playwright-core"

const BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-sandbox",
  "--disable-infobars",
  "--disable-dev-shm-usage",
  "--disable-gpu",
]

async function launchBrowser() {
  const customPath =
    process.env.CHROMIUM_PATH ||
    (process.platform === "linux" ? "/usr/bin/chromium" : undefined)

  const candidates = customPath
    ? [{ executablePath: customPath }]
    : [
        { channel: "chrome" },
        { channel: "msedge" },
        { channel: "chromium" },
      ]

  let lastError = null
  for (const candidate of candidates) {
    try {
      return await chromium.launch({
        ...candidate,
        headless: true,
        args: BROWSER_ARGS,
        ignoreDefaultArgs: ["--enable-automation"],
      })
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(
    `Không thể khởi chạy Chromium/Chrome/Edge: ${lastError?.message || "Không tìm thấy trình duyệt khả dụng"}`,
  )
}

async function main() {
  const url = process.argv[2]
  if (!url) {
    process.stderr.write("Missing URL argument\n")
    process.exit(1)
  }

  let browser
  try {
    browser = await launchBrowser()

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    })

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined })
    })

    const page = await context.newPage()
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    })

    // Chờ selector thẻ tin hoặc khối chi tiết hiển thị, tối đa 5s
    try {
      await page.waitForSelector(
        ".job-item-search-result, .job-item-2, [data-job-id], .box-job-information-detail",
        { timeout: 5000 },
      )
    } catch (waitErr) {
      process.stderr.write(
        `[browser-worker] Cảnh báo chờ selector: ${waitErr instanceof Error ? waitErr.message : String(waitErr)}\n`,
      )
    }

    const content = await page.content()
    const status = response ? response.status() : 200

    // Gửi kết quả JSON chuẩn qua stdout và đợi flush hoàn tất
    await new Promise((resolve) =>
      process.stdout.write(JSON.stringify({ status, body: content }), resolve),
    )
  } catch (err) {
    process.stderr.write(
      `[browser-worker] Thất bại: ${err instanceof Error ? err.stack || err.message : String(err)}\n`,
    )
    process.exit(1)
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}

main()
