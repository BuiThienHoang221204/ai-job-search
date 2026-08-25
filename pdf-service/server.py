#!/usr/bin/env python3
"""Dịch vụ in HTML ra PDF bằng Chromium. Đường sinh CV.

Chỉ dùng thư viện chuẩn của Python và nhị phân `chromium` có sẵn trong image.
Phạm vi cố ý hẹp: nhận HTML qua POST /render, trả PDF; không chạy lệnh tuỳ ý và
không ra được Internet.

Vì sao tách thành dịch vụ riêng, và vì sao CV bỏ LaTeX sang HTML: xem CLAUDE.md,
mục "CV đi đường HTML, thư xin việc vẫn đi đường LaTeX".
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CHROMIUM = os.environ.get("CHROMIUM_BIN", "/usr/bin/chromium")

# Một CV kèm CSS nội tuyến khoảng 20-40KB; 4MB là rộng gấp trăm lần.
MAX_HTML_BYTES = 4 * 1024 * 1024

# Đo được 0,61-0,70 giây một CV thật. Cố ý NGẮN HƠN timeout phía app để app luôn
# nhận được câu trả lời có nội dung thay vì một kết nối bị cắt.
RENDER_TIMEOUT_S = 25

VIRTUAL_TIME_BUDGET_MS = 3_000
MAX_LOG_BYTES = 64 * 1024
PORT = int(os.environ.get("PORT", "8080"))

# Cắt mọi phân giải tên miền. Tách thành hằng số vì mất cờ này thì bản in vẫn ra
# bình thường - đường ra mạng mở lại mà không có gì báo.
BLOCK_NETWORK_FLAG = "--host-resolver-rules=MAP * ~NOTFOUND"


def chromium_argv(html_path: str, pdf_path: str, profile_dir: str) -> list[str]:
    """Dòng lệnh in một file HTML ra PDF. Tách riêng để test được các cờ an toàn."""
    return [
        CHROMIUM,
        "--headless=new",
        "--disable-gpu",
        # /dev/shm trong container chỉ 64MB, và Chromium coi hết chỗ ở đó là crash.
        "--disable-dev-shm-usage",
        # Sandbox của Chromium cần user namespace mà container thường không cho.
        # Bù lại bằng user không phải root, trần bộ nhớ, và cờ chặn mạng bên dưới.
        "--no-sandbox",
        BLOCK_NETWORK_FLAG,
        # Mỗi lượt in một thư mục hồ sơ riêng: dùng chung thì lượt thứ hai thoát ngay.
        f"--user-data-dir={profile_dir}",
        "--run-all-compositor-stages-before-draw",
        f"--virtual-time-budget={VIRTUAL_TIME_BUDGET_MS}",
        # Bỏ header/footer mặc định của trình duyệt; lề do @page trong CSS quyết định.
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        f"file://{html_path}",
    ]


def render_html(html: str) -> tuple[bool, bytes, str]:
    """In HTML ra PDF trong một thư mục tạm. Trả về (có_pdf, pdf, log)."""
    work = tempfile.mkdtemp(prefix="pdf-")
    try:
        html_path = os.path.join(work, "document.html")
        pdf_path = os.path.join(work, "document.pdf")
        profile_dir = os.path.join(work, "profile")

        with open(html_path, "w", encoding="utf-8") as handle:
            handle.write(html)

        try:
            proc = subprocess.run(
                chromium_argv(html_path, pdf_path, profile_dir),
                cwd=work,
                capture_output=True,
                timeout=RENDER_TIMEOUT_S,
                shell=False,
            )
            log = proc.stderr.decode("utf-8", "replace")[:MAX_LOG_BYTES]
        except subprocess.TimeoutExpired:
            return False, b"", "! Quá thời gian in phía dịch vụ."
        except FileNotFoundError:
            return False, b"", f"! Không tìm thấy Chromium tại {CHROMIUM}."

        if not os.path.exists(pdf_path):
            return False, b"", log or "! Chromium không tạo ra file PDF nào."

        with open(pdf_path, "rb") as handle:
            pdf = handle.read()

        # PDF rỗng cũng là thất bại: Chromium có thể thoát 0 với một file dở dang.
        return len(pdf) > 0, pdf, log
    finally:
        shutil.rmtree(work, ignore_errors=True)


def count_pages(pdf: bytes) -> int:
    """Đếm trang qua object `/Type /Page`. Ranh giới `\\b` để không đếm nhầm `/Type /Pages`."""
    return len(re.findall(rb"/Type\s*/Page\b", pdf))


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: object) -> None:
        """Ghi gọn một dòng, không ghi thân request: HTML chứa dữ liệu hồ sơ."""
        print(f"{self.command} {self.path} - {fmt % args}", flush=True)

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        """Gửi một phản hồi hoàn chỉnh."""
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: int, payload: dict) -> None:
        """Gửi phản hồi JSON tiếng Việt."""
        self._send(
            status,
            json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            "application/json; charset=utf-8",
        )

    def do_GET(self) -> None:  # noqa: N802 - tên do BaseHTTPRequestHandler quy định
        """Chỉ phục vụ /health."""
        if self.path == "/health":
            self._send_json(200, {"ok": True})
            return
        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        """Nhận HTML ở /render, trả PDF kèm số trang trong header."""
        if self.path != "/render":
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
        if length > MAX_HTML_BYTES:
            self._send_json(413, {"ok": False, "error": "File HTML quá lớn"})
            return

        html = self.rfile.read(length).decode("utf-8", "replace")
        ok, pdf, log = render_html(html)

        if not ok:
            self._send_json(422, {"ok": False, "log": log})
            return

        # PDF đi dạng bytes thô, không bọc base64 trong JSON: base64 phình 33%.
        self.send_response(200)
        self.send_header("Content-Type", "application/pdf")
        self.send_header("Content-Length", str(len(pdf)))
        self.send_header("X-Pdf-Pages", str(count_pages(pdf)))
        self.end_headers()
        self.wfile.write(pdf)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"pdf-service nghe tren cong {PORT}", flush=True)
    server.serve_forever()
