# Ngân hàng câu hỏi phỏng vấn — dữ liệu thu từ x-interview.com

## Nguồn gốc

Dữ liệu trong thư mục này được thu ngày **06/09/2026** từ ngân hàng câu hỏi công khai của
`x-interview.com`, qua endpoint `/mypage/questions/ajax-search` mà chính frontend của họ gọi.
Không cần đăng nhập, không vượt qua lớp xác thực nào.

**Đây là nội dung của bên thứ ba.** Điều khoản dịch vụ của x-interview cấm "sao chép hoặc khai
thác thương mại trái phép". Quyết định sử dụng là của chủ đầu tư, đã cân nhắc và chốt ngày
06/09/2026. Mọi bản ghi khi nhập vào database **phải giữ `source = X_INTERVIEW` và `sourceId`**
để còn lọc, thay thế dần hoặc gỡ bỏ theo nguồn.

## Các file

| File | Số dòng | Nội dung |
|---|---|---|
| `questions.jsonl` | 11.165 | Toàn bộ câu hỏi thu được, nguyên trạng |
| `clean.jsonl` | 6.437 | Đã bỏ trùng, thêm trường `lang` và `industry` |

Mỗi dòng là một JSON object:

```json
{
  "sourceId": 14046,
  "text": "Bạn muốn theo mảng Marketing nào? (content marketing)",
  "difficulty": "Trung bình",
  "practiceCount": 169,
  "industry": null,
  "lang": "vi"
}
```

## Số liệu đã đo

Trang nguồn công bố 11.168 câu. Thu về 11.165 câu có id duy nhất, 745/745 trang thành công.

Sau khi lọc:

| Bước | Còn lại |
|---|---|
| Thu về | 11.165 |
| Bỏ trùng y hệt | 11.034 (−131) |
| Bỏ gần trùng (Jaccard ≥ 0,6) | **6.437** (−4.597) |

**41% ngân hàng gốc là câu gần trùng nhau** — dấu hiệu của việc sinh hàng loạt bằng model rồi
đổ thẳng vào database, không có bước khử trùng.

Trong 6.437 câu còn lại:

| | Số câu |
|---|---|
| Tiếng Anh | 5.931 (92,1%) |
| Tiếng Việt | 506 |
| **Tiếng Việt, không bị cắt cụt — dùng được ngay** | **402** |
| Đã từng có người luyện tập | 792 |

Độ khó: Khó 3.439 · Trung bình 2.795 · Dễ 203. Tỉ lệ câu "Dễ" chỉ 3% là bất thường với một
ngân hàng phục vụ cả người mới tốt nghiệp, và là thêm một dấu hiệu của việc gán nhãn tự động.

## Những thứ KHÔNG lấy được

- **Đáp án.** Trang nguồn không lưu đáp án mẫu — mô hình sản phẩm của họ là AI chấm câu trả lời
  của người dùng theo từng lượt. Kể cả mua gói trả phí cũng không có kho đáp án để lấy.
- **Nhãn ngành nghề.** Phần lớn câu hỏi không gắn ngành. Bốn nhóm đầu (Kinh doanh, Marketing,
  Chăm sóc khách hàng, Nhân sự) cho 1.052 câu có nhãn; lượt quét các nhóm còn lại chưa chạy xong.
- **Cấp độ kinh nghiệm.** Chỉ 523/11.168 câu có gắn mức "Mới tốt nghiệp".

## Chạy lại

```bash
node crawl.mjs questions.jsonl              # ~12 phút, giãn 0,9 giây mỗi trang
node crawl-tags.mjs role-tree.json tags.json # quét nhãn ngành, CHƯA chạy xong lần nào
node analyze.mjs questions.jsonl tags.json clean.jsonl
```

`crawl-tags.mjs` chỉ in log sau khi xong trọn một nhóm ngành, nên khi gặp nhóm nhiều trang thì
trông như bị treo. Cần sửa lại cho in tiến độ từng trang trước khi chạy lâu.

`role-tree.json` là cây ngành nghề 3 tầng (25 / 157 / 1.122 nút) trích từ thuộc tính
`data-role-tree` trên trang nguồn. Cây này trùng khớp với danh mục ngành nghề của TopCV.
