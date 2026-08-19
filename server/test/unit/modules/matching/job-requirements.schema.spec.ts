import { z } from 'zod';
import { jobRequirementsSchema } from 'src/modules/matching/schemas/job-requirements.schema.js';

const base = {
  requiredSkills: ['C# .NET'],
  niceToHaveSkills: ['Docker'],
  minYears: 2,
  seniority: 'MIDDLE',
  citizenshipRequired: null,
  workPermitRequired: false,
  eligibilityQuote: '',
  city: 'Ho Chi Minh',
  remotePolicy: 'ONSITE',
};

describe('jobRequirementsSchema', () => {
  test('workPermitRequired = null thành false thay vì hỏng cả lượt gọi', () => {
    const parsed = jobRequirementsSchema.parse({
      ...base,
      workPermitRequired: null,
    });

    expect(parsed.workPermitRequired).toBe(false);
  });

  test('workPermitRequired vẫn giữ true khi tin nói rõ', () => {
    const parsed = jobRequirementsSchema.parse({
      ...base,
      workPermitRequired: true,
    });

    expect(parsed.workPermitRequired).toBe(true);
  });

  test('workPermitRequired không nuốt kiểu sai', () => {
    expect(() =>
      jobRequirementsSchema.parse({ ...base, workPermitRequired: 'yes' }),
    ).toThrow();
  });

  test('JSON Schema gửi cho model không dạy nó trả null', () => {
    const json = z.toJSONSchema(jobRequirementsSchema) as {
      properties: Record<string, { type?: string }>;
    };

    expect(json.properties.workPermitRequired.type).toBe('boolean');
  });
});
