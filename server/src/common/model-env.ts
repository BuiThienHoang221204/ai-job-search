/** Đọc một biến môi trường dạng danh sách "a,b,c" thành mảng đã trim, bỏ rỗng; trả `undefined` khi rỗng — mảng RỖNG (khác `undefined`) sẽ bị `ModelChain` hiểu là "cố ý không có mắt xích dự phòng nào" và xoá mất `MODEL_FALLBACK_IDS` mặc định. */
export function modelIdsFrom(raw: string | undefined): string[] | undefined {
  const ids = (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}
