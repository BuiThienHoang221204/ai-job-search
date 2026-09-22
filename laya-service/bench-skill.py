#!/usr/bin/env python3
import json
import sys
import time
import urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090"

DISTRACTORS = [
    "Agentic AI frameworks", "Protobuf", "RabbitMQ", "Workato", "injection molding",
    "Corporate Training", "ThreeJS", "Kiểm toán", "Securities", "Presale",
    "Điện nhẹ", "SQL performance tuning", "PWA", "Luyện thi TOEIC", "trucking arrangement",
    "phương pháp giảng dạy", "coroutines", "Misa amis", "Responsive Design", "Australian public practice",
]

CASES = [
    ("RESTful API", ["REST APIs", "Protobuf", "PWA", "RabbitMQ", "SQL performance tuning"], 1),
    ("giảng dạy tiếng Anh", ["Kiểm toán", "Dạy tiếng Anh", "Luyện thi TOEIC", "Corporate Training", "phương pháp giảng dạy"], 2),
    ("lập báo cáo tài chính", ["Kiểm toán", "Securities", "Báo cáo tài chính", "Misa amis", "Presale"], 3),
    ("Design Pattern", ["coroutines", "PWA", "Responsive Design", "design patterns", "Protobuf"], 4),
    ("full-stack engineering", ["ThreeJS", "PWA", "Responsive Design", "Agentic AI frameworks", "Full-stack development"], 5),
    ("VNACCS", ["ECUS/VNACCS", "Workato", "trucking arrangement", "Kiểm toán", "Securities"], 1),
    ("ESL teaching", ["Teaching ESL", "Luyện thi TOEIC", "phương pháp giảng dạy", "Corporate Training", "Kiểm toán"], 1),
    ("construction domain", ["lĩnh vực xây dựng", "injection molding", "Điện nhẹ", "trucking arrangement", "Securities"], 1),
    ("Kubernetes", ["Protobuf", "RabbitMQ", "PWA", "ThreeJS", "coroutines"], 0),
    ("thuế thu nhập cá nhân", ["Kiểm toán", "Securities", "Misa amis", "Presale", "Australian public practice"], 0),
    ("máy ép nhựa", ["injection molding", "Điện nhẹ", "trucking arrangement", "Workato", "PWA"], 1),
    ("React Native", ["ThreeJS", "PWA", "Responsive Design", "coroutines", "Protobuf"], 0),
]


def ask(term, candidates, model):
    criteria = {"0": "không ứng viên nào cùng nghĩa với thuật ngữ"}
    for at, name in enumerate(candidates, start=1):
        criteria[str(at)] = name
    questions = {
        "match": {
            "type": "choice",
            "instructions": f'Thuật ngữ "{term}" trùng nghĩa với ứng viên nào?',
            "criteria": criteria,
        }
    }
    body = json.dumps(
        {"state": f"Thuật ngữ cần phân loại: {term}", "questions": questions, "model": model},
        ensure_ascii=False,
    ).encode()
    request = urllib.request.Request(f"{URL}/predict", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode())["result"]["answers"]["match"]


def run(model):
    print(f"\n########## checkpoint = {model}")
    right = 0
    started = time.perf_counter()
    for term, candidates, expected in CASES:
        answer = ask(term, candidates, model)
        picked = answer["choice"]
        ok = str(picked) == str(expected)
        right += ok
        want = candidates[expected - 1] if expected else "(không trùng)"
        got = candidates[int(picked) - 1] if str(picked).isdigit() and int(picked) else "(không trùng)"
        mark = "OK " if ok else "SAI"
        print(f"  {mark} {term:24s} dung={want:24s} chon={got:24s} conf={answer['confidence']:.2f}")
    elapsed = (time.perf_counter() - started) * 1000
    print(f"  => {right}/{len(CASES)} dung   ({elapsed/len(CASES):.0f}ms moi cau)")


if __name__ == "__main__":
    for model in ("multilingual", "english"):
        try:
            run(model)
        except Exception as error:
            print(f"  LOI voi {model}: {type(error).__name__}: {error}")
