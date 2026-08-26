# syntax=docker/dockerfile:1

# Build context là GỐC REPO, không phải server/: image cần cả `server/` lẫn
# `.claude/skills`, `.agents/skills`, `.claude/commands`, `cv/` và
# `cover_letters/`, mà năm thư mục sau nằm ngoài server/.
#
#   docker build -t ai-job-server -f Dockerfile .
#
# Node >= 22.12 là YÊU CẦU CỨNG, không phải sở thích: `ai` và
# `@ai-sdk/openai-compatible` là ESM thuần không có bản CommonJS, còn `nest build`
# xuất ra CommonJS - ứng dụng chạy được nhờ Node cho phép `require()` một module
# ESM, tính năng chỉ có từ 22.12. Image cũ hơn sẽ chết lúc khởi động với thông báo
# không liên quan gì tới nguyên nhân.

########################################
# Stage 1 - biên dịch
########################################
FROM node:22-slim AS build

# corepack đọc trường "packageManager" trong package.json để chốt đúng phiên bản
# pnpm, nên bản build và bản trên máy dev không lệch nhau.
RUN corepack enable

WORKDIR /app/server

# Copy manifest TRƯỚC phần còn lại: nhờ vậy layer cài phụ thuộc chỉ phải chạy lại
# khi manifest đổi, không phải mỗi lần sửa một dòng code.
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY server/ ./

# `prisma generate` BẮT BUỘC chạy ở đây: client sinh ra nằm trong .gitignore nên
# không tồn tại trong build context. Thiếu bước này thì `nest build` đỏ ngay.
RUN pnpm prisma generate
RUN pnpm build

########################################
# Stage 2 - chạy
########################################
FROM node:22-slim AS runtime

# curl: TopCV chặn TLS fingerprint của bun, nên portal CLI của nó gọi qua curl.
#   Thiếu curl thì việc quét TopCV hỏng LÚC CHẠY, không phải lúc build - đúng kiểu
#   thiếu sót chỉ lộ ra khi đã lên môi trường thật.
#   Nay tool `fetch_url` của agent cũng đi qua curl vì đúng lý do đó (xem
#   `agent/utils/http-get.ts`), nên gỡ curl ra sẽ làm hỏng HAI tính năng.
# ca-certificates: cần cho mọi request HTTPS ra portal và ra gateway model.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# bun: cả 4 portal CLI chạy bằng bun (xem PortalCliService). Lấy binary từ image
# chính thức thay vì chạy script cài: không thêm một lần tải qua mạng, và phiên
# bản được ghim theo tag thay vì "bản mới nhất lúc build".
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

RUN corepack enable
WORKDIR /app/server

ENV NODE_ENV=production

# Cài lại từ đầu chỉ với phụ thuộc chạy thật, thay vì prune node_modules của stage
# build: `pnpm install --prod` cho một cây phụ thuộc sạch và kiểm chứng được bằng
# lockfile. Đây cũng là lệnh khiến `dotenv` phải nằm ở `dependencies` - main.ts
# import nó lúc chạy.
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/server/dist ./dist

# prisma/ đi kèm để chạy được `pnpm prisma migrate deploy` từ trong container.
# prisma.config.ts là BẮT BUỘC chứ không phải tuỳ chọn: schema.prisma khai
# `datasource db` KHÔNG có trường `url`, URL đến từ file config này. Thiếu nó thì
# `migrate deploy` trong bước triển khai đứt, còn build vẫn xanh.
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./prisma.config.ts

# Đọc lúc KHỞI ĐỘNG, không phải tài nguyên tuỳ chọn: thiếu `.claude/skills` thì
# SkillRegistry không dựng được prompt nào, thiếu `.agents/skills` thì không portal
# nào được đăng ký và việc quét im lặng không làm gì.
COPY .claude/skills /app/.claude/skills
COPY .agents/skills /app/.agents/skills
COPY .claude/commands /app/.claude/commands
COPY cv /app/cv
COPY cover_letters /app/cover_letters

# Khai TƯỜNG MINH đường dẫn tuyệt đối. Mặc định trong configuration.ts là tương
# đối theo `process.cwd()` - đúng khi chạy `pnpm start` từ server/, nhưng đó là một
# giả định ngầm về vị trí tiến trình. Khai rõ ở đây thì bố cục image đổi cũng không
# làm scraper âm thầm không tìm thấy portal nào.
ENV SKILLS_DIR=/app/.claude/skills \
    PORTALS_DIR=/app/.agents/skills \
    COMMANDS_DIR=/app/.claude/commands \
    TEMPLATES_ROOT=/app \
    STORAGE_LOCAL_ROOT=/app/workspaces

# workspaces là nơi ghi file .tex của người dùng - gắn volume vào đây khi chạy
# thật, nếu không dữ liệu mất theo container.
RUN mkdir -p /app/workspaces && chown -R node:node /app/workspaces
USER node

EXPOSE 3000

# Dùng LIVENESS chứ không phải readiness. Readiness hỏng khi database chập chờn, và
# nếu healthcheck của container đọc nó thì Docker sẽ khởi động lại một tiến trình
# hoàn toàn khoẻ mạnh - làm sự cố nặng thêm thay vì chỉ ngừng nhận request.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.PORT||4000;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# CỐ Ý không chạy `prisma migrate deploy` ở đây. Migration là bước triển khai
# riêng, chạy MỘT lần; nhúng vào lệnh khởi động thì khi scale ra nhiều instance,
# mọi bản sẽ cùng chạy migration một lúc.
CMD ["node", "dist/main"]
