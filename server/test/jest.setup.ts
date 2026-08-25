import { Logger } from '@nestjs/common';

// Các service được test trực tiếp vẫn ghi log qua Nest Logger. Trong test,
// những dòng đó chỉ làm nhiễu kết quả - tắt đi để đọc được pass/fail.
Logger.overrideLogger(false);
