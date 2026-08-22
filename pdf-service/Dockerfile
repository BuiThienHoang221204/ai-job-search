# syntax=docker/dockerfile:1

# Dịch vụ in HTML ra PDF bằng Chromium.
#
#   docker build -t aijob-pdf -f pdf-service/Dockerfile pdf-service
#
# Đo ngày 2026-08-22, cùng một CV tiếng Việt 1 trang:
#   aijob-latex   3,27 GB   3,59 giây
#   aijob-pdf     1,20 GB   0,61-0,70 giây
FROM debian:bookworm-slim

# `python3` chứ KHÔNG phải `python3-minimal`: bản minimal không có thư viện chuẩn,
# `import json` báo ModuleNotFoundError và `http.server` cũng vắng. Đã làm build đỏ.
#
# `fonts-noto-core` là font CHÍNH, phủ chữ tiếng Việt có dấu. `fonts-liberation` cho
# bộ trùng metric Arial/Times. `fontconfig` và `poppler-utils` phục vụ bước tự kiểm.
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        chromium \
        python3 \
        fonts-noto-core \
        fonts-liberation \
        fonts-dejavu-core \
        fontconfig \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /usr/local/bin/pdf-service.py

# Chạy bằng người dùng không phải root: Chromium ở đây chạy với --no-sandbox.
# `--create-home` vì Chromium ghi cache dưới $HOME.
RUN useradd --create-home --shell /usr/sbin/nologin pdf
USER pdf
WORKDIR /home/pdf

# BƯỚC TỰ KIỂM, làm build ĐỎ chứ không cảnh báo. Hai kiểu hỏng nó chặn đều không có
# lỗi nào báo lúc chạy: thiếu font thì CV in ra đầy ô vuông, thiếu tầng chữ thì ATS
# đọc ra rỗng. Grep bằng chuỗi ASCII vì poppler có thể trả về dạng đã tách dấu.
RUN set -eu; \
    cd /tmp; \
    if [ -z "$(fc-list :lang=vi)" ]; then \
      echo '=== KHONG CO FONT NAO PHU TIENG VIET ==='; \
      fc-list | head -40; \
      exit 1; \
    fi; \
    printf '%s\n' \
      '<!doctype html><html lang="vi"><meta charset="utf-8">' \
      '<style>@page{size:A4;margin:15mm}body{font-family:"Noto Sans",sans-serif}</style>' \
      '<body><h1>PDF-SELFTEST-OK</h1>' \
      '<p>Trần Bá Mậu - Đà Nẵng - kỹ sư phần mềm, đã kiểm chữ có dấu.</p>' \
      > selftest.html; \
    python3 -c "import sys; sys.path.insert(0, '/usr/local/bin'); \
import importlib.util; \
spec = importlib.util.spec_from_file_location('svc', '/usr/local/bin/pdf-service.py'); \
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); \
ok, pdf, log = mod.render_html(open('selftest.html', encoding='utf-8').read()); \
open('selftest.pdf', 'wb').write(pdf); \
print('trang:', mod.count_pages(pdf)); \
sys.exit(0 if ok and len(pdf) > 1000 else (print(log) or 1))"; \
    pdftotext selftest.pdf selftest.txt; \
    if ! grep -q 'PDF-SELFTEST-OK' selftest.txt; then \
      echo '=== PDF IN RA KHONG CO TANG CHU (ATS se doc ra rong) ==='; \
      cat selftest.txt; \
      exit 1; \
    fi; \
    rm -f selftest.html selftest.pdf selftest.txt

ENV PORT=8080
EXPOSE 8080

# Probe bằng Python vì image không có curl, và thêm curl chỉ để probe là thêm một
# thứ phải vá bảo mật.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3).status==200 else 1)"

CMD ["python3", "/usr/local/bin/pdf-service.py"]
