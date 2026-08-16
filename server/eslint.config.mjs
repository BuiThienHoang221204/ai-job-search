// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // src/generated/ là mã Prisma sinh ra nên không lint. Lưu ý: bỏ qua ở đây
    // chỉ là bỏ qua việc SOI LỖI, thư mục đó vẫn nằm trong "include" của
    // tsconfig.json vì trình phân giải type cần đọc nó.
    // prisma.config.ts nằm ngoài "include" (chỉ CLI của Prisma đọc file này),
    // nên phải bỏ qua, không thì IDE báo "file không thuộc project nào".
    // test/*.mjs là hai script chạy jest, nằm ngoài "include" của tsconfig nên
    // project service không nhận. Lệnh `pnpm lint` chỉ quét *.ts nên không thấy,
    // còn IDE thì lint mọi file đang mở và báo "Parsing error".
    ignores: [
      'eslint.config.mjs',
      'prisma.config.ts',
      'src/generated/**',
      'dist/**',
      'scripts/**',
      'test/*.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
