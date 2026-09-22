#!/usr/bin/env python3
import json
import sys
import time
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090"

JD = """Vị trí: Senior Frontend Engineer (React/Next.js)
Công ty: FPT Software — TP. Hồ Chí Minh, Hybrid, 35-55 triệu/tháng.
Yêu cầu bắt buộc: tối thiểu 4 năm kinh nghiệm frontend; thành thạo React, Next.js, TypeScript, Tailwind CSS.
Ưu tiên: GraphQL, Testing Library, từng dẫn dắt nhóm từ 3 người."""

CV_STRONG = """Ứng viên: Trần Văn B, Senior Frontend Engineer, TP. Hồ Chí Minh, quốc tịch Việt Nam.
5 năm làm frontend, chuyên React và Next.js, từng dẫn dắt nhóm 4 người.
Kỹ năng: React, Next.js, TypeScript, Tailwind CSS, GraphQL, Testing Library."""

CV_WRONG_FIELD = """Ứng viên: Lê Thị C, Kế toán tổng hợp, Hà Nội, quốc tịch Việt Nam.
6 năm làm kế toán cho doanh nghiệp sản xuất.
Kỹ năng: Excel, MISA, thuế giá trị gia tăng, lập báo cáo tài chính. Chưa từng lập trình."""

CV_JUNIOR = """Ứng viên: Phạm Văn D, Frontend Developer, TP. Hồ Chí Minh.
1 năm kinh nghiệm. Kỹ năng: HTML, CSS, JavaScript, React cơ bản.
Chưa dùng Next.js và TypeScript trong dự án thật."""

Q_VI = {
    "eligibility": {
        "type": "choice",
        "instructions": "Ứng viên có phù hợp với tin tuyển dụng này không?",
        "criteria": {
            "PASS": "đúng ngành nghề và đáp ứng yêu cầu bắt buộc",
            "FAIL": "sai ngành nghề hoặc thiếu yêu cầu bắt buộc",
            "UNVERIFIED": "không đủ thông tin để kết luận",
        },
    },
    "same_field": {"type": "noul", "instructions": "Ứng viên có làm đúng ngành nghề mà tin tuyển dụng yêu cầu không?"},
    "meets_core_stack": {"type": "noul", "instructions": "Ứng viên có kinh nghiệm React, Next.js và TypeScript không?"},
    "meets_years": {"type": "noul", "instructions": "Ứng viên có đủ 4 năm kinh nghiệm trở lên không?"},
    "overall_fit": {
        "type": "score",
        "instructions": "Mức độ phù hợp tổng thể giữa ứng viên và tin tuyển dụng.",
        "criteria": ["không phù hợp", "có thể cân nhắc", "rất phù hợp"],
    },
}

Q_EN = {
    "eligibility": {
        "type": "choice",
        "instructions": "Is this candidate a fit for this job posting?",
        "criteria": {
            "PASS": "right profession and meets the mandatory requirements",
            "FAIL": "wrong profession or missing mandatory requirements",
            "UNVERIFIED": "not enough information to decide",
        },
    },
    "same_field": {"type": "noul", "instructions": "Does the candidate work in the profession the job asks for?"},
    "meets_core_stack": {"type": "noul", "instructions": "Does the candidate have React, Next.js and TypeScript experience?"},
    "meets_years": {"type": "noul", "instructions": "Does the candidate have at least 4 years of experience?"},
    "overall_fit": {
        "type": "score",
        "instructions": "Overall fit between the candidate and the job posting.",
        "criteria": ["not a fit", "maybe", "strong fit"],
    },
}

CASES = [
    ("khop-manh      (mong doi: PASS, yes, yes, yes, cao)", CV_STRONG),
    ("sai-nganh      (mong doi: FAIL, no,  no,  ?,   thap)", CV_WRONG_FIELD),
    ("thieu-kn       (mong doi: FAIL, yes, no,  no,  thap)", CV_JUNIOR),
]


def call(state, questions, model="multilingual", timeout=300):
    body = json.dumps({"state": state, "questions": questions, "model": model}, ensure_ascii=False).encode()
    request = urllib.request.Request(f"{URL}/predict", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())


def cell(answer):
    kind = answer.get("type")
    conf = answer.get("confidence")
    if kind == "choice":
        return f"{answer.get('choice')}({conf:.2f})"
    if kind == "noul":
        value = answer.get("noul")
        return f"{'yes' if value and value >= 0.5 else 'no'}[{value:.2f}]"
    if kind == "score":
        return f"{answer.get('score', answer.get('value')):.2f}" if isinstance(answer.get("score", answer.get("value")), float) else str(answer)
    return str(answer)


def run(label, questions):
    print(f"\n########## {label}")
    for name, cv in CASES:
        state = f"[TIN TUYEN DUNG]\n{JD}\n\n[HO SO UNG VIEN]\n{cv}"
        started = time.perf_counter()
        out = call(state, questions)
        wall = (time.perf_counter() - started) * 1000
        answers = out["result"]["answers"]
        row = "  ".join(f"{k}={cell(v)}" for k, v in answers.items())
        print(f"  {name}")
        print(f"    {row}")
        probs = answers.get("eligibility", {}).get("probabilities")
        if probs:
            print(f"    xac suat: {probs}   ({wall:.0f}ms, {out['result']['usage']['input_tokens']} token)")


if __name__ == "__main__":
    print("health:", urllib.request.urlopen(f"{URL}/health", timeout=60).read().decode())
    run("HOI BANG TIENG VIET", Q_VI)
    run("HOI BANG TIENG ANH (state van la tieng Viet)", Q_EN)
