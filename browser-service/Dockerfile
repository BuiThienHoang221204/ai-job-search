# Ảnh cho Assisted Apply: mở trang tuyển dụng, điền form, chụp ảnh, DỪNG.
#
# Vì sao phải dựng ảnh riêng thay vì dùng thẳng `mcr.microsoft.com/playwright`:
# ảnh chính thức chỉ có **trình duyệt** và thư viện hệ thống ở `/ms-playwright`,
# CHƯA có package npm `playwright`. Đã kiểm: `npm root -g` chỉ chứa
# corepack/npm/yarn, nên một script `import { chromium } from "playwright"` chạy
# trong đó sẽ chết bằng ERR_MODULE_NOT_FOUND.
#
# Cài vào `/node_modules` là có chủ đích, không phải cho gọn: Node tìm
# `node_modules` bằng cách đi NGƯỢC LÊN từ thư mục của script, và script của ta
# nằm ở `/work/apply.mjs` (do `SandboxRunner` ghi vào). `/work` → `/` nên nó tìm
# thấy `/node_modules`. Nhờ vậy không cần biến môi trường `NODE_PATH`, tức là
# `SandboxSpec` không phải mọc thêm trường `env` chỉ vì chuyện này.
#
# Script điền form KHÔNG nướng vào ảnh: nó do adapter ghi vào `/work` mỗi lượt
# chạy. Sửa logic điền là sửa một file TypeScript trong `src/`, không phải dựng
# lại 3,52GB.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# Phải đặt TRƯỚC `npm install`: nếu không, npm tải lại toàn bộ trình duyệt (~400MB)
# trong khi ảnh nền đã có chúng ở `/ms-playwright`.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Cài ở `/opt/pw` rồi symlink `/node_modules` sang đó.
#
# KHÔNG chạy `npm install` thẳng tại `/`: npm đổ lỗi `Tracker "idealTree" already
# exists` và thoát 1 — đã gặp. Symlink cho ra cùng kết quả cho phép giải module
# đi-ngược-lên mà không phải đấu với npm.
#
# Ghim đúng phiên bản của ảnh nền. Lệch phiên bản giữa package và trình duyệt đã
# cài là một lỗi "executable doesn't exist" rất tối nghĩa lúc chạy.
RUN mkdir -p /opt/pw \
  && cd /opt/pw \
  && npm init -y >/dev/null \
  && npm install --no-audit --no-fund playwright@1.62.1 \
  && npm cache clean --force \
  && ln -s /opt/pw/node_modules /node_modules

# `pwuser` có sẵn trong ảnh nền. Chạy bằng root thì một trang web độc hại khai thác
# được lỗ hổng của Chromium sẽ có root trong container.
USER pwuser

WORKDIR /work
