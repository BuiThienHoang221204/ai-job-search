# syntax=docker/dockerfile:1

# Dịch vụ compile LaTeX ra PDF.
#
#   docker build -t aijob-latex -f latex-service/Dockerfile latex-service
#
# Không `apt-get` gì: image TeX Live đã có Python, và `server.py` chỉ dùng thư viện
# chuẩn. Nhờ vậy build không cần mạng cho phần dịch vụ và không có phụ thuộc nào để
# hỏng về sau.
#
# **`-medium` chứ không phải `latest`.** Đo trên Docker Hub ngày 2026-08-21:
#
#   latest / latest-full   2,70 GB nén   ~8,92 GB trên ổ
#   latest-medium          0,94 GB nén   ~2,5-3 GB trên ổ
#   latest-small           0,62 GB nén
#
# Bản đầy đủ mang theo mọi ngôn ngữ, ConTeXt và toàn bộ kho font — thứ mà hai
# template của dự án không chạm tới. Đừng đổi ngược lên `latest` để "cho chắc": 6GB
# đó rơi vào máy của mọi người vận hành và mọi lần build CI.
#
# Cách tự ghép từ Debian + apt đã được cân nhắc và BỎ: riêng `texlive-latex-extra`
# (nơi có moderncv) đã hơn 1GB và còn kéo theo `texlive-fonts-extra` cho fontawesome,
# tổng lại ngang scheme-medium nhưng phải tự dò gói qua nhiều vòng build.
FROM texlive/texlive:latest-medium

# Những gói này nằm trong `collection-latexextra`, thứ scheme-medium không kéo theo
# đủ. Chúng chỉ vài MB. `|| true` vì gói nào có sẵn rồi thì tlmgr báo lỗi, mà đó
# không phải chuyện đáng dừng build — thiếu thật thì bước hâm cache bên dưới sẽ đỏ,
# và đó mới là phép kiểm đáng tin.
#
# **`fontawesome6`, KHÔNG phải `fontawesome5`.** moderncv 2.6.1 (bản trong TeX Live
# 2026) nạp `fontawesome6.sty` qua `moderncviconssymbols`; cài nhầm bản 5 thì build
# dừng ở đúng dòng `! LaTeX Error: File 'fontawesome6.sty' not found.`
# `import` không phải gói của template mà là gói MODEL tự thêm: một bản nháp CV
# do agent sinh đã khai `\usepackage{import}` và bước tự kiểm hỏng với
# `! LaTeX Error: File 'import.sty' not found.` Vài trăm KB để không mất một
# bước compile vì một dòng model viết thêm theo thói quen.
RUN tlmgr install moderncv tex-gyre fontawesome6 fontawesome5 needspace import || true

# Chạy bằng người dùng không phải root. Compile là nơi nội dung do người ngoài kiểm
# soát được xử lý, nên nó không được có quyền root ngay cả trong container.
#
# `--create-home` vì lualatex ghi cache font vào $HOME; thiếu HOME ghi được thì lượt
# compile đầu tiên hỏng với một lỗi về luaotfload rất khó truy.
RUN useradd --create-home --shell /usr/sbin/nologin latex

COPY server.py /usr/local/bin/latex-service.py

USER latex
WORKDIR /home/latex

# Hâm sẵn cache font của luaotfload, ĐO ĐƯỢC là đáng làm: lượt compile đầu tiên
# trong một container mới mất 24,5 giây vì luaotfload phải dựng cache, các lượt sau
# chỉ 2,7–3,3 giây. Không hâm thì 24,5 giây đó rơi vào đúng người dùng đầu tiên sau
# mỗi lần deploy.
#
# Tài liệu hâm phải dùng CÙNG document class, CÙNG bộ gói và CÙNG font với template
# thật - xem `renderCv` trong `documents/latex.ts`. Không thì nó dựng cache cho font
# khác, và tệ hơn: nó không phát hiện được gói thiếu.
#
# Đã trả giá hai lần vì điều đó. `fontawesome6` và `needspace` đều chỉ lộ ra khi có
# người bấm tải PDF, mà `needspace` thì nằm ngay trong template CV của dự án - tức là
# nút tải PDF hỏng cho MỌI người dùng chứ không riêng agent.
#
# Chữ tiếng Việt trong tài liệu hâm là có chủ đích: nó buộc cache phủ luôn glyph có dấu.
RUN set -eu; \
    cd /tmp; \
    printf '%s\n' \
      '\documentclass[11pt,a4paper,sans]{moderncv}' \
      '\moderncvstyle{banking}' \
      '\usepackage[utf8]{inputenc}' \
      '\usepackage[scale=0.82]{geometry}' \
      '\usepackage{needspace}' \
      '\usepackage{hyperref}' \
      '\moderncvcolor{blue}' \
      '\name{Hâm}{Cache}' \
      '\begin{document}\makecvtitle' \
      '\section{Kỹ năng}\cvitem{}{Trần Bá Mậu, Đà Nẵng, kỹ thuật máy tính}' \
      '\end{document}' \
      > warm-cv.tex; \
    lualatex -no-shell-escape -interaction=nonstopmode warm-cv.tex > /dev/null 2>&1 || true; \
    if [ ! -f warm-cv.pdf ]; then \
      echo '=== HAM CACHE HONG, 60 dong log cuoi ==='; \
      tail -60 warm-cv.log; \
      exit 1; \
    fi; \
    rm -rf /tmp/warm-*

ENV PORT=8080
EXPOSE 8080

# Healthcheck gọi bằng Python vì image không có curl, và thêm curl chỉ để probe là
# thêm một thứ phải vá bảo mật.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3).status==200 else 1)"

CMD ["python3", "/usr/local/bin/latex-service.py"]
