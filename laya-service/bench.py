#!/usr/bin/env python3
import json
import sys
import time
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090"

JD = """Vị trí: Senior Frontend Engineer (React/Next.js)
Công ty: FPT Software — TP. Hồ Chí Minh, hình thức Hybrid, lương 35-55 triệu/tháng.
Yêu cầu bắt buộc:
- Tối thiểu 4 năm kinh nghiệm phát triển frontend.
- Thành thạo React, Next.js, TypeScript, Tailwind CSS.
- Có kinh nghiệm tối ưu hiệu năng web và Core Web Vitals.
Ưu tiên:
- Có kinh nghiệm GraphQL và Testing Library.
- Từng dẫn dắt nhóm từ 3 người trở lên.
- Từng xây dựng design system dùng chung cho nhiều sản phẩm."""

CV = """Ứng viên: Trần Văn B
Chức danh hiện tại: Senior Frontend Engineer
Địa điểm: TP. Hồ Chí Minh, Việt Nam. Quốc tịch: Việt Nam.
Kinh nghiệm: 5 năm làm frontend, chuyên React và Next.js, từng dẫn dắt nhóm 4 người.
Kỹ năng chính: React, Next.js, TypeScript, Tailwind CSS.
Kỹ năng phụ: Node.js, GraphQL, Testing Library.
Chưa có: Kubernetes, Rust, Machine Learning.
Lĩnh vực đã làm: Thương mại điện tử, Fintech.
Dự án nổi bật: xây dựng design system dùng chung, tối ưu Core Web Vitals cho trang bán hàng.
Mục tiêu: trở thành Tech Lead frontend.
Không chấp nhận: chuyển ra Hà Nội."""

CV_MISMATCH = """Ứng viên: Lê Thị C
Chức danh hiện tại: Kế toán tổng hợp
Địa điểm: Hà Nội, Việt Nam. Quốc tịch: Việt Nam.
Kinh nghiệm: 6 năm làm kế toán cho doanh nghiệp sản xuất.
Kỹ năng chính: Excel, MISA, thuế giá trị gia tăng, lập báo cáo tài chính.
Chưa từng lập trình.
Mục tiêu: trưởng phòng kế toán."""

CV_JUNIOR = """Ứng viên: Phạm Văn D
Chức danh hiện tại: Frontend Developer
Địa điểm: TP. Hồ Chí Minh, Việt Nam.
Kinh nghiệm: 1 năm làm frontend.
Kỹ năng chính: HTML, CSS, JavaScript, React cơ bản.
Chưa dùng Next.js và TypeScript trong dự án thật.
Mục tiêu: học thêm để lên Senior."""

QUESTIONS = {
    "eligibility": {
        "type": "choice",
        "instructions": "Ứng viên có đủ điều kiện cơ bản để ứng tuyển tin này không?",
        "criteria": {
            "PASS": "Ứng viên đủ điều kiện làm việc và đúng ngành nghề của tin tuyển dụng",
            "FAIL": "Ứng viên sai ngành nghề, hoặc không đáp ứng điều kiện bắt buộc về quốc tịch hay địa điểm",
            "UNVERIFIED": "Không đủ thông tin để kết luận",
        },
    },
    "meets_core_stack": {
        "type": "noul",
        "instructions": "Ứng viên có kinh nghiệm thực tế với React, Next.js và TypeScript như tin yêu cầu không?",
    },
    "meets_years": {
        "type": "noul",
        "instructions": "Ứng viên có đủ số năm kinh nghiệm tối thiểu mà tin tuyển dụng yêu cầu không?",
    },
    "location_ok": {
        "type": "noul",
        "instructions": "Địa điểm làm việc của tin có phù hợp với ràng buộc địa điểm của ứng viên không?",
    },
    "technical_fit": {
        "type": "score",
        "instructions": "Mức độ khớp về kỹ năng chuyên môn giữa ứng viên và tin tuyển dụng.",
        "criteria": ["không khớp kỹ năng nào", "khớp một phần", "khớp toàn bộ kỹ năng cốt lõi"],
    },
    "overall_fit": {
        "type": "score",
        "instructions": "Mức độ phù hợp tổng thể của ứng viên với tin tuyển dụng.",
        "criteria": ["không phù hợp", "có thể cân nhắc", "rất phù hợp"],
    },
}

CASES = [
    ("khop-manh", JD, CV),
    ("sai-nganh", JD, CV_MISMATCH),
    ("thieu-kinh-nghiem", JD, CV_JUNIOR),
]


def call(state, questions, model=None, timeout=300):
    payload = {"state": state, "questions": questions}
    if model:
        payload["model"] = model
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{URL}/predict", data=body, headers={"Content-Type": "application/json"}
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.loads(response.read().decode("utf-8"))
    result["wall_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result


def brief(answers):
    out = []
    for key, value in answers.items():
        if not isinstance(value, dict):
            out.append(f"{key}={value}")
            continue
        picked = value.get("choice", value.get("score", value.get("answer", value.get("value"))))
        conf = value.get("confidence")
        out.append(f"{key}={picked}" + (f"({conf:.2f})" if isinstance(conf, float) else ""))
    return "  ".join(out)


def main():
    with urllib.request.urlopen(f"{URL}/health", timeout=60) as response:
        print("health:", response.read().decode("utf-8"))

    print(f"\n=== {len(QUESTIONS)} cau hoi / truong hop ===")
    for name, jd, cv in CASES:
        state = f"[TIN TUYEN DUNG]\n{jd}\n\n[HO SO UNG VIEN]\n{cv}"
        print(f"\n--- {name}  (state {len(state)} ky tu)")
        try:
            result = call(state, QUESTIONS)
        except Exception as error:
            print(f"    LOI: {type(error).__name__}: {error}")
            continue
        payload = result["result"]
        print(f"    {result['wall_ms']}ms tong / {result['elapsed_ms']}ms suy luan")
        routing = payload.get("routing")
        if routing:
            print(f"    routing: {routing.get('model')} — {routing.get('reason')}")
        print(f"    {brief(payload.get('answers', {}))}")

    print("\n=== anh huong cua cat ngan (JD nhan doi de vuot 1024 token) ===")
    long_jd = JD + "\n\nMô tả chi tiết công việc:\n" + ("Phối hợp với nhóm thiết kế và backend để xây dựng giao diện, viết tài liệu kỹ thuật, tham gia review code, bảo trì hệ thống hiện có, tối ưu tốc độ tải trang, hỗ trợ tuyển dụng và đào tạo thành viên mới. " * 30)
    state_long = f"[TIN TUYEN DUNG]\n{long_jd}\n\n[HO SO UNG VIEN]\n{CV}"
    print(f"    state dai: {len(state_long)} ky tu")
    try:
        result = call(state_long, QUESTIONS)
        payload = result["result"]
        print(f"    {result['wall_ms']}ms — {brief(payload.get('answers', {}))}")
    except Exception as error:
        print(f"    LOI: {type(error).__name__}: {error}")

    print("\n=== lap lai 5 luot de do do tre on dinh ===")
    state = f"[TIN TUYEN DUNG]\n{JD}\n\n[HO SO UNG VIEN]\n{CV}"
    times = []
    for _ in range(5):
        try:
            times.append(call(state, QUESTIONS)["elapsed_ms"])
        except Exception as error:
            print(f"    LOI: {error}")
            break
    if times:
        print(f"    {[round(t) for t in times]} ms — trung binh {sum(times)/len(times):.0f}ms cho {len(QUESTIONS)} cau")


if __name__ == "__main__":
    main()
