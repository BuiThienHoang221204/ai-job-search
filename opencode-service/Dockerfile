# syntax=docker/dockerfile:1

# Chạy CLI `opencode` sau một cổng HTTP OpenAI-compatible.
#
#   docker build -t aijob-opencode -f opencode-service/Dockerfile opencode-service
#
# Vì sao phải là CLI chứ không gọi thẳng HTTP: bể free của OpenCode chặn caller
# ngoài (`403 free tier can only be used from within OpenCode`), và bản
# `opencode serve` cũng bị chặn — chỉ `opencode run` đi lọt. Toàn bộ số đo nằm ở
# `docs/OPENCODE-CLI.md`.
#
# ĐỌC TRƯỚC KHI SỬA: tuyệt đối KHÔNG thêm `opencode.json` vào image. Đã đo
# 2026-09-23: hễ tuỳ biến cấu hình agent — kể cả chỉ ghi đè `permission` của
# agent dựng sẵn `build` — là bể free trả 403. Nghĩa là KHÔNG tắt được tool.
# An toàn ở đây dựa vào GIAM GIỮ, không dựa vào cấm đoán: thư mục làm việc rỗng,
# user không phải root, mạng riêng và filesystem chỉ đọc (khai trong compose).
FROM node:22-slim

# Ghim version. OpenCode đã từng chặn theo chuỗi version, nên nâng bản phải là
# một hành động có chủ đích chứ không phải hệ quả của một lần build lại.
ARG OPENCODE_VERSION=1.18.32
RUN npm install -g "opencode-ai@${OPENCODE_VERSION}" && npm cache clean --force

# `--create-home` vì CLI ghi trạng thái vào $HOME/.local/share/opencode.
RUN useradd --create-home --shell /usr/sbin/nologin opencode

# Thư mục dữ liệu phải TỒN TẠI trong image trước khi compose gắn volume vào đó.
# Thiếu bước này thì Docker tạo nó bằng root và CLI chết ngay lượt gọi đầu với
# `EACCES: permission denied, mkdir '.../repos'` — đã sập một lần.
RUN mkdir -p /home/opencode/.local/share/opencode \
    && chown -R opencode:opencode /home/opencode/.local

# Thư mục làm việc RỖNG và phải luôn rỗng: model ở đây có đủ tool `read`/`bash`,
# nên thứ bảo vệ ta là không có gì cho nó đọc. Đừng COPY bất cứ thứ gì vào /work.
RUN mkdir -p /work && chown opencode:opencode /work

COPY server.js /usr/local/bin/opencode-service.js

USER opencode
WORKDIR /home/opencode

# `read_only: true` trong compose làm $HOME chỉ đọc, nên mọi thứ CLI ghi phải
# nằm ở hai chỗ ghi được: volume dữ liệu, hoặc tmpfs `/tmp`. Thiếu ba biến XDG
# dưới đây thì lượt gọi đầu chết với `EROFS: mkdir '/home/opencode/.local/state'`.
ENV PORT=8080 \
    OPENCODE_WORK_DIR=/work \
    NODE_ENV=production \
    XDG_DATA_HOME=/home/opencode/.local/share \
    XDG_STATE_HOME=/tmp/state \
    XDG_CACHE_HOME=/tmp/cache \
    XDG_CONFIG_HOME=/tmp/config

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "/usr/local/bin/opencode-service.js"]
