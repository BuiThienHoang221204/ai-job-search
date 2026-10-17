#!/usr/bin/env bun
import { detail } from "./commands/detail.ts"
import { search } from "./commands/search.ts"
import { BlockedError, writeError } from "./helpers.ts"

const USAGE = `timviec.ai job search - việc làm công khai của Fiza (Zalo) tại Việt Nam

USAGE
  bun run src/cli.ts search --query <text> [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Từ khoá, tìm THẬT theo từ khoá (filter-job-post?searchTerm=).
  --location, -l <text>  Tỉnh. Hiểu các cách viết TP.HCM ("Ho Chi Minh", "HCM").
  --page <n>             Trang 1 trả MỌI kết quả (tối đa 200, tin mới nhất trước); trang sau trả rỗng.
  --limit, -n <n>        Giới hạn số kết quả trả về.
  --format <fmt>         json (mặc định) | table | plain.

GHI CHÚ
  Gọi API JSON công khai https://timviec.ai/api/candidates, không cần đăng nhập.
  Điều khoản cấm phân phối và khai thác Nội Dung Fiza - xem SKILL.md.
  Lương "Thỏa thuận" được trả về salary = null.
`

const args = process.argv.slice(2)
const command = args[0]

function flag(...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name)
    if (index !== -1 && args[index + 1] !== undefined) return args[index + 1]
  }
  return undefined
}

function positiveInt(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    writeError(`${name} phải là số nguyên dương, nhận được: ${raw}`, "INVALID_FLAG")
    process.exit(2)
  }
  return value
}

function output(data: unknown, format: string): void {
  if (format === "json") {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n")
    return
  }

  const rows = Array.isArray(data) ? data : [data]
  for (const row of rows as Array<Record<string, unknown>>) {
    process.stdout.write(
      [
        row.title,
        row.company ? `  công ty : ${String(row.company)}` : null,
        row.location ? `  địa điểm: ${String(row.location)}` : null,
        row.salary ? `  lương   : ${String(row.salary)}` : null,
        `  url     : ${String(row.url)}`,
        "",
      ]
        .filter((line) => line !== null)
        .join("\n") + "\n",
    )
  }
}

try {
  const format = flag("--format") ?? "json"
  if (!["json", "table", "plain"].includes(format)) {
    writeError(`--format không hợp lệ: ${format}`, "INVALID_FLAG")
    process.exit(2)
  }

  if (command === "search") {
    const jobs = await search({
      query: flag("--query", "-q"),
      location: flag("--location", "-l"),
      page: positiveInt(flag("--page"), "--page"),
      limit: positiveInt(flag("--limit", "-n"), "--limit"),
    })
    output(jobs, format)
  } else if (command === "detail") {
    const target = args[1]
    if (!target || target.startsWith("--")) {
      writeError("detail cần một mã tin hoặc URL", "MISSING_ARG")
      process.exit(2)
    }
    const job = await detail(target)
    if (!job) {
      writeError(`không tìm thấy tin: ${target}`, "NOT_FOUND")
      process.exit(1)
    }
    output(job, format)
  } else {
    process.stdout.write(USAGE)
    process.exit(command ? 2 : 0)
  }
} catch (error) {
  writeError(
    error instanceof Error ? error.message : String(error),
    error instanceof BlockedError ? "BLOCKED" : "FETCH_FAILED",
  )
  process.exit(1)
}
