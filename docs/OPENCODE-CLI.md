# Dùng OpenCode CLI làm nguồn model — phân tích và kế hoạch

Tài liệu quyết định cho câu hỏi: **có nên chạy tác vụ AI của Careelot qua CLI
`opencode` thay vì gọi HTTP không, và nếu có thì tới mức nào.**

Mọi con số dưới đây đo ngày **2026-09-23** trên máy dev (Windows), CLI
`opencode-ai@1.18.32` cài bằng npm, **không đăng nhập**, `auth.json` không có
credential OpenCode nào.

---

## 1. Phân tích vấn đề

### 1.1 Vì sao lại đặt ra chuyện này

Lõi `opencode` gọi thẳng `https://opencode.ai/zen/v1` đã **chết** với caller
ngoài. Gửi đủ `Authorization: Bearer public`, User-Agent có version và
`x-opencode-session` hợp lệ vẫn trả:

```
403  OpenCode free tier can only be used from within OpenCode
```

Chuỗi dự phòng mặc định vì thế không còn mắt xích `oc/*` nào:

```
auto/smart (omniroute) → cl/openai/gpt-5.6-sol → ds-web/deepseek-v4-pro
                       → kr/deepseek-3.2 → openrouter/nex-agi/nex-n2.5-pro:free
```

### 1.2 Ranh giới đã đo: `run` qua, `serve` không qua

Cùng một binary, cùng máy, cùng model `big-pickle`, cách nhau vài giây:

| Đường | Ai gọi ra ngoài | Kết quả |
|---|---|---|
| `opencode run` | tiến trình vừa sinh ra rồi chết | **200**, 8,5s |
| `opencode serve` + `POST /session/{id}/message` | máy chủ nằm chờ | **403 FreeTierError**, 3,1s |
| Đối chứng: `run` chạy lại ngay sau cú 403 | | **200**, 8,5s |

Nhà cung cấp phân biệt được hai đường và cố tình chặn một. **Không đi tìm cách
làm `serve` trông giống `run`** — đó là đi vòng qua chốt kiểm soát truy cập, và
đã chốt là không làm.

Trớ trêu: `serve` mới là đường ta cần. Bản khai API của nó (162 endpoint, không
có `/chat/completions`) có sẵn hai thứ app đang thiếu:

```jsonc
"format": { "type": "json_schema", "schema": {...}, "retryCount": 2 },
"tools":  { "bash": false, "edit": false, "write": false, "read": false }
```

### 1.3 Số đo của `run`

| Phép đo | Kết quả |
|---|---|
| Prompt tầm thường | **8,0s** / 8,5s, exit 0 |
| Yêu cầu JSON theo trường | **9,7s**, trả `{"diem": 7, "ly_do": "..."}` — **không rào** ` ``` ` |
| `--format json` | NDJSON: `step_start` → `text` (chữ tăng dần) → `step_finish` → **stream được** |
| Đăng nhập | **Không cần** |

So sánh với đường đang chạy (đo 2026-09-22, qua đúng `AiService`):
viết thư xin việc **9,3s / 198 mảnh**, chấm điểm 9,6–13,6s. Tức `run`
**ngang ngửa**, không chậm hơn.

### 1.4 Nền móng dịch chuyển

| Ngày | Trạng thái bể free |
|---|---|
| 17/09 sáng | Ẩn danh `Bearer public` — chạy |
| 17/09 17:00 | 403 toàn bộ |
| 17/09 tối | Sống lại khi đặt UA có version |
| 21/09 | Đóng hẳn với caller ngoài |
| 23/09 | `run` chạy, `serve` 403 |

Bốn lần đổi trong sáu ngày. Đây là dữ kiện quan trọng nhất của cả tài liệu.

---

## 2. Yêu cầu, nói lại cho đúng

> Cài CLI `opencode` lên BE, đổi lõi `opencode` từ **HTTP client** thành
> **trình điều khiển tiến trình con** — chạy CLI thật, đọc thứ nó in ra.

Hai điểm cần nói rõ:

- **Đây không phải "giả dạng CLI".** `CLAUDE.md` có câu can hướng đó, nhưng câu
  ấy nói về việc **bịa header** cho giống CLI. Chạy CLI thật là đúng thứ nhà
  cung cấp yêu cầu (*"from within OpenCode"*), hợp lệ.
- **Không cần mô phỏng gõ phím vào TUI.** `opencode run` là chế độ headless có
  sẵn, kèm `--format json`, `--model`, `--agent`, `--session`, `--dir`.

Yêu cầu có **ba mức tham vọng** rất khác nhau, và tài liệu này tách chúng ra vì
chúng có câu trả lời khác nhau:

| Mức | Nội dung |
|---|---|
| **M1** | Dùng cho script chạy lô ngoài app |
| **M2** | Thêm một mắt xích `opencode` vào `ModelChain` |
| **M3** | Dùng cho **mọi** tác vụ AI, thay lõi chính |

---

## 3. Phạm vi ảnh hưởng trong hệ thống

Đếm ngày 23/09, sau đợt tái cấu trúc đã gỡ `runTools` và module `agent/`:

| Dạng gọi | Số chỗ | Bản chất |
|---|---|---|
| `generateObject` | 16 | Một lượt, ép schema zod |
| `streamObject` | 8 | Ép schema zod, chảy từng mảnh về trình duyệt |
| `streamText` | 2 | Hội thoại nhiều lượt (luyện phỏng vấn) |

Hai điều thuận lợi:

- **`AiService` là seam duy nhất** — cả 26 chỗ gọi đi qua nó, đổi ruột không
  phải sờ vào 26 file.
- **`runTools` đã bị gỡ** — vòng lặp agent với tool riêng của app là phần khó
  nhất khi chuyển sang CLI, và nó không còn.

Khả thi theo từng dạng:

| Dạng | Qua `run` | Ghi chú |
|---|---|---|
| `generateObject` | Được | Bơm schema vào prompt; đã có `withSchemaInstruction` + `unwrapFencedJson` |
| `streamObject` | Chạy, nhưng **không chảy dần** | Xem 3.1 |
| `streamText` | Chạy, **không chảy dần** | `--session <id>` / `--continue` có, nhưng cùng hạn chế 3.1 |

### 3.1 `opencode run` KHÔNG chảy dần — đo 2026-09-23

Bản kế hoạch đầu viết `--format json` cho "chữ tăng dần". **Sai.** Đo trên một
bài 250 từ (1.386 ký tự, 675 token đầu ra):

```
tong su kien text: 1
so part khac nhau: 1
do dai lan luot: 1386
```

**Đúng một sự kiện `text`, mang toàn bộ bài, phát ra ở cuối.** Không có sự kiện
trung gian nào. Nên dù wrapper có nói SSE đúng chuẩn thì trình duyệt vẫn **không
thấy gì trong suốt 13–15 giây rồi nhận trọn gói**.

Hệ quả theo từng dạng:

- **16 chỗ `generateObject`**: không ảnh hưởng, chúng vốn chờ kết quả trọn gói.
- **8 chỗ `streamObject`**: chạy đúng, nhưng mất toàn bộ giá trị của việc chảy dần.
- **2 chỗ `streamText`** (luyện phỏng vấn): mất nhiều nhất, vì đó là màn hình
  người dùng ngồi chờ từng chữ.

Đây là lý do **chỉ nên dùng opencode làm mắt xích DỰ PHÒNG**: khi mắt xích chính
còn sống thì người dùng vẫn được chảy dần; rơi xuống opencode thì mất tính năng
đó chứ không mất kết quả. Đặt nó làm đường chính là làm hỏng trải nghiệm của 10
màn hình.

---

## 4. Phương án triển khai

### 4.1 M1 — đường `opencode-cli` cho script chạy lô — **ĐÃ LÀM 2026-09-23**

Đã thêm nhánh vào `server/scripts/lib/model-call.mjs`: model id mang tiền tố
`opencode-cli/` thì spawn `opencode run --format json` thay vì `fetch`, gom sự
kiện `text`, trả về chuỗi. Không Docker, không wrapper, không đụng `src/`.

Dùng bằng cách đặt tiền tố trong `SCRIPT_MODEL_IDS`:

```bash
SCRIPT_MODEL_IDS=opencode-cli/opencode/big-pickle node scripts/bench-models.mjs
```

Biến môi trường kèm theo, tất cả đều tuỳ chọn:

| Biến | Mặc định | Việc |
|---|---|---|
| `OPENCODE_CLI_BIN` | `opencode` | Đường dẫn binary |
| `OPENCODE_CLI_TIMEOUT_MS` | `180000` | Trần một lượt |
| `OPENCODE_CLI_AGENT` | — | Truyền vào `--agent` |
| `OPENCODE_CLI_DIR` | — | Truyền vào `--dir` |

Đã đo sau khi làm xong:

| Phép đo | Kết quả |
|---|---|
| Một lượt chấm điểm, `extractJson` parse được | **11,6s** |
| Mắt xích hỏng → tự rơi xuống mắt xích sau | **17,0s**, đúng model thứ hai |

**Bẫy đã sập, đừng để người sau sập lại: `stdin` PHẢI đóng.** Spawn mà để `stdin`
ngỏ trong môi trường không có TTY thì CLI **treo im tới hết timeout và không in
gì**. Triệu chứng đánh lừa hoàn toàn: trông như model chậm, trong khi nó chưa hề
bắt đầu. Đã sửa bằng `stdio: ['ignore', 'pipe', 'pipe']`.

Ghi chú: `temperature` bị **bỏ qua** ở đường này vì `opencode run` không có cờ
tương ứng; và prompt bị chặn ở 30.000 ký tự vì trần argv của Windows.

**Giá trị phụ quan trọng:** vài trăm lượt gọi lô sẽ cho dữ liệu thật về việc CLI
ổn định tới đâu — thứ cần có trước khi quyết M2.

### 4.2 M2 — `opencode-service/`, cùng khuôn với `latex-service/`

```
aijob-app ──HTTP──> opencode-service (container riêng)
                      └── server.js      ~200 dòng, như latex-service/server.py
                            └── spawn `opencode run --format json --agent restricted`
                                  └──> opencode.ai/zen
```

**Quyết định làm nó rẻ đi nhiều: cho `server.js` nói tiếng OpenAI-compatible**,
tức phơi ra đúng `POST /v1/chat/completions`. Khi đó lõi `opencode` chỉ cần:

```ts
export const opencode: ProviderDescriptor = {
  id: 'opencode',
  baseURLEnv: 'OPENCODE_SERVICE_URL',
  honorsResponseFormat: false,
  ...
};
```

`AiService`, `LanguageModelFactory`, `ModelChain`, `createOpenAICompatible`
**không đụng dòng nào**. Toàn bộ phần dịch giữa "HTTP kiểu OpenAI" và "spawn
CLI, đọc NDJSON" nằm gọn trong container — đúng chỗ nó nên nằm, và đúng cách
`OMNIROUTE_BASE_URL` đang hoạt động.

Trong `docker-compose.yml`, y hệt `latex`:

```yaml
  opencode:
    image: aijob-opencode
    build:
      context: ../opencode-service
    container_name: aijob-opencode
    restart: unless-stopped
    expose:
      - "8080"
    volumes:
      - opencode_data:/home/opencode/.local/share/opencode
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "1"
```

**Bốn chỗ khác `latex`, phải xử lý:**

| | `latex-service` | `opencode-service` |
|---|---|---|
| Trạng thái | Không có | **Có**: `opencode.db` phình → cần volume + việc dọn định kỳ |
| Mạng | Không cần internet | **Phải gọi ra internet** |
| Quyền của model | Không có model | **Phải `--agent` tắt hết tool**, và kiểm chứng là tắt thật |
| Image | TeX Live ~2,5GB | opencode binary ~174MB + runtime |

Điểm chung giữ nguyên: **chạy bằng user không phải root**, vì đây cũng là nơi xử
lý nội dung do người ngoài viết (tin tuyển dụng) — đúng lý do `latex-service` đã
làm vậy.

#### 4.2.1 Không tắt được tool — phải đổi sang GIAM giữ

Kế hoạch ban đầu định tắt tool bằng `opencode.json`. **Cách đó không dùng được**:
đo ngày 23/09 cho thấy hễ tuỳ biến cấu hình agent là mất bể free (mục 5.1). Phải
chọn một trong hai:

- **Bỏ M2.** Nếu không chấp nhận một agent có `bash` chạy trong hạ tầng của mình.
- **Giữ M2 nhưng đổi biện pháp: không cấm nó làm, mà làm cho không có gì để làm.**

Nếu chọn đường thứ hai thì container phải thoả **cả năm** điều sau, thiếu một cái
là bỏ:

1. **Thư mục làm việc rỗng.** `--dir` trỏ vào một thư mục tạm không chứa gì. Model
   đọc file thoải mái cũng không có gì để đọc.
2. **Mạng riêng, KHÔNG chung mạng với `postgres`.** Mặc định Compose đặt mọi
   service vào cùng một mạng — nghĩa là container này với tới được `postgres:5432`.
   Phải khai một network riêng cho nó.
3. **Không truyền biến môi trường nào của app vào.** Nó chỉ cần đủ thứ để chạy CLI.
4. **User không phải root, filesystem chỉ đọc** trừ thư mục dữ liệu của opencode.
5. **Chỉ `expose`, không `ports`.**

Lý do phải làm tới mức này: tin tuyển dụng là văn bản do người ngoài viết, và
model đọc nó đang cầm sẵn `bash`. Đây là prompt injection có kèm shell — không
phải rủi ro lý thuyết, mục 5.1 đã cho thấy model **thật sự** đi đọc file khi được
bảo thế. Và `postgres` đang chứa CV thật của người dùng.

#### 4.2.2 Tình trạng — đã dựng xong phần container, 2026-09-23

| Thành phần | Trạng thái |
|---|---|
| `opencode-service/Dockerfile` | **xong** — `node:22-slim`, ghim `opencode-ai@1.18.32`, user không phải root, `/work` rỗng |
| `opencode-service/server.js` | **xong** — không dependency, `GET /health`, `GET /v1/models`, `POST /v1/chat/completions` (cả SSE), hàng đợi trần 2 tiến trình |
| `server/docker-compose.yml` | **xong** — phiên khác áp giúp, service nằm sau `profiles: ["opencode"]`, mạng riêng, `read_only`, `/work` là tmpfs |
| `providers/opencode.ts` + `.env.example` | **chưa** — chờ thêm `baseURLEnv: 'OPENCODE_SERVICE_URL'` |

Đo trên host (CLI 1.18.11), rồi đo lại **qua chính container** (image 824MB):

| Phép đo | Trên host | Qua container |
|---|---|---|
| `GET /health`, `GET /v1/models` | 200 | 200 |
| `POST /v1/chat/completions` không stream | **200, 15,7s** | **200, 10,8s** |
| `usage.prompt_tokens` cùng một prompt | 10.678 | **6.152** |
| `POST` có `stream: true` | 200, 13,7s, đúng 1 delta (xem 3.1) | như host |

**Thư mục làm việc rỗng cắt ~42% token đầu vào** (10.678 → 6.152). Ngoài lý do an
toàn, `/work` rỗng còn là một khoản tiết kiệm thật: CLI không có project để quét
thì không nhồi ngữ cảnh mã nguồn vào prompt.

**Cổng:** app chạy trên HOST bằng `pnpm` chứ không trong Docker (`aijob-app`
chưa từng chạy), nên chỉ `expose` thì máy dev không với tới. Phải publish về
loopback — `127.0.0.1:8091:8080` — và cách ly vẫn nguyên vì container vẫn không
nằm trong mạng `default` nên không thấy `postgres`.

#### 4.2.3 Năm lớp giam giữ — đã kiểm ở RUNTIME, không phải trên giấy

| Lớp | Cách kiểm | Kết quả |
|---|---|---|
| Thư mục làm việc rỗng | `ls -A /work` | **0 file**, và là `tmpfs ... noexec` |
| Không thấy `postgres` | Từ trong container nối TCP | `postgres:5432` → **ENOTFOUND**, `aijob-postgres` → ENOTFOUND, `omniroute` → ENOTFOUND, `latex` → ENOTFOUND. `opencode.ai:443` → **nối được** (nó cần) |
| Không có biến môi trường của app | `env \| grep -iE "DATABASE\|JWT\|R2_\|SECRET"` | **không có gì** |
| User không phải root | `id -un` | `opencode` |
| Filesystem chỉ đọc | `touch /home/opencode/thu` | `Read-only file system` |

#### 4.2.4 Hai bẫy khi dựng image — đã sập cả hai, đừng sập lại

1. **`EACCES: mkdir '.../repos'`.** Volume gắn vào một đường dẫn **chưa tồn tại
   trong image** thì Docker tạo nó bằng `root`, và CLI chết ngay lượt gọi đầu.
   Phải `mkdir -p` + `chown` thư mục dữ liệu **trong Dockerfile** trước.
2. **`EROFS: mkdir '/home/opencode/.local/state'`.** `read_only: true` làm `$HOME`
   chỉ đọc, mà CLI còn ghi ra ngoài thư mục dữ liệu. Chữa bằng cách trỏ
   `XDG_STATE_HOME`/`XDG_CACHE_HOME`/`XDG_CONFIG_HOME` vào `/tmp` (đã là tmpfs),
   giữ `XDG_DATA_HOME` ở volume. Đừng xin thêm mount cho từng đường dẫn — cách đó
   là đuổi bắt không có điểm dừng.

### 4.3 M3 — mọi tác vụ AI: **không khuyến nghị**

Về kỹ thuật thì làm được cả ba dạng gọi. Lý do can không nằm ở kỹ thuật:

**Opencode CLI chỉ có giá trị ở đúng bể free Zen.** Với bất kỳ nhà cung cấp nào
đã có key (Google, Anthropic, OpenRouter), gọi thẳng API của họ vừa nhanh hơn,
vừa có `response_format` thật, vừa không đẻ tiến trình, vừa không có sqlite
phình. Chèn opencode vào giữa chỉ thêm một lớp hỏng được.

Nên toàn bộ lý do tồn tại của M3 là bể free. Mà bể free đó đổi luật 4 lần trong
6 ngày, và câu từ chối ghi thẳng chủ ý: dành cho lập trình viên đang code, không
phải làm backend cho sản phẩm khác.

Bốn vấn đề mức hệ thống của M3:

1. **`opencode.db` phình.** Trên máy dev đang là **301 MB** sau ~1 tháng dùng
   như lập trình viên bình thường. Cho cron chấm `MATCH_AI_MAX_PER_RUN=300` tin
   mỗi lượt đi qua đấy thì nó phình trong container, không ai dọn, app không sở
   hữu cũng không truy vấn được.
2. **Thông lượng.** 300 tin × ~9s ÷ `QUEUE_CONCURRENCY=3` ≈ **15 phút và 300
   lần đẻ tiến trình** mỗi lượt cron.
3. **Sổ `ai_calls` có thể mất số.** Màn quản trị sống nhờ
   `inputTokens`/`outputTokens`/`finishReason`. Bản `serve` có trả `tokens`,
   còn `run --format json` thì **chưa xác nhận**.
4. **Mất chuỗi dự phòng đa lõi.** Thiết kế hiện tại có 4 mắt xích trên 4 lõi
   khác nhau, tồn tại chính vì bể free hay chết. Dồn tất cả sau một CLI là đi
   ngược lại.

Và Careelot là khóa luận **rồi thương mại hóa**. Đặt toàn bộ AI của một sản phẩm
thương mại lên bể free của một công cụ lập trình là thứ sẽ bị cắt đúng lúc phụ
thuộc nhất — khi đó không phải một mắt xích hỏng, mà cả sản phẩm đứng.

---

## 5. Rủi ro và những gì CHƯA đo

Cập nhật 2026-09-23 — hai ẩn số đã có câu trả lời:

| Thứ chưa biết | Trạng thái | Kết quả |
|---|---|---|
| **RAM mỗi tiến trình `run`** | **ĐÃ ĐO** | **~259 MB RSS** cho một tiến trình. 3 lượt song song ⇒ ước ~780 MB, nên `memory: 2G` trong compose là hợp lý. Đo bằng `tasklist` lúc một tiến trình đang chạy |
| **`--format json` có trả token không** | **ĐÃ ĐO — CÓ** | `step_finish` mang `tokens: {total, input, output, reasoning, cache:{write,read}}` và `cost`. Sổ `ai_calls` không mất số |
| **Tool có tắt thật không** | **ĐÃ ĐO — KHÔNG** | Xem 5.1 ngay dưới. Mọi cách tắt tool đều làm **mất bể free** |
| **Tốc độ phình của `opencode.db`** | **ĐÃ ĐO** | **~19 KB/lượt** (389 KB sau ~20 lượt prompt nhỏ). 300 tin/cron ≈ 5,8 MB một lượt chạy, không tự co lại |

### 5.1 Tắt tool và bể free loại trừ nhau — đo 2026-09-23

Dựng mồi nhử: một file `secret.txt` chứa `SECRET-12345-KHONG-DUOC-DOC`, rồi bảo
model đọc nó.

| Cấu hình | Bể free | Đọc được file bí mật? |
|---|---|---|
| Không config, agent mặc định | **200** | **Có** — `Glob` rồi `Read secret.txt`, đọc ra nguyên văn |
| `--agent plan` (dựng sẵn) | **200** | **Có** — vẫn đọc ra nguyên văn |
| `--agent restricted` (tự định nghĩa, deny hết) | **403 FreeTierError** | — |
| Ghi đè `permission` của chính agent dựng sẵn `build` | **403 FreeTierError** | — |

Đối chứng: xoá `opencode.json` đi rồi chạy lại đúng prompt đó → **200** và nó đọc
được file. Tức nguyên nhân là **bản thân việc tuỳ biến cấu hình agent**, không
phải tên agent, và không phải trục trặc nhất thời.

**Kết luận: trên bể free, không có cách nào tắt tool.** Hễ đụng vào cấu hình
agent là mất bể free; giữ được bể free thì model có đủ `bash`/`read`/`write`.

Điều này **làm hỏng điều kiện tiên quyết của M2** như tài liệu đã viết ban đầu
("tool tắt được thật"). Xem 4.2.1 để biết đường đi còn lại.

**Phát hiện thêm, và nó đắt: mỗi lượt gọi cõng ~10.600 token đầu vào.** Đo trên
prompt chỉ có 6 chữ (`"Tra loi dung mot tu: OK"`), `step_finish` báo
`input: 10614, output: 18`. Đó là system prompt của agent lập trình mà opencode
tự nhồi vào. Hai hệ quả:

- **Tốn hạn mức vô ích.** Mọi lượt chấm điểm đều trả tiền cho một system prompt
  về lập trình mà tác vụ không cần.
- **Nó cạnh tranh với prompt của mình.** Đây nhiều khả năng là cùng gốc với
  hiện tượng đã ghi trong `CLAUDE.md`: claude qua kiro **từ chối** yêu cầu ngoài
  lập trình. Cần đo lại chất lượng trên tác vụ thật, đừng suy ra từ việc nó trả
  lời được `"OK"`.

Cần đo tiếp: `--agent restricted` có cắt bớt phần 10.6k token đó không.

Rủi ro đã biết:

- **Version CLI.** Bản standalone trên máy dev là **1.18.11** (từ 01/08); bản
  từng đo UA là 1.18.31. OpenCode đã từng chặn theo chuỗi version → image phải
  ghim version và cập nhật có chủ đích.
- **Hợp đồng là stdout.** NDJSON của `--format json` ổn định hơn chữ trần, nhưng
  vẫn là thứ có thể đổi theo mỗi bản CLI.
- **Bể free có thể đóng bất cứ lúc nào.** Ở M2 điều này chấp nhận được:
  `ModelChain` bỏ qua mắt xích hỏng và app chạy tiếp. Ở M3 thì không.

---

## 6. Đề xuất ưu tiên

| Thứ tự | Việc | Công | Điều kiện để bắt đầu |
|---|---|---|---|
| ~~1~~ | ~~**M1** — đường `opencode-cli` trong `scripts/lib/model-call.mjs`~~ | — | **XONG 2026-09-23** |
| **2** | Đo 2 ẩn số còn lại ở mục 5, và chất lượng trên tác vụ thật | ~1 giờ | Sau khi M1 chạy được vài trăm lượt |
| **3** | **M2** — `opencode-service/` + wrapper OpenAI-compatible | ~2 ngày + phần giam giữ | Chuỗi hiện tại thật sự cạn hạn mức, **và** chấp nhận năm điều kiện giam giữ ở 4.2.1 |
| — | **M3** | — | **Không làm** |

**Điều kiện dừng cho M2 đã thay đổi.** Bản đầu viết "nếu không kiểm chứng được
tool đã tắt thì dừng hẳn" — đo xong thì biết **không bao giờ tắt được** trên bể
free (mục 5.1). Nên điều kiện dừng nay là: *nếu không làm đủ năm điều kiện giam
giữ ở 4.2.1 thì dừng hẳn.* Không đáng đổi một lõi dự phòng lấy một agent có shell
nằm chung mạng với `postgres`.

Hai dữ kiện nữa đáng cân khi quyết M2:

- **~10.600 token đầu vào mỗi lượt** làm bể free cạn nhanh hơn nhiều so với con số
  "8–10 giây một lượt" gợi ý. Và nay đã biết **không cắt được** phần đó bằng agent
  riêng, vì agent riêng thì mất bể free.
- **`opencode.db` phình ~19 KB/lượt**, không tự co. Cần volume và việc dọn định kỳ.

**Mức ưu tiên tổng thể là THẤP.** Chuỗi hiện tại không có mắt xích `oc/*` và app
đang chạy tốt (đo 22/09: viết thư 9,3s, object đúng schema). Đây là *thêm* hạn
mức dự phòng, không phải vá thứ đang hỏng. Nếu tuần này còn việc của khóa luận
thì xếp sau.

---

## 7. Phụ lục — lệnh đã dùng để đo

```bash
npm install -g opencode-ai            # 1.18.32; đã gỡ sau khi đo xong

opencode run "Tra loi dung mot tu: OK" --model opencode/big-pickle
opencode run "<prompt doi JSON>" --model opencode/big-pickle
opencode run "..." --model opencode/big-pickle --format json

opencode serve --port 4096 --hostname 127.0.0.1
curl -s http://127.0.0.1:4096/doc                       # OpenAPI 3.1, 162 endpoint
curl -X POST http://127.0.0.1:4096/session -d '{}'      # tao session
curl -X POST http://127.0.0.1:4096/session/$SID/message --data-binary @msg.json
```

Bản standalone của người dùng nằm ở `~/.opencode/bin/opencode.exe` (1.18.11, từ
01/08) — **không bị đụng tới**; dữ liệu ở `~/.local/share/opencode/` còn nguyên.
