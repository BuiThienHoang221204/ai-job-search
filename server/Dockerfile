# ---- Build stage ----
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

# Cache dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Generate Prisma client
RUN pnpm exec prisma generate

# Build NestJS
RUN pnpm run build

# ---- Production stage ----
FROM node:22-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

# Copy only production dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built app
COPY --from=builder /app/dist ./dist

# Copy Prisma schema and config (needed for migrations at deploy time)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Copy generated Prisma Client
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

EXPOSE 3000

CMD ["node", "dist/main"]
