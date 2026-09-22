#!/usr/bin/env python3
import json
import sys
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
JOB = json.load(open("/tmp/job.json", encoding="utf-8"))

CVS = {
    "lap trinh vien hop": (
        "Ứng viên: Trần Văn B, Senior Full Stack Developer, TP. Hồ Chí Minh, quốc tịch Việt Nam. "
        "6 năm kinh nghiệm phát triển web, thành thạo JavaScript, TypeScript, React, Node.js, SQL Server, "
        "từng xây dựng hệ thống quản lý khách hàng và tích hợp API nội bộ, dẫn dắt nhóm 4 người."
    ),
    "ke toan khong hop": (
        "Ứng viên: Lê Thị C, Kế toán tổng hợp, Hà Nội, quốc tịch Việt Nam. "
        "6 năm làm kế toán cho doanh nghiệp sản xuất, thành thạo Excel, MISA, thuế giá trị gia tăng, "
        "lập báo cáo tài chính. Chưa từng lập trình, không biết ngôn ngữ lập trình nào."
    ),
    "sinh vien moi": (
        "Ứng viên: Phạm Văn D, sinh viên mới tốt nghiệp ngành công nghệ thông tin, TP. Hồ Chí Minh. "
        "Chưa đi làm chính thức, mới học HTML, CSS và JavaScript cơ bản qua đồ án ở trường."
    ),
}

QUESTIONS = {
    "same_field": {"type": "noul", "instructions": "Ứng viên có làm đúng ngành nghề mà tin tuyển dụng yêu cầu không?"},
    "can_code": {"type": "noul", "instructions": "Ứng viên có biết lập trình không?"},
    "eligibility": {
        "type": "choice",
        "instructions": "Ứng viên có phù hợp với tin tuyển dụng này không?",
        "criteria": {
            "PASS": "đúng ngành nghề và đáp ứng yêu cầu",
            "FAIL": "sai ngành nghề hoặc thiếu yêu cầu bắt buộc",
            "UNVERIFIED": "không đủ thông tin",
        },
    },
}


def ask(state):
    body = json.dumps({"state": state, "questions": QUESTIONS, "model": "multilingual"}, ensure_ascii=False).encode()
    request = urllib.request.Request(f"{URL}/predict", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=900) as response:
        return json.loads(response.read().decode())


print(f"JD that: {JOB['title']}  ({len(JOB['desc'])} ky tu)")
for name, cv in CVS.items():
    state = f"[TIN TUYEN DUNG] {JOB['title']}\n{JOB['desc']}\n\n[HO SO UNG VIEN]\n{cv}"
    out = ask(state)
    a = out["result"]["answers"]
    print(
        f"  {name:22s} tokens={out['result']['usage']['input_tokens']:5d} {out['elapsed_ms']:7.0f}ms  "
        f"same_field={a['same_field']['noul']:.2f}  can_code={a['can_code']['noul']:.2f}  "
        f"eligibility={a['eligibility']['choice']}({a['eligibility']['confidence']:.2f})"
    )
