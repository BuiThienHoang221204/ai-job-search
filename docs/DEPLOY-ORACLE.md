# Deploy lên Oracle Cloud Always Free

Runbook dựng toàn bộ `ai-job-search` (app + postgres/pgvector + latex + pdf) trên
một máy ảo ARM miễn phí vĩnh viễn của Oracle.

Mục tiêu: `VM.Standard.A1.Flex` 4 OCPU / 24GB RAM, đủ chỗ cho TeX Live 3,3GB và
Chromium 1,2GB — hai thứ không nền tảng PaaS free nào chứa nổi.

## Trạng thái tính tới 2026-09-09

| Việc | Tình hình |
|---|---|
| Tài khoản Oracle | xong, tenancy `buithienhoang9a3`, home region Singapore (không đổi được) |
| VCN `careelot-vcn` | xong, có Internet Gateway, public subnet |
| Máy A1 ARM (đích cuối) | **chưa lấy được** — hết capacity, đang chạy vòng lặp thử lại ở Cloud Shell |
| Máy AMD `E5.Flex` 2/16 | đang chạy, dùng credit trial, **bị thu hồi khi hết 30 ngày** |
| SSH | vào được bằng `oracle.key`, user `ubuntu` |
| Deploy (PHẦN 2) | chưa bắt đầu |

---

## PHẦN 0 — Bốn thứ phải sửa TRƯỚC khi deploy

Đây không phải khuyến nghị, đây là bốn lỗi sẽ xảy ra nếu bê nguyên repo lên máy chủ.

### 0.1 `.env.production` thiếu `LATEX_SERVICE_URL` và `PDF_SERVICE_URL`

Thiếu hai biến này thì `documents.module.ts` rơi về `SandboxLatexCompiler`, tức
gọi `docker run` từ bên trong container — mà container không có docker socket.
**Build vẫn xanh, app vẫn khởi động, chỉ chết lúc người dùng bấm xuất CV.**

Thêm vào `.env`:

```
LATEX_SERVICE_URL=http://latex:8080
PDF_SERVICE_URL=http://pdf:8080
```

### 0.2 `latex` và `pdf` trong compose không có `build:`

Hai service này chỉ khai `image: aijob-latex` / `aijob-pdf`. Chạy `docker compose up`
mà chưa build thì báo image not found. Phải build thủ công trước (bước 2.3).

### 0.3 CI chỉ build image amd64

`.github/workflows/ci.yml` đẩy lên ghcr không khai `platforms`, nên image ở đó là
amd64 — **kéo về máy ARM sẽ không chạy**. Trên Oracle phải build tại chỗ. Đã kiểm
manifest, mọi base image đều có arm64 nên build native chạy được:

| Image | arm64 |
|---|---|
| `node:22-slim` | có |
| `oven/bun:1` | có |
| `pgvector/pgvector:pg17` | có |
| `texlive/texlive:latest-medium` | có |
| `debian:bookworm-slim` | có |
| `diegosouzapw/omniroute:3.8.49` | có |

Rủi ro còn lại duy nhất: `onnxruntime-node` (do `@huggingface/transformers` kéo
theo) trên arm64. Nó được `import()` lười trong `local.embedder.ts` nên app vẫn
khởi động bình thường nếu hỏng — chỉ tính năng tìm kiếm ngữ nghĩa chết lúc gọi.

### 0.4 Cookie `sameSite: 'lax'` — UI và API phải cùng domain gốc

`auth.cookie.ts` đặt `sameSite: 'lax'`. Nếu UI ở `careelot.vercel.app` còn API ở
`api.careelot.com` thì đó là hai site khác nhau, **trình duyệt vứt cookie đăng
nhập mà không báo lỗi gì**. Thêm nữa `NEXT_PUBLIC_API_URL` là biến chạy trong
trình duyệt, nên API bắt buộc phải có HTTPS thật, không dùng được `http://<IP>`.

Cách làm đúng — cùng một domain gốc:

| Thành phần | Địa chỉ |
|---|---|
| UI (Vercel) | `app.careelot.com` |
| API (Oracle) | `api.careelot.com` |
| `.env` | `COOKIE_DOMAIN=.careelot.com` |
| `.env` | `CORS_ORIGIN=https://app.careelot.com` |
| UI env | `NEXT_PUBLIC_API_URL=https://api.careelot.com/api` |

Domain lấy miễn phí 1 năm từ Namecheap trong GitHub Student Pack.

---

## PHẦN 1 — Các bước trên Oracle Cloud

### 1.1 Tạo tài khoản

1. Vào [cloud.oracle.com](https://cloud.oracle.com) → *Start for free*
2. Cần thẻ tín dụng/ghi nợ để xác minh — bị trừ ~1 USD rồi hoàn lại, tài khoản
   Always Free không tự chuyển sang trả phí khi hết 30 ngày dùng thử
3. **Chọn Home Region cẩn thận: không đổi được về sau.** Chọn Singapore
   (`ap-singapore-1`) hoặc Osaka cho độ trễ tới Việt Nam

### 1.2 Tạo VCN TRƯỚC khi tạo máy

Làm ngược thứ tự này là mất thời gian: wizard tạo instance có mục *Create new
public subnet*, nhưng nút **Automatically assign public IPv4 address** kẹt ở cảnh
báo "You must select a public subnet" và không gạt lên được, vì phần kiểm tra của
giao diện đọc subnet đã tồn tại chứ không đọc subnet sắp tạo.

Networking → Virtual cloud networks → **Actions** → **Start VCN Wizard** →
**Create VCN with Internet Connectivity** → tên `careelot-vcn` → mọi CIDR để mặc
định → Create.

Cách này còn dựng sẵn Internet Gateway và bảng định tuyến. Nút **Create VCN** trơn
tạo ra VCN không có gateway — máy chạy được nhưng `docker pull` không tải nổi gì.

### 1.3 Tạo máy ảo ARM

Compute → Instances → *Create instance*:

| Mục | Giá trị |
|---|---|
| Image | Ubuntu 24.04 (**Arm-based**, không phải x86) |
| Shape | `VM.Standard.A1.Flex` |
| OCPU / RAM | 4 OCPU, 24GB (trọn hạn mức free) |
| Boot volume | **100GB** — mặc định 47GB không đủ cho 3,3GB TeX + 1,2GB Chromium + cache build |
| SSH key | tải file `.key` về và giữ kỹ, mất là mất máy |

### 1.4 Khi báo "Out of capacity" — đã gặp thật ngày 2026-09-09

Singapore chỉ có **một** availability domain, nên gợi ý "thử AD khác" của Oracle
không dùng được. Và **hạ cấu hình không giúp gì**: đã thử 4/24 rồi 2/12, cùng một
lỗi. Oracle cấp chỗ theo host vật lý và tài khoản free xếp sau cùng trong hàng
đợi, nên xin 1 OCPU hay 4 OCPU đều đụng cùng bức tường.

**Cách lấy được máy: để vòng lặp tự thử.** Mở Cloud Shell (biểu tượng `>_` trên
thanh trên cùng, miễn phí):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/oracle -N ""
AD=$(oci iam availability-domain list --query 'data[0].name' --raw-output)
SUBNET=$(oci network subnet list -c $OCI_TENANCY --query "data[?contains(\"display-name\",'ublic')].id | [0]" --raw-output)
IMAGE=$(oci compute image list -c $OCI_TENANCY --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape VM.Standard.A1.Flex --query 'data[0].id' --raw-output)
echo "AD=$AD"; echo "SUBNET=$SUBNET"; echo "IMAGE=$IMAGE"
```

Ba dòng `echo` phải in ra giá trị thật; rỗng hoặc `null` thì dừng lại kiểm tra.

```bash
until oci compute instance launch -c $OCI_TENANCY --availability-domain "$AD" \
  --shape VM.Standard.A1.Flex --shape-config '{"ocpus":4,"memoryInGBs":24}' \
  --image-id $IMAGE --subnet-id $SUBNET --display-name careelot-server \
  --assign-public-ip true --boot-volume-size-in-gbs 100 \
  --ssh-authorized-keys-file ~/.ssh/oracle.pub --wait-for-state RUNNING; do
  echo "$(date '+%H:%M:%S') het cho, thu lai sau 60s"; sleep 60
done
```

Đóng tab là vòng lặp chết. Thường mất vài giờ tới vài ngày. Khi thành công, tải
private key về máy: Cloud Shell → **Actions → Download** → `.ssh/oracle`.

**Đường vòng để không bị chặn tiến độ:** dựng một máy **AMD** bằng credit trial
($300 trong 30 ngày) — `VM.Standard.E5.Flex`, 2 OCPU / 16 GB, boot volume 100 GB.
Máy AMD luôn có chỗ. Mọi bước từ PHẦN 2 trở đi giống hệt, thậm chí dễ hơn vì x86
kéo được image amd64 từ ghcr thay vì phải build tại chỗ. Hết 30 ngày máy này bị
thu hồi, nên coi nó là nơi chạy thử quy trình, còn nhà ở lâu dài vẫn là A1.

Đừng dùng shape AMD `E2.1.Micro` (loại Always Free): 1GB RAM không chạy nổi
Chromium.

### 1.5 Mở firewall — phải mở ở HAI nơi

Đây là nguyên nhân số một của "đã mở port rồi mà vẫn không vào được".

**Nơi thứ nhất — Security List của Oracle:** Networking → VCN → Subnet →
Security List → *Add Ingress Rules*:

| Source | Protocol | Port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |

**Nơi thứ hai — iptables bên trong máy.** Image Ubuntu của Oracle chặn sẵn mọi
cổng trừ 22:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Không mở cổng 3000 ra ngoài — Caddy sẽ đứng trước nó.

### 1.6 Truy cập máy chủ từ Windows

User của image Ubuntu là **`ubuntu`** (không phải `root`; `opc` là của Oracle Linux).

```cmd
ssh -i "C:\Users\NITRO 5\.ssh\oracle.key" ubuntu@<IP-MÁY>
```

**Ba cái bẫy trên Windows, đã dính đủ cả ba:**

1. **File tải từ wizard là một THƯ MỤC**, không phải file key. Bên trong mới có
   `ssh-key-....key` và `.pub`. Đưa thẳng thư mục cho `ssh -i` thì báo
   `Operation not supported on socket` — thông báo không liên quan gì tới nguyên nhân.

2. **`icacls` phải chạy trên FILE key, không phải thư mục chứa nó.** Siết nhầm
   thư mục thành chỉ-đọc thì `move` file ra ngoài bị `Access is denied`. Gỡ bằng:
   `icacls "<thư-mục>" /grant "%USERNAME%:(OI)(CI)F"`

3. **Cú pháp PowerShell không chạy trong cmd.** `$($env:USERNAME)` chỉ đúng ở
   PowerShell; trong cmd phải viết `%USERNAME%`. Chạy nhầm thì `icacls` trượt
   trong im lặng và `ssh` vẫn báo `UNPROTECTED PRIVATE KEY FILE`.

Trình tự đúng, chạy trong **cmd**:

```cmd
move "<thư-mục-tải-về>\ssh-key-XXXX.key" "C:\Users\NITRO 5\.ssh\oracle.key"
icacls "C:\Users\NITRO 5\.ssh\oracle.key" /inheritance:r
icacls "C:\Users\NITRO 5\.ssh\oracle.key" /grant:r "%USERNAME%:R"
icacls "C:\Users\NITRO 5\.ssh\oracle.key"
```

Dòng cuối phải in ra đúng một dòng quyền, chỉ tài khoản của bạn với `(R)`.

**Rút gọn thành `ssh careelot`** — tạo `C:\Users\NITRO 5\.ssh\config`:

```
Host careelot
    HostName <IP-MÁY>
    User ubuntu
    IdentityFile "C:\Users\NITRO 5\.ssh\oracle.key"
    ServerAliveInterval 60
```

`ServerAliveInterval` để phiên không rớt khi ngồi đọc log lâu. Sau đó VS Code cũng
vào được bằng extension **Remote - SSH** (F1 → *Connect to Host* → `careelot`),
nó đọc chính file config này.

**Về địa chỉ IP:** ephemeral public IP giữ nguyên qua reboot và qua stop/start,
chỉ mất khi terminate máy. Trước khi trỏ DNS `api.careelot.com` vào thì đổi sang
**Reserved public IP** (Instance → Attached VNICs → VNIC → IPv4 Addresses → Edit)
— vẫn miễn phí và IP thuộc về bạn kể cả khi xoá máy.

**Mất private key là mất máy vĩnh viễn**, không có đường khôi phục. Sao lưu ra
ngoài ổ C ngay sau khi tải về.

### 1.7 Cài Docker

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Đăng xuất rồi vào lại để nhóm `docker` có hiệu lực. Kiểm: `docker run hello-world`.

### 1.8 Đặt múi giờ

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
```

`CRON_TIMEZONE=Asia/Ho_Chi_Minh` trong `.env` đã lo phần lịch quét, nhưng đặt luôn
cho máy để log đọc đúng giờ.

---

## PHẦN 2 — Deploy ai-job-search

### 2.1 Lấy code

```bash
git clone https://github.com/<user>/ai-job-search.git
cd ai-job-search
```

Repo private thì tạo Personal Access Token (scope `repo`) và dùng
`https://<token>@github.com/...`, hoặc thêm deploy key.

### 2.2 Tạo file `.env`

Compose cần **một** file tên đúng `.env` trong `server/`: các service đọc nó qua
`env_file`, còn `${POSTGRES_PASSWORD}` và `${OMNIROUTE_*}` được nội suy từ đó.

```bash
cd server
cp .env.production .env
nano .env
```

Sửa những dòng sau:

```
POSTGRES_PASSWORD=<mật khẩu mạnh mới>
DATABASE_URL=postgresql://aijob:<mật khẩu vừa đặt>@postgres:5432/aijob?connection_limit=20
JWT_SECRET=<sinh mới: openssl rand -base64 48>
CORS_ORIGIN=https://app.careelot.com
COOKIE_DOMAIN=.careelot.com
LATEX_SERVICE_URL=http://latex:8080
PDF_SERVICE_URL=http://pdf:8080
OMNIROUTE_JWT_SECRET=<openssl rand -base64 32>
OMNIROUTE_KEY_SECRET=<openssl rand -base64 32>
OMNIROUTE_PASSWORD=<mật khẩu đăng nhập omniroute>
```

`JWT_SECRET` trong `.env.production` đang là giá trị đã nằm trong repo — coi như
đã lộ, phải sinh mới.

Không dùng omniroute (hiện `MODEL_PROVIDER=opencode` gọi thẳng gateway ngoài) thì
comment cả service đó trong `docker-compose.yml` cho nhẹ máy.

### 2.3 Build ba image

```bash
docker build -t aijob-latex -f ../latex-service/Dockerfile ../latex-service
docker build -t aijob-pdf -f ../pdf-service/Dockerfile ../pdf-service
docker compose build app
```

Lần đầu mất 20–40 phút, phần lớn là TeX Live. `docker compose build app` dùng
context là gốc repo (`..`) vì image cần cả `.claude/skills`, `.agents/skills`,
`cv/` và `cover_letters/`.

Bước tự kiểm trong `pdf-service/Dockerfile` sẽ làm build đỏ nếu thiếu font tiếng
Việt — đó là chủ ý, đừng bỏ qua bằng `--no-cache` hay sửa Dockerfile.

### 2.4 Chạy database rồi migrate

```bash
docker compose up -d postgres
docker compose --profile migrate run --rm migrate
```

Dùng `migrate deploy` (đúng thứ service `migrate` gọi). **Không bao giờ chạy
`prisma migrate dev` trên máy chủ** — nó có thể xoá index HNSW của pgvector.

### 2.5 Khởi động toàn bộ

```bash
docker compose up -d
docker compose ps
docker compose logs -f app
```

Log lúc khởi động phải thấy ba dòng xác nhận:

- `Tạo PDF qua dịch vụ HTTP: http://latex:8080`
- `In PDF qua dịch vụ HTTP: http://pdf:8080`
- danh sách portal được đăng ký (itviec, linkedin, topcv, vietnamworks)

Thấy `Tạo PDF bằng docker run` nghĩa là mục 0.1 chưa làm.

### 2.6 Seed dữ liệu demo (tuỳ chọn)

```bash
docker compose exec app node scripts/seed-demo.mjs
```

Tạo 10 tài khoản đa ngành, mật khẩu chung `Demo@12345`. **Đổi mật khẩu
`admin@aijob.local` ngay nếu máy chủ mở ra Internet.**

---

## PHẦN 3 — HTTPS bằng Caddy

Không có bước này thì trình duyệt chặn UI (HTTPS) gọi API (HTTP) — lỗi mixed
content, không phải lỗi CORS, và console báo rất khó hiểu.

Trỏ bản ghi DNS `api.careelot.com` → IP máy ảo, rồi:

```bash
sudo mkdir -p /etc/caddy && sudo nano /etc/caddy/Caddyfile
```

```
api.careelot.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
docker run -d --name caddy --restart unless-stopped --network host \
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data -v caddy_config:/config \
  caddy:2
```

Caddy tự xin chứng chỉ Let's Encrypt. Sửa lại cổng của app trong compose thành
`127.0.0.1:3000:3000` để không ai vào thẳng được cổng 3000.

Kiểm: `curl https://api.careelot.com/api/health`

---

## PHẦN 4 — Vận hành

### Sao lưu database

Volume `postgres_data_pgvector` là toàn bộ dữ liệu. Đặt cron hằng ngày:

```bash
docker compose exec -T postgres pg_dump -U aijob aijob | gzip > ~/backup/aijob-$(date +%F).sql.gz
```

**Đừng đổi tên volume trong `docker-compose.yml`** — đổi tên là compose tạo volume
mới rỗng và database cũ biến mất khỏi tầm nhìn.

### Cập nhật code

```bash
git pull
docker compose build app
docker compose --profile migrate run --rm migrate
docker compose up -d app
```

Chỉ build lại `aijob-latex` / `aijob-pdf` khi `latex-service/` hoặc `pdf-service/`
đổi — chúng gần như không bao giờ đổi.

### Theo dõi

```bash
docker compose logs -f app
docker stats
curl -s https://api.careelot.com/api/health
```

`GET /api/admin/ai-health` (cần token ADMIN) cho tỷ lệ hỏng và p50/p95 của các lời
gọi model — đây là chỗ đọc để biết gateway free có trụ được không.

### Chạy quét thủ công

```bash
curl -X POST https://api.careelot.com/api/admin/scrape/run-now -b cookie.txt
```

---

## PHẦN 5 — Điều chưa đo được

**IP của Oracle Singapore chưa chắc quét được portal Việt Nam.** TopCV đứng sau
Cloudflare; ở máy dev tại Việt Nam thì `curl` qua được, nhưng từ IP datacenter
Singapore thì chưa ai thử. Đây là phép đo cần làm ngay sau khi máy chủ chạy được:

```bash
docker compose exec app curl -sI -o /dev/null -w "%{http_code}\n" \
  https://www.topcv.vn/tim-viec-lam-it
```

- `200` → quét bình thường
- `403` → Cloudflare chặn IP datacenter, phải tính tới proxy dân cư hoặc chuyển
  riêng phần quét về chạy ở máy trong nước

Kết quả phép đo này quyết định kiến trúc phần thu thập dữ liệu, nên làm sớm.
