import { Injectable } from '@nestjs/common';
import { CompanyService } from '@/modules/companies/services/company.service';

@Injectable()
export class ExtCompanyService {
  constructor(private readonly companies: CompanyService) {}

  /** Tìm hiểu công ty theo TÊN (không tạo tin): tên ẩn danh/không rõ thì trả về sớm, không xếp hàng AI; bản còn hạn trả cache; thiếu/hết hạn mới xếp hàng. Bản tóm tắt là chung theo công ty nên không khoá theo người dùng. */
  async review(company: string) {
    const view = await this.companies.forCompany(company);
    if (!view.researchable) return { queued: false, ...view };
    const refresh = await this.companies.enqueueRefreshByName(company, false);
    return { queued: refresh.queued, ...view };
  }

  result(company: string) {
    return this.companies.forCompany(company);
  }
}
