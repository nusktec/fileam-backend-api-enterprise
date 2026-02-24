# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN npm install -g pnpm@10
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm exec prisma generate --schema=prisma/schema
RUN pnpm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=builder /app/prisma ./prisma
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm exec prisma generate --schema=prisma/schema

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/services/template ./dist/services/template
RUN mkdir -p dist/views dist/public

EXPOSE 3000

RUN chown -R node:node /app
USER node

CMD ["sh", "-c", "pnpm exec prisma migrate deploy --schema=prisma/schema/schema.prisma && exec node dist/app.js"]