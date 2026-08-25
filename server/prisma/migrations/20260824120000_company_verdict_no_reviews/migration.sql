-- AlterEnum
-- Postgres không cho DÙNG giá trị enum vừa thêm trong cùng transaction đã thêm
-- nó. Migration này cố ý chỉ có đúng một lệnh: mọi thao tác ghi dữ liệu bằng
-- 'NO_REVIEWS_YET' phải nằm ở migration sau.
ALTER TYPE "CompanyVerdict" ADD VALUE 'NO_REVIEWS_YET';
