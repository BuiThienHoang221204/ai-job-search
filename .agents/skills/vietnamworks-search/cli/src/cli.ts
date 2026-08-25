#!/usr/bin/env bun
import { detail } from "./commands/detail.ts"
import { search } from "./commands/search.ts"
import { writeError } from "./helpers.ts"

const USAGE = `VietnamWorks job search - danh sách việc làm công khai tại Việt Nam

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>     Từ khóa: chức danh, kỹ năng. VD: "reactjs", "backend java".
  --location, -l <text>  Thành phố. VD: "Hồ Chí Minh", "Hà Nội", "Đà Nẵng".
  --remote <mode>        Nhận để đồng bộ với các portal khác; API không phân biệt
                         được hình thức làm việc nên cờ này không lọc gì.
  --page <n>             Trang, tính từ 1. Mặc định 1.
  --limit, -n <n>        Giới hạn số kết quả trả về.
  --format <fmt>         json (mặc định) | table | plain.

GHI CHÚ
  Lệnh search gọi API JSON công khai: trang /viec-lam là ứng dụng Next.js render
  phía trình duyệt nên HTML của nó không có một tin nào.
  Mô tả trong kết quả search bị API CẮT ở vài trăm ký tự và kết thúc bằng "...".
  Muốn mô tả đầy đủ thì gọi detail - lệnh đó đọc thêm HTML trang chi tiết.
  Tin ghi "Thương lượng" được trả về salary = null.
  Lọc địa điểm chạy ở phía client.
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
        Array.isArray(row.tags) && row.tags.length ? `  tags    : ${row.tags.join(", ")}` : null,
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
    const remote = flag("--remote")
    if (remote && !["remote", "hybrid", "onsite"].includes(remote)) {
      writeError(`--remote không hợp lệ: ${remote}`, "INVALID_FLAG")
      process.exit(2)
    }

    const jobs = await search({
      query: flag("--query", "-q"),
      location: flag("--location", "-l"),
      page: positiveInt(flag("--page"), "--page"),
      limit: positiveInt(flag("--limit", "-n"), "--limit"),
      remote: remote as "remote" | "hybrid" | "onsite" | undefined,
    })
    output(jobs, format)
  } else if (command === "detail") {
    const target = args[1]
    if (!target || target.startsWith("--")) {
      writeError("detail cần một slug hoặc URL", "MISSING_ARG")
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
  writeError(error instanceof Error ? error.message : String(error), "FETCH_FAILED")
  process.exit(1)
}
