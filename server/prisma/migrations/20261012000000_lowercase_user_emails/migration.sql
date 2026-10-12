-- Đăng nhập/đăng ký nay chuẩn hoá email về chữ thường; email cũ có chữ hoa sẽ không khớp nữa nếu không đổi theo.
-- Hai email chỉ khác hoa/thường mà cùng tồn tại sẽ làm migration này ĐỎ vì unique — cố ý: phải gộp tay, không được tự chọn bừa một tài khoản.
UPDATE "users" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
