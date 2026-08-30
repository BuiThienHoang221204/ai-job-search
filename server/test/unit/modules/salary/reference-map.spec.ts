import { referenceOccupation } from 'src/modules/salary/reference-map.js';

describe('referenceOccupation', () => {
  it('xếp theo ngành của nguồn khi không có quy tắc riêng', () => {
    expect(
      referenceOccupation('it-software-backend-developer', 'it-software'),
    ).toBe('IT');
    expect(referenceOccupation('marketing-seo-executive', 'marketing')).toBe(
      'MARKETING',
    );
  });

  it('cắt tiền tố ngành lặp lại trong slug trước khi tra quy tắc ghi đè', () => {
    expect(referenceOccupation('it-software-data-analyst', 'it-software')).toBe(
      'DATA_AI',
    );
    expect(
      referenceOccupation('it-software-ui-ux-designer', 'it-software'),
    ).toBe('DESIGN');
  });

  it('đưa vị trí nằm lệch nhóm về đúng ngành của nó', () => {
    expect(
      referenceOccupation(
        'engineering-manufacturing-warehouse-keeper',
        'engineering-manufacturing',
      ),
    ).toBe('LOGISTICS');
    expect(
      referenceOccupation(
        'business-sales-customer-service-executive',
        'business-sales',
      ),
    ).toBe('CUSTOMER');
    expect(referenceOccupation('marketing-graphic-designer', 'marketing')).toBe(
      'DESIGN',
    );
  });

  it('trả null khi ngành của nguồn không nằm trong danh mục', () => {
    expect(referenceOccupation('nganh-la-vi-tri-la', 'nganh-la')).toBeNull();
  });

  it('vẫn tra được khi slug không mang tiền tố ngành', () => {
    expect(referenceOccupation('data-scientist', 'it-software')).toBe(
      'DATA_AI',
    );
  });
});
