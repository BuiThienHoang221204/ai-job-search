import { join } from "node:path"

export interface BrowserFetchResult {
  status: number
  body: string
}

/**
 * Tải HTML bằng trình duyệt thật (Chrome/Edge/Chromium qua worker Node.js)
 * khi request HTTP thường (curl) bị Cloudflare chặn 403 / Turnstile challenge.
 */
export async function browserFetch(url: string): Promise<BrowserFetchResult> {
  const workerPath = join(import.meta.dir, "browser-worker.mjs")
  const proc = Bun.spawn(["node", workerPath, url], {
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited

  if (code !== 0) {
    const errText = stderr.trim() || stdout.trim() || `Exit code ${code}`
    throw new Error(`browser worker thất bại: ${errText}`)
  }

  try {
    const parsed = JSON.parse(stdout.trim()) as Partial<BrowserFetchResult>
    if (typeof parsed.status !== "number" || typeof parsed.body !== "string") {
      throw new Error("Dữ liệu JSON từ browser worker thiếu trường status hoặc body")
    }
    return { status: parsed.status, body: parsed.body }
  } catch (parseError) {
    throw new Error(
      `Không thể đọc kết quả từ browser worker: ${parseError instanceof Error ? parseError.message : String(parseError)} (raw stdout: ${stdout.slice(0, 150)})`,
    )
  }
}
