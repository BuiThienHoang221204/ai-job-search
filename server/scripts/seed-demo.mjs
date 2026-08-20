import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { personas } from './demo-personas.mjs';

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL chưa được đặt. Hãy tạo server/.env từ .env.example.');
}

/** Mật khẩu dùng chung cho MỌI tài khoản seed. Chỉ dành cho database dev. */
const demoUser = {
  id: 'demo_user_vietnam_001',
  email: 'demo@aijob.local',
  name: 'Nguyễn Minh Anh',
  password: 'Demo@12345',
};

/** Sáu spec Playwright đăng nhập bằng tài khoản này và cần role ADMIN cho /admin. */
const adminUser = {
  id: 'demo_user_admin_001',
  email: 'admin@aijob.local',
  name: 'Quản trị viên',
};

const jobs = [
  {
    id: 'demo_job_backend_001',
    externalId: 'demo-backend-001',
    title: 'Backend Engineer (Node.js)',
    company: 'Nexa Software',
    location: 'Quận 1, Hồ Chí Minh',
    workMode: 'Hybrid',
    salaryRaw: '30–45 triệu VNĐ',
    salaryMin: 30000000,
    salaryMax: 45000000,
    tags: ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker'],
    description: 'Xây dựng API bằng NestJS, tối ưu PostgreSQL và vận hành dịch vụ Docker.',
    url: 'https://example.com/jobs/backend-engineer',
  },
  {
    id: 'demo_job_frontend_001',
    externalId: 'demo-frontend-001',
    title: 'Frontend Engineer (React)',
    company: 'Lotus Labs',
    location: 'Hà Nội',
    workMode: 'Remote',
    salaryRaw: '28–40 triệu VNĐ',
    salaryMin: 28000000,
    salaryMax: 40000000,
    tags: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
    description: 'Phát triển giao diện React/Next.js, phối hợp với designer và backend.',
    url: 'https://example.com/jobs/frontend-engineer',
  },
  {
    id: 'demo_job_data_001',
    externalId: 'demo-data-001',
    title: 'Data Analyst',
    company: 'Viet Insight',
    location: 'Đà Nẵng',
    workMode: 'Onsite',
    salaryRaw: '20–30 triệu VNĐ',
    salaryMin: 20000000,
    salaryMax: 30000000,
    tags: ['SQL', 'Python', 'Power BI'],
    description: 'Phân tích dữ liệu vận hành, xây dựng dashboard và báo cáo cho business.',
    url: 'https://example.com/jobs/data-analyst',
  },
];

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query('BEGIN');

  const passwordHash = await bcrypt.hash(demoUser.password, 12);

  await client.query(
    `INSERT INTO users (id, email, name, "passwordHash", role, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'USER', NOW(), NOW())
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = NOW()`,
    [demoUser.id, demoUser.email, demoUser.name, passwordHash],
  );

  await client.query(
    `INSERT INTO users (id, email, name, "passwordHash", role, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ADMIN', NOW(), NOW())
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, "passwordHash" = EXCLUDED."passwordHash",
           role = 'ADMIN', "updatedAt" = NOW()`,
    [adminUser.id, adminUser.email, adminUser.name, passwordHash],
  );

  const { rows: users } = await client.query(
    'SELECT id FROM users WHERE email = $1',
    [demoUser.email],
  );
  const userId = users[0].id;

  await client.query(
    `INSERT INTO profiles (
       id, "userId", headline, location, phone, country, languages,
       "employmentStatus", summary, citizenship, "workPermit", "primarySkills",
       "secondarySkills", "careerGoals", "targetSectors", "remotePreference",
       "willingToRelocate", completion, "createdAt", "updatedAt"
     ) VALUES (
       'demo_profile_vietnam_001', $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
     ) ON CONFLICT ("userId") DO UPDATE SET
       headline = EXCLUDED.headline, location = EXCLUDED.location, phone = EXCLUDED.phone,
       country = EXCLUDED.country, languages = EXCLUDED.languages,
       "employmentStatus" = EXCLUDED."employmentStatus", summary = EXCLUDED.summary,
       citizenship = EXCLUDED.citizenship, "workPermit" = EXCLUDED."workPermit",
       "primarySkills" = EXCLUDED."primarySkills", "secondarySkills" = EXCLUDED."secondarySkills",
       "careerGoals" = EXCLUDED."careerGoals", "targetSectors" = EXCLUDED."targetSectors",
       "remotePreference" = EXCLUDED."remotePreference",
       "willingToRelocate" = EXCLUDED."willingToRelocate", completion = EXCLUDED.completion,
       "updatedAt" = NOW()`,
    [
      userId, 'Backend Developer | Node.js & TypeScript', 'Hồ Chí Minh', '0900000000',
      'Việt Nam', ['Tiếng Việt', 'English'], 'Đang tìm việc',
      'Backend developer với 4 năm kinh nghiệm xây dựng API, hệ thống dữ liệu và dịch vụ containerized.',
      'Việt Nam', 'Không cần', ['Node.js', 'TypeScript', 'NestJS', 'PostgreSQL', 'Docker'],
      ['React', 'Redis', 'AWS'], ['Senior Backend Developer'], ['SaaS', 'Fintech'],
      'Hybrid hoặc Remote', true, 90,
    ],
  );

  for (const job of jobs) {
    await client.query(
      `INSERT INTO jobs (
         id, source, "externalId", url, title, company, location, "workMode",
         "salaryRaw", "salaryMin", "salaryMax", currency, tags, description
       ) VALUES (
         $1, 'demo', $2, $3, $4, $5, $6, $7,
         $8, $9, $10, 'VND', $11, $12
       ) ON CONFLICT (source, "externalId") DO UPDATE SET
         url = EXCLUDED.url, title = EXCLUDED.title, company = EXCLUDED.company,
         location = EXCLUDED.location, "workMode" = EXCLUDED."workMode",
         "salaryRaw" = EXCLUDED."salaryRaw", "salaryMin" = EXCLUDED."salaryMin",
         "salaryMax" = EXCLUDED."salaryMax", tags = EXCLUDED.tags,
         description = EXCLUDED.description, "scrapedAt" = NOW()`,
      [
        job.id, job.externalId, job.url, job.title, job.company, job.location,
        job.workMode, job.salaryRaw, job.salaryMin, job.salaryMax, job.tags, job.description,
      ],
    );
  }

  const { rows: storedJobs } = await client.query(
    `SELECT id, "externalId" FROM jobs WHERE source = 'demo'`,
  );
  const jobIdByExternalId = new Map(storedJobs.map((job) => [job.externalId, job.id]));
  const backendJobId = jobIdByExternalId.get('demo-backend-001');
  const frontendJobId = jobIdByExternalId.get('demo-frontend-001');
  const dataJobId = jobIdByExternalId.get('demo-data-001');

  await client.query(
    `INSERT INTO job_matches (
       id, "userId", "jobId", status, eligibility, "technicalScore", "experienceScore",
       "behavioralScore", "careerScore", "locationPass", "overallScore", verdict,
       strengths, gaps, recommendation, "evaluatedAt", "createdAt", "updatedAt"
     ) VALUES (
       'demo_match_backend_001', $1, $2, 'DONE', 'PASS', 92, 88,
       82, 90, TRUE, 89, 'STRONG', $3, $4, $5, NOW(), NOW(), NOW()
     ) ON CONFLICT ("userId", "jobId") DO UPDATE SET
       status = EXCLUDED.status, eligibility = EXCLUDED.eligibility,
       "technicalScore" = EXCLUDED."technicalScore", "experienceScore" = EXCLUDED."experienceScore",
       "behavioralScore" = EXCLUDED."behavioralScore", "careerScore" = EXCLUDED."careerScore",
       "locationPass" = EXCLUDED."locationPass", "overallScore" = EXCLUDED."overallScore",
       verdict = EXCLUDED.verdict, strengths = EXCLUDED.strengths, gaps = EXCLUDED.gaps,
       recommendation = EXCLUDED.recommendation, "evaluatedAt" = NOW(), "updatedAt" = NOW()`,
    [
      userId, backendJobId, ['Node.js/NestJS phù hợp', 'Kinh nghiệm PostgreSQL và Docker'],
      ['Nên nêu rõ kinh nghiệm thiết kế hệ thống lớn'],
      'Ưu tiên ứng tuyển: mức phù hợp cao với định hướng backend.',
    ],
  );

  await client.query(
    `INSERT INTO saved_jobs (id, "userId", "jobId") VALUES
       ('demo_saved_frontend_001', $1, $2),
       ('demo_saved_data_001', $1, $3)
     ON CONFLICT ("userId", "jobId") DO NOTHING`,
    [userId, frontendJobId, dataJobId],
  );

  await client.query(
    `INSERT INTO applications (id, "userId", "jobId", status, "appliedAt", "createdAt", "updatedAt")
     VALUES ('demo_application_backend_001', $1, $2, 'APPLIED', NOW() - INTERVAL '2 days', NOW(), NOW())
     ON CONFLICT ("userId", "jobId") DO UPDATE SET
       status = 'APPLIED', "appliedAt" = EXCLUDED."appliedAt", "updatedAt" = NOW()`,
    [userId, backendJobId],
  );

  const { rows: applications } = await client.query(
    'SELECT id FROM applications WHERE "userId" = $1 AND "jobId" = $2',
    [userId, backendJobId],
  );
  const applicationId = applications[0].id;

  await client.query('DELETE FROM application_events WHERE "applicationId" = $1', [applicationId]);
  await client.query(
    `INSERT INTO application_events (id, "applicationId", "fromStatus", "toStatus", note)
     VALUES
       ('demo_event_ranked_001', $1, NULL, 'RANKED', 'Đánh giá mức phù hợp cao.'),
       ('demo_event_applied_001', $1, 'RANKED', 'APPLIED', 'Đã nộp hồ sơ qua trang tuyển dụng.')`,
    [applicationId],
  );

  for (const persona of personas) {
    const email = `${persona.slug}@aijob.local`;

    await client.query(
      `INSERT INTO users (id, email, name, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'USER', NOW(), NOW())
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, "passwordHash" = EXCLUDED."passwordHash",
             "updatedAt" = NOW()`,
      [`demo_user_${persona.slug}`, email, persona.name, passwordHash],
    );

    const { rows: personaUsers } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    await client.query(
      `INSERT INTO profiles (
         id, "userId", headline, location, phone, country, languages,
         "employmentStatus", summary, citizenship, "workPermit",
         "primarySkills", "secondarySkills", "directExperienceDomains",
         "careerGoals", "energizingTasks", "drainingTasks", "targetSectors",
         "dealBreakers", "remotePreference", "willingToRelocate", completion,
         "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, $5, 'Việt Nam', $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW()
       ) ON CONFLICT ("userId") DO UPDATE SET
         headline = EXCLUDED.headline, location = EXCLUDED.location,
         phone = EXCLUDED.phone, languages = EXCLUDED.languages,
         "employmentStatus" = EXCLUDED."employmentStatus", summary = EXCLUDED.summary,
         citizenship = EXCLUDED.citizenship, "workPermit" = EXCLUDED."workPermit",
         "primarySkills" = EXCLUDED."primarySkills",
         "secondarySkills" = EXCLUDED."secondarySkills",
         "directExperienceDomains" = EXCLUDED."directExperienceDomains",
         "careerGoals" = EXCLUDED."careerGoals",
         "energizingTasks" = EXCLUDED."energizingTasks",
         "drainingTasks" = EXCLUDED."drainingTasks",
         "targetSectors" = EXCLUDED."targetSectors",
         "dealBreakers" = EXCLUDED."dealBreakers",
         "remotePreference" = EXCLUDED."remotePreference",
         "willingToRelocate" = EXCLUDED."willingToRelocate",
         completion = EXCLUDED.completion, "updatedAt" = NOW()`,
      [
        `demo_profile_${persona.slug}`, personaUsers[0].id, persona.headline,
        persona.location, persona.phone, persona.languages, persona.employmentStatus,
        persona.summary, persona.citizenship, persona.workPermit, persona.primarySkills,
        persona.secondarySkills, persona.directExperienceDomains, persona.careerGoals,
        persona.energizingTasks, persona.drainingTasks, persona.targetSectors,
        persona.dealBreakers, persona.remotePreference, persona.willingToRelocate,
        persona.completion,
      ],
    );
  }

  await client.query('COMMIT');
  console.log('Đã chèn dữ liệu demo thành công.');
  console.log(`\nMật khẩu dùng chung cho mọi tài khoản: ${demoUser.password}\n`);
  console.log(`  ${adminUser.email.padEnd(26)} ADMIN — dùng cho 6 spec Playwright và trang /admin`);
  console.log(`  ${demoUser.email.padEnd(26)} IT — Backend developer (có sẵn tin, điểm, đơn ứng tuyển)`);
  for (const persona of personas) {
    console.log(`  ${`${persona.slug}@aijob.local`.padEnd(26)} ${persona.nganh}`);
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('Không thể seed dữ liệu demo:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
