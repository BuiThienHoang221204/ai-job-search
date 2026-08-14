# syntax=docker/dockerfile:1

# Dịch vụ compile LaTeX ra PDF.
#
#   docker build -t aijob-latex -f latex-service/Dockerfile latex-service
#
# Không `apt-get` gì: image TeX Live đã có Python 3.14, và `server.py` chỉ dùng thư
# viện chuẩn. Nhờ vậy build không cần mạng và không có phụ thuộc nào để hỏng về sau.
#
# Image gốc nặng 8,92GB. Đó chính là lý do dịch vụ này tách khỏi image app: app giữ
# nguyên kích thước nhỏ và deploy độc lập với bộ công cụ LaTeX.
FROM texlive/texlive:latest

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
# Tài liệu hâm phải dùng CÙNG document class và font với thật, nếu không nó dựng cache
# cho font khác và chẳng giúp gì. Chữ tiếng Việt trong đó là có chủ đích: nó buộc cache
# phủ luôn các glyph có dấu.
RUN set -eu; \
    cd /tmp; \
    printf '%s\n' \
      '\documentclass[11pt,a4paper,sans]{moderncv}' \
      '\moderncvstyle{banking}' \
      '\moderncvcolor{blue}' \
      '\name{Hâm}{Cache}' \
      '\begin{document}\makecvtitle' \
      '\section{Kỹ năng}\cvitem{}{Trần Bá Mậu, Đà Nẵng, kỹ thuật máy tính}' \
      '\end{document}' \
      > warm-cv.tex; \
    lualatex -no-shell-escape -interaction=nonstopmode warm-cv.tex > /dev/null 2>&1; \
    test -f warm-cv.pdf; \
    rm -rf /tmp/warm-*

ENV PORT=8080
EXPOSE 8080

# Healthcheck gọi bằng Python vì image không có curl, và thêm curl chỉ để probe là
# thêm một thứ phải vá bảo mật.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3).status==200 else 1)"

CMD ["python3", "/usr/local/bin/latex-service.py"]
