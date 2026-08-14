/**
 * Script chạy TRONG sandbox. Đi vào `/work/apply.mjs` mỗi lượt chạy.
 *
 * Vì sao là một chuỗi trong TypeScript chứ không phải file `.mjs` riêng: `nest build`
 * chỉ dịch `.ts` sang `dist/`, nên một file `.mjs` cạnh source sẽ VẮNG trong bản
 * build production — đúng loại lỗi chỉ lộ ra sau khi deploy. Khai `assets` trong
 * `nest-cli.json` thì lại phải giải đường dẫn khác nhau giữa `src` và `dist`.
 *
 * Đánh đổi đã biết: chuỗi này không được eslint/tsc kiểm. Bù lại bằng cách giữ nó
 * MÁY MÓC — mọi quyết định (điền gì, kết luận gì) nằm ở `field-plan.ts`, nơi có test
 * đơn vị. Script chỉ dò chuỗi và gán giá trị.
 *
 * Nó nhận `/work/input.json` và ghi `/work/report.json` + `/work/screenshot.png`.
 * Không nhận tham số dòng lệnh: URL của tin tuyển dụng là dữ liệu không tin cậy, và
 * một chuỗi đi qua argv là một chuỗi đi qua chỗ dễ nhầm.
 */
export const APPLY_SCRIPT = String.raw`
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";

const input = JSON.parse(await readFile("/work/input.json", "utf8"));

const report = {
  reachable: false,
  status: null,
  visibleInputs: 0,
  hasFileInput: false,
  loginHints: [],
  filled: [],
  unmatched: [],
  error: null,
};

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    // Locale Việt: nhiều trang đổi nhãn theo Accept-Language, và ta muốn thấy đúng
    // trang mà người dùng sẽ thấy.
    locale: "vi-VN",
  });

  const response = await page.goto(input.url, {
    waitUntil: "domcontentloaded",
    timeout: input.navigationTimeoutMs,
  });
  report.status = response ? response.status() : null;
  report.reachable = true;

  // Chờ theo nhịp mạng lặng thay vì một mốc thời gian cố định: form ứng tuyển của
  // Greenhouse/Lever nạp bằng JS sau khi DOM đã sẵn sàng.
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  // Dẹp banner cookie nếu có: nó che nút và che cả form.
  for (const nhan of input.cookieButtons) {
    const btn = page.getByRole("button", { name: new RegExp(nhan, "i") }).first();
    if (await btn.count()) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      break;
    }
  }

  report.loginHints = await page.evaluate((markers) => {
    const text = (document.body.innerText || "").toLowerCase();
    return markers.filter((m) => text.includes(m.toLowerCase()));
  }, input.loginMarkers);

  // Kiểm kê ô nhập ĐANG HIỆN. Ô ẩn bị bỏ: form đăng nhập ẩn, honeypot chống bot, và
  // widget của trang khác đều nằm trong DOM mà không nằm trên màn hình.
  const fields = await page.evaluate(() => {
    const hien = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
      );
    };

    const nhanCua = (el) => {
      if (el.id) {
        const l = document.querySelector('label[for="' + el.id + '"]');
        if (l && l.textContent) return l.textContent.trim();
      }
      const boc = el.closest("label");
      if (boc && boc.textContent) return boc.textContent.trim();


      return (
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        el.getAttribute("id") ||
        ""
      );
    };

    const out = [];
    const all = document.querySelectorAll("input, textarea");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "checkbox", "radio"].includes(type)) {
        continue;
      }
      // Ô file bị ẩn là chuyện BÌNH THƯỜNG: gần như mọi form đẹp đều ẩn input thật
      // rồi vẽ một nút riêng. Nên không lọc ô file theo tính hiển thị.
      if (type !== "file" && !hien(el)) continue;

      // Đặt một dấu để phía Node chọn được đúng ô này mà không cần selector CSS
      // phức tạp - nhiều form không có id ổn định.
      const dau = "aijob-" + i;
      el.setAttribute("data-aijob", dau);

      /*
       * Khop tren TAT CA thuoc tinh nhan dang, khong chi mot nhan.
       *
       * Da do tren form Greenhouse: hai o file co id="resume" va id="cover_letter",
       * trong khi nhan cua ca hai (va cua moi ancestor) deu la "Attach" - vi form an
       * input that roi ve mot nut rieng. Neu chi khop theo nhan thi khong the phan
       * biet, va CV bi dinh vao ca o thu xin viec.
       *
       * 'label' van giu rieng de HIEN cho nguoi dung; 'haystack' chi de khop.
       */
      const label = nhanCua(el).slice(0, 80);
      const haystack = [
        label,
        el.getAttribute("id") || "",
        el.getAttribute("name") || "",
        el.getAttribute("placeholder") || "",
        el.getAttribute("aria-label") || "",
      ].join(" ");

      out.push({ dau, type, label, haystack });
    }
    return out;
  });

  report.visibleInputs = fields.filter((f) => f.type !== "file").length;
  report.hasFileInput = fields.some((f) => f.type === "file");

  for (const field of fields) {
    // Luật KHỚP ĐẦU TIÊN thắng; thứ tự do field-plan.ts quyết định.
    const rule = input.rules.find(
      (r) =>
        (r.kind === "file") === (field.type === "file") &&
        new RegExp(r.match, "i").test(field.haystack),
    );

    if (!rule) {
      if (field.type !== "file") report.unmatched.push(field.label);
      continue;
    }

    const loc = page.locator('[data-aijob="' + field.dau + '"]');
    try {
      if (rule.kind === "file") {
        await loc.setInputFiles(rule.value, { timeout: 10000 });
        // Tên file suy từ đường dẫn, không cần truyền thêm: đường dẫn đã do
        // 'field-plan.ts' sinh ra nên phần cuối của nó chính là tên file.
        const ten = rule.value.split("/").pop();
        report.filled.push({ label: field.label || ten, value: ten });
      } else {
        await loc.fill(rule.value, { timeout: 10000 });
        report.filled.push({ label: field.label, value: rule.value });
      }
    } catch (e) {
      // Một ô không điền được không được làm hỏng cả lượt: ghi vào unmatched rồi đi
      // tiếp. Người dùng vẫn nhận ảnh và những trường đã điền.
      report.unmatched.push(field.label);
    }
  }

  await page.screenshot({ path: "/work/screenshot.png", fullPage: true });
} catch (e) {
  report.error = String(e && e.message ? e.message : e).slice(0, 300);
} finally {
  if (browser) await browser.close().catch(() => {});
  await writeFile("/work/report.json", JSON.stringify(report));
}
`;
