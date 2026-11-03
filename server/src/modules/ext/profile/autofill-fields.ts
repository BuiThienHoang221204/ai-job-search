import type { Profile, User } from '@/generated/prisma/client';

export type AutofillData = {
  fullName: string;
  givenName: string | null;
  familyName: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  country: string | null;
  headline: string | null;
  summary: string | null;
  skills: string[];
  languages: string[];
  expectedSalary: number | null;
  willingToRelocate: boolean;
  workAuthorization: string | null;
};

/** Gom hồ sơ (User + Profile) thành bộ trường mà tiện ích điền vào form ứng tuyển. Tách
 * theo THỨ TỰ TÊN VIỆT: tên gọi = token CUỐI ("Bùi Thiên Hoàng" → "Hoàng"), họ và chữ
 * lót = phần còn lại ("Bùi Thiên"). Form thường có cả ô "họ và tên" dùng `fullName`. */
export function toAutofill(
  user: Pick<User, 'name' | 'email'>,
  profile: Pick<
    Profile,
    | 'phone'
    | 'location'
    | 'country'
    | 'headline'
    | 'summary'
    | 'primarySkills'
    | 'secondarySkills'
    | 'languages'
    | 'expectedSalary'
    | 'willingToRelocate'
    | 'citizenship'
    | 'workPermit'
  >,
): AutofillData {
  const fullName = user.name.trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const givenName = parts.length >= 2 ? parts[parts.length - 1] : null;
  const familyName = parts.length >= 2 ? parts.slice(0, -1).join(' ') : null;

  return {
    fullName,
    givenName,
    familyName,
    email: user.email,
    phone: profile.phone,
    location: profile.location,
    country: profile.country,
    headline: profile.headline,
    summary: profile.summary,
    skills: Array.from(
      new Set([...profile.primarySkills, ...profile.secondarySkills]),
    ),
    languages: profile.languages,
    expectedSalary: profile.expectedSalary,
    willingToRelocate: profile.willingToRelocate,
    workAuthorization: profile.workPermit ?? profile.citizenship ?? null,
  };
}
