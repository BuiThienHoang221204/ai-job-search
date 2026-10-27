"""Chạy: python docs/business-flows/_gen.py --write

Gom BR, rủi ro, endpoint từ docs/business-flows/modules/*.md và thay vào các marker [//]: # (GEN:X) ... [//]: # (/GEN:X) của file hệ thống."""
import re, sys, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parent
MOD = ROOT / "modules"

ORDER = ["auth", "profile", "cv-import", "jobs", "job-scraping", "matching", "applications",
         "documents", "interview-prep", "question-bank", "mock-interview", "upskill",
         "company-research", "salary", "market", "referrals", "dashboard", "admin-console", "ai-platform", "platform-operations"]


def section(text, num):
    m = re.search(rf"^## {num}\..*?$(.*?)(?=^## {num + 1}\.|\Z)", text, re.S | re.M)
    return m.group(1) if m else ""


def cells(line):
    parts = re.split(r"(?<!\\)\|", line.strip())
    return [p.strip() for p in parts[1:-1]]


def title_of(text):
    return text.splitlines()[0].lstrip("# ").strip()


def collect():
    brs, risks, apis = [], [], []
    for name in ORDER:
        path = MOD / f"{name}.md"
        if not path.exists():
            print("THIẾU", path, file=sys.stderr)
            continue
        text = path.read_text(encoding="utf-8")
        for line in section(text, 7).splitlines():
            if re.match(r"^\|\s*\**BR-[A-Z]+-\d+", line):
                c = cells(line)
                code = re.sub(r"[*`]", "", c[0])
                brs.append((name, code, c[1], c[2] if len(c) > 2 else "", c[3] if len(c) > 3 else ""))
        sec17 = section(text, 17)
        cur = None
        for line in sec17.splitlines():
            m = re.match(r"^(?:#{3,4}\s+|\*\*)(R\d+[a-z]?)\s*[—–-]\s*(.+)$", line)
            if m:
                if cur:
                    risks.append(cur)
                t = re.split(r"\*\*", m.group(2))[0].strip().rstrip(".")
                cur = [name, m.group(1), t, ""]
            if cur and not cur[3]:
                s = re.search(r"Mức đề xuất:?\**:?\s*(🔴|🟠|🟡|🟢)", line)
                if s:
                    cur[3] = s.group(1)
                elif "✅" in line and "Đã sửa" in line:
                    cur[3] = "✅"
        if cur:
            risks.append(cur)
        sec9 = section(text, 9)
        main = re.split(r"\n\*\*Endpoint ở module khác|\n#+ .*module khác", sec9)[0]
        for line in main.splitlines():
            if re.match(r"^\|\s*`?(GET|POST|PUT|PATCH|DELETE)\b", line):
                c = cells(line)
                apis.append((name, c))
    return brs, risks, apis


def relink(cell):
    """Link trong ô chép từ modules/x.md sang file cấp hệ thống: lùi một cấp thư mục."""
    def fix(m):
        t = m.group(2)
        if re.match(r"^(https?:|mailto:|#)", t):
            return m.group(0)
        if t.startswith("../"):
            t = t[3:]
        elif t.startswith("./"):
            t = "./modules/" + t[2:]
        else:
            t = "./modules/" + t
        return f"]({m.group(1)}{t}"
    return re.sub(r"\]\((<?)([^)>\s]+)", fix, cell)


def render_br(brs):
    out = []
    by = collections.OrderedDict()
    for row in brs:
        by.setdefault(row[0], []).append(row)
    for name, rows in by.items():
        text = (MOD / f"{name}.md").read_text(encoding="utf-8")
        out.append(f"\n### {title_of(text)} — [modules/{name}.md](./modules/{name}.md#7-business-rules)\n")
        out.append("| Mã | Quy tắc | Nơi thực thi | Mức |\n|---|---|---|---|")
        for _, code, rule, where, level in rows:
            out.append(f"| {code} | {relink(rule)} | {where} | {level} |")
    return "\n".join(out) + "\n"


SEV = [("🔴", "Khẩn cấp"), ("🟠", "Cao"), ("🟡", "Trung bình"), ("🟢", "Thấp")]


def render_risks(risks):
    out = []
    for emo, label in SEV:
        rows = [r for r in risks if r[3] == emo]
        out.append(f"\n### {emo} {label} ({len(rows)})\n")
        if not rows:
            out.append("Không có rủi ro nào được xếp mức này.\n")
            continue
        out.append("| Mã | Module | Rủi ro |\n|---|---|---|")
        for name, rid, t, _ in rows:
            out.append(f"| [{name}#{rid}](./modules/{name}.md) | {name} | {relink(t)} |")
    fixed = [r for r in risks if r[3] == "✅"]
    out.append(f"\n### ✅ Đã sửa ({len(fixed)})\n")
    if fixed:
        out.append("| Mã | Module | Rủi ro |\n|---|---|---|")
        for name, rid, t, _ in fixed:
            out.append(f"| [{name}#{rid}](./modules/{name}.md) | {name} | {relink(t)} |")
    else:
        out.append("Chưa có rủi ro nào được sửa.\n")
    missing = [r for r in risks if r[3] not in {e for e, _ in SEV} | {"✅"}]
    if missing:
        out.append("\n### Chưa xếp mức\n")
        for name, rid, t, sev in missing:
            out.append(f"- {name}#{rid} — {t} ({sev or 'không thấy mức'})")
    return "\n".join(out) + "\n"


def render_api(apis):
    out = ["| # | Method | URL | Role | Mục đích nghiệp vụ | Controller#method | Module |", "|---|---|---|---|---|---|---|"]
    for i, (name, c) in enumerate(apis, 1):
        method, url, role, purpose, ctrl = (c + [""] * 5)[:5]
        out.append(f"| {i} | {method} | {url} | {role} | {relink(purpose)} | {relink(ctrl)} | [{name}](./modules/{name}.md#9-api-mapping) |")
    return "\n".join(out) + "\n"


def replace(path, key, body):
    text = path.read_text(encoding="utf-8")
    pat = re.compile(rf"(\[//\]: # \(GEN:{key}\))(.*?)(\[//\]: # \(/GEN:{key}\))", re.S)
    if not pat.search(text):
        print("không thấy marker", key, "trong", path.name, file=sys.stderr)
        return
    text = pat.sub(lambda m: m.group(1) + "\n\n" + body + "\n" + m.group(3), text)
    path.write_text(text, encoding="utf-8", newline="\n")


def norm_url(u):
    u = re.sub(r"\*\(.*?\)\*", "", u)
    u = u.replace("`", "").strip()
    return u.split("?")[0].strip()


OWN = {
    "GET /api/auth/me": "token → chính mình",
    "GET /api/profile": "`userId` từ token (upsert)",
    "PUT /api/profile": "`userId` từ token",
    "POST /api/profile/skills": "`userId` từ token",
    "POST /api/profile/quick-start": "`userId` từ token",
    "POST /api/profile-drafts/cv/upload-url": "khoá tạm `cv-tmp/<userId>/…`",
    "POST /api/profile-drafts/cv": "`key` phải bắt đầu bằng `cv-tmp/<userId>/` → 404; tạo gắn `userId`",
    "GET /api/profile-drafts/latest": "`where userId`",
    "GET /api/profile-drafts/:id/file": "`findFirst {id, userId}` → 404",
    "GET /api/profile-drafts/:id": "`findFirst {id, userId}` → 404",
    "POST /api/profile-drafts/:id/synthesize-stream": "`updateMany {id, userId, status}`",
    "POST /api/profile-drafts/:id/retry": "`findFirst` + `updateMany {id, userId, FAILED}`",
    "PUT /api/profile-drafts/:id/apply": "`{id, userId}` khi đọc và ghi",
    "GET /api/jobs": "quan hệ (lưu/điểm/đơn) lọc theo `userId`",
    "GET /api/jobs/:id": "lưu/điểm/đơn lọc theo `userId`",
    "POST /api/jobs/:id/save": "khoá `userId_jobId`",
    "DELETE /api/jobs/:id/save": "`deleteMany {userId, jobId}`",
    "GET /api/matches": "`where userId`",
    "GET /api/matches/:jobId": "khoá `userId_jobId`",
    "POST /api/matches/evaluate": "`userId` từ token",
    "POST /api/matches/evaluate-stream/:jobId": "`userId` truyền xuống service",
    "GET /api/applications": "`where userId`",
    "GET /api/applications/jobs": "`where userId`",
    "POST /api/applications": "tạo gắn `userId`; đọc `JobMatch(userId, jobId)`",
    "PUT /api/applications/:id/status": "`findFirst` + `updateMany {id, userId, status}`",
    "PUT /api/applications/:id/interview-date": "`updateMany {id, userId}`",
    "GET /api/documents": "`where userId`",
    "GET /api/documents/:id": "`findFirst {id, userId}` → 404",
    "GET /api/documents/:id/source": "`findFirst {id, userId}` → 404",
    "PUT /api/documents/:id/template": "`update {id, userId}`",
    "POST /api/documents/:id/preview": "`findFirst {id, userId}`",
    "PUT /api/documents/:id/cv": "`update {id, userId}`",
    "POST /api/documents/:id/rewrite-bullet": "`findFirst {id, userId, kind: CV}`",
    "GET /api/documents/:id/pdf": "`findFirst {id, userId}`",
    "POST /api/documents/:id/generate-stream": "claim theo `userId` (404 qua sự kiện error)",
    "POST /api/documents/cv": "tạo gắn `userId`",
    "POST /api/documents/cover-letter": "tạo gắn `userId`",
    "POST /api/documents/application-email": "tạo gắn `userId`",
    "GET /api/interview": "`where userId`",
    "GET /api/interview/:jobId": "khoá `userId_jobId`",
    "POST /api/interview/prep": "khoá `userId_jobId`",
    "PUT /api/interview/:jobId/answers/:kind/:index": "khoá `userId_jobId(_questionKey)`",
    "POST /api/interview/:jobId/answers/:kind/:index/feedback": "khoá `userId_jobId(_questionKey)`",
    "GET /api/mock-interviews": "`where userId`",
    "GET /api/mock-interviews/:id": "`findFirst {id, userId}`",
    "POST /api/mock-interviews": "bối cảnh khoá `userId`",
    "POST /api/mock-interviews/:id/turn": "`{id, userId}` + claim kèm `userId`",
    "POST /api/mock-interviews/:id/finish": "`{id, userId}` + claim kèm `userId`",
    "POST /api/mock-interviews/voice": "bối cảnh và hạn mức khoá `userId`",
    "POST /api/mock-interviews/:id/voice-turns": "`{id, userId}` + claim kèm `userId`",
    "GET /api/upskill": "`where userId`",
    "PATCH /api/learning": "`update where id = userId`",
    "POST /api/push/subscriptions": "upsert theo `endpoint`, gắn `userId` người gọi",
    "DELETE /api/push/subscriptions": "`deleteMany {userId, endpoint}`",
    "POST /api/push/test": "`findFirst {userId, endpoint}`",
    "GET /api/push/preferences": "`findUnique {id: userId}`",
    "GET /api/companies/follows": "`where userId`",
    "GET /api/referrals": "đếm `where referredById = userId`",
    "POST /api/companies/follows": "tạo gắn `userId` người gọi",
    "DELETE /api/companies/follows/:id": "`deleteMany {id, userId}`",
    "PATCH /api/push/preferences": "`update {id: userId}`",
    "GET /api/upskill/in-flight": "`where userId`",
    "GET /api/upskill/:id": "`findFirst {id, userId}`",
    "POST /api/upskill/generate": "tạo gắn `userId`; đọc `JobMatch(userId, jobId)`",
    "POST /api/upskill/generate-stream": "như trên",
    "GET /api/learning": "`userId`",
    "PUT /api/learning/:key": "upsert `(userId, skillKey)`",
    "DELETE /api/learning/:key": "`deleteMany {userId, skillKey}`",
    "GET /api/dashboard": "mọi truy vấn lọc `userId`",
    "GET /api/dashboard/skill-gaps": "`userId`",
}


THR = {
    "POST /api/auth/register": "ThrottleAuth 10/phút",
    "POST /api/auth/login": "ThrottleAuth 10/phút",
    "POST /api/auth/google": "ThrottleAuth 10/phút",
    "POST /api/auth/refresh": "ThrottleAuth 10/phút",
    "POST /api/profile-drafts/cv/upload-url": "ThrottleAi 10/phút",
    "POST /api/profile-drafts/cv": "ThrottleAi 10/phút",
    "POST /api/profile-drafts/:id/synthesize-stream": "ThrottleAi 10/phút",
    "POST /api/profile-drafts/:id/retry": "ThrottleAi 10/phút",
    "POST /api/matches/evaluate": "ThrottleAi 10/phút",
    "POST /api/matches/evaluate-stream/:jobId": "ThrottleAi 10/phút",
    "POST /api/matches/requirements/:jobId": "ThrottleAi 10/phút",
}


def render_perm(apis):
    out = ["| # | Method | URL | Vai trò tối thiểu | Throttle riêng | Kiểm sở hữu | Module |", "|---|---|---|---|---|---|---|"]
    for i, (name, c) in enumerate(apis, 1):
        method, url, role = (c + [""] * 3)[:3]
        u = norm_url(url)
        r = re.sub(r"\(.*?\)", "", role).replace("`", "").strip()
        r = "USER" if r == "USER/ADMIN" else r
        thr = re.search(r"\((.*?)\)", role)
        thr = thr.group(1).replace("`", "") if thr and re.search(r"\d|Throttle|Skip", thr.group(1)) else "—"
        thr = THR.get(f"{method} {u}", thr)
        if "Public" in r:
            own = "không áp dụng (dữ liệu chung)"
        elif "ADMIN" == r:
            own = "không áp dụng (admin xem toàn hệ thống)"
        else:
            own = OWN.get(f"{method} {u}", "không áp dụng (dữ liệu chung)")
        out.append(f"| {i} | {method} | `{u}` | {r} | {thr} | {own} | [{name}](./modules/{name}.md#9-api-mapping) |")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    brs, risks, apis = collect()
    codes = collections.Counter(b[1] for b in brs)
    dup = [c for c, n in codes.items() if n > 1]
    print(f"BR: {len(brs)} (trùng: {dup}) | Rủi ro: {len(risks)} | Endpoint: {len(apis)}")
    print("Theo mức:", collections.Counter(r[3] for r in risks))
    if "--write" in sys.argv:
        replace(ROOT / "10-business-rules.md", "BR", render_br(brs))
        replace(ROOT / "10-business-rules.md", "RISKS", render_risks(risks))
        replace(ROOT / "06-api-overview.md", "API", render_api(apis))
        replace(ROOT / "04-permission.md", "PERM", render_perm(apis))
    if "--dump-api" in sys.argv:
        for name, c in apis:
            print(name, "|", " | ".join(c[:3]))

