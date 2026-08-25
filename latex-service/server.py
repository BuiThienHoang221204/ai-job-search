#!/usr/bin/env python3
"""Dịch vụ compile LaTeX ra PDF.

Nhận `.tex` qua HTTP, trả PDF. Chỉ dùng thư viện chuẩn của Python — image TeX Live
đã có Python 3.14 sẵn, nên không cần `apt-get` lúc build và không có phụ thuộc nào
để hỏng về sau.

VÌ SAO LÀ MỘT DỊCH VỤ RIÊNG, không phải app tự gọi `docker run`:

- App chạy trong container thì không có socket Docker. Mount socket vào là cho app
  quyền tương đương root trên host — với một hệ thống giữ CV thật thì không đáng.
- Và kể cả mount socket thì `-v <thư mục tạm>:/work` vẫn vỡ: daemon nằm trên host
  nên nó giải đường dẫn đó trên filesystem của host, nơi thư mục tạm bên trong
  container app không tồn tại. Container LaTeX khởi động với `/work` rỗng và ta
  nhận về một lỗi LaTeX vô nghĩa. Truyền `.tex` trong thân request thì vấn đề đó
  biến mất hoàn toàn.
- Image này nặng 8,92GB. Tách riêng thì image app giữ nguyên kích thước và deploy
  độc lập.

PHẠM VI CỐ Ý HẸP: nó compile LaTeX, không chạy lệnh tuỳ ý. Một endpoint kiểu "chạy
lệnh này" chính là một lỗ RCE dựng sẵn.

RANH GIỚI VỚI APP, nói chính xác: dịch vụ này **chọn dòng**, app **hiểu nghĩa**.

- Compile hỏng: trả nguyên log (đã cắt bớt). App rút lỗi LaTeX đầu tiên.
- Compile được: trả PDF thô, kèm header `X-Latex-Warnings-B64` chứa các dòng
  `Missing character` ghép bằng ` | ` rồi mã hoá base64. App giải mã, tách lại, và
  đưa qua đúng hàm `missingGlyphs` mà adapter Docker dùng — nhờ vậy chỉ có MỘT bộ
  parser, và nó là bộ đã có test.

  Base64 là bắt buộc: những dòng đó chứa ký tự tiếng Việt, còn giá trị header HTTP
  phải là ISO-8859-1. Xem `warnings_header`.

Chọn dòng ở đây thay vì gửi cả log là vì header không chứa nổi vài chục KB, mà cả
log thì app cũng không dùng khi đã có PDF.
"""

import base64
import json
import os
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Giới hạn kích thước `.tex` nhận vào. Một CV sinh ra khoảng 1–3KB; 1MB là rộng gấp
# hàng trăm lần mà vẫn chặn được việc ai đó đẩy vào một file khổng lồ.
MAX_TEX_BYTES = 1024 * 1024

# Hạn thời gian cho lualatex. Đo được 4,6–5,1 giây cho một CV thật; 55 giây là biên
# rộng, và cố ý NGẮN HƠN timeout 60 giây phía app để app luôn nhận được câu trả lời
# có log thay vì một kết nối bị cắt.
COMPILE_TIMEOUT_S = 55

# Log của lualatex dài vài chục KB. Cắt để một lần compile hỏng không đẩy hàng megabyte
# qua mạng; phần đầu là nơi lỗi thật nằm.
MAX_LOG_BYTES = 256 * 1024

PORT = int(os.environ.get("PORT", "8080"))


def compile_tex(tex: str) -> tuple[bool, bytes, str]:
    """Chạy lualatex trong một thư mục tạm. Trả về (có_pdf, pdf, log)."""
    work = tempfile.mkdtemp(prefix="latex-")
    try:
        tex_path = os.path.join(work, "main.tex")
        with open(tex_path, "w", encoding="utf-8") as handle:
            handle.write(tex)

        try:
            proc = subprocess.run(
                [
                    "lualatex",
                    "-no-shell-escape",
                    "-interaction=nonstopmode",
                    "main.tex",
                ],
                cwd=work,
                capture_output=True,
                timeout=COMPILE_TIMEOUT_S,
                # Không dùng shell: nội dung do người ngoài kiểm soát.
                shell=False,
            )
            stdout = proc.stdout.decode("utf-8", "replace")
        except subprocess.TimeoutExpired:
            return False, b"", "! Quá thời gian compile phía dịch vụ."

        log_path = os.path.join(work, "main.log")
        log = stdout
        if os.path.exists(log_path):
            with open(log_path, "rb") as handle:
                log = handle.read()[:MAX_LOG_BYTES].decode("utf-8", "replace")

        pdf_path = os.path.join(work, "main.pdf")
        if not os.path.exists(pdf_path):
            return False, b"", log

        with open(pdf_path, "rb") as handle:
            pdf = handle.read()

        # PDF rỗng cũng là thất bại: `-interaction=nonstopmode` có thể bỏ qua lỗi
        # rồi vẫn thoát 0 với một file dở dang.
        return len(pdf) > 0, pdf, log
    finally:
        shutil.rmtree(work, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    # Giao thức HTTP/1.1 để giữ kết nối, tránh bắt tay lại cho mỗi request.
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:
        # Ghi gọn một dòng, không ghi thân request: `.tex` chứa dữ liệu hồ sơ.
        print(f"{self.command} {self.path} - {fmt % args}", flush=True)

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: int, payload: dict) -> None:
        self._send(
            status,
            json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            "application/json; charset=utf-8",
        )

    def do_GET(self) -> None:  # noqa: N802 - tên do BaseHTTPRequestHandler quy định
        if self.path == "/health":
            self._send_json(200, {"ok": True})
            return
        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/compile":
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send_json(400, {"ok": False, "error": "Content-Length không hợp lệ"})
            return

        if length <= 0:
            self._send_json(400, {"ok": False, "error": "Thân request rỗng"})
            return
        if length > MAX_TEX_BYTES:
            # Trả 413 rồi đóng: đọc hết một thân request khổng lồ chỉ để từ chối nó
            # là đúng thứ ta muốn tránh.
            self._send_json(413, {"ok": False, "error": "File .tex quá lớn"})
            return

        tex = self.rfile.read(length).decode("utf-8", "replace")
        ok, pdf, log = compile_tex(tex)

        if not ok:
            # Log đi kèm trong JSON để app rút ra lỗi LaTeX đầu tiên.
            self._send_json(422, {"ok": False, "log": log})
            return

        # PDF trả về dạng bytes thô, KHÔNG bọc base64 trong JSON: base64 phình 33%
        # và app vẫn cần log, nên log đi qua header đã nén bớt còn PDF đi nguyên.
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(pdf)))
        # Chỉ những dòng app cần: ký tự font bị bỏ. Header không chứa nổi cả log,
        # mà cả log thì app cũng không dùng khi đã có PDF.
        self.send_header("X-Latex-Warnings-B64", warnings_header(log))
        self.end_headers()
        self.wfile.write(pdf)


def warnings_header(log: str) -> str:
    """Gom các dòng `Missing character` thành MỘT header, mã hoá base64.

    Đây là cách chữ bị âm thầm mất khỏi PDF, và với tiếng Việt đó là rủi ro chính.

    BASE64 là bắt buộc, không phải để cho gọn. Giá trị header HTTP phải là
    ISO-8859-1, mà chính những dòng này chứa ký tự tiếng Việt (`Missing character:
    There is no ạ (U+1EA1)...`). Gửi thẳng thì `fetch` của Node từ chối cả phản hồi
    và app nhận về "không nối được tới dịch vụ" — một lỗi hoàn toàn sai hướng. Đã
    gặp thật khi test bằng dữ liệu tiếng Việt; dùng chữ ASCII giả thì không lộ ra.

    Ghép bằng ` | ` vì header không chứa được xuống dòng; app tách lại rồi dùng đúng
    parser mà adapter Docker dùng.
    """
    seen: list[str] = []
    for line in log.splitlines():
        stripped = line.strip()
        if "Missing character" in stripped and stripped not in seen:
            seen.append(stripped)
    if not seen:
        return ""
    joined = " | ".join(seen)[:2048]
    return base64.b64encode(joined.encode("utf-8")).decode("ascii")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"latex-service nghe tren cong {PORT}", flush=True)
    server.serve_forever()
