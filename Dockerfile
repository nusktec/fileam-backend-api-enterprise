# syntax=docker/dockerfile:1
# --- Base: Node + pnpm (single place for runtime) ---
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# --- Dependencies (lockfile required for reproducible builds) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# --- Builder: compile TS and generate Prisma client ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# --- Runner: minimal production image ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

# Production deps; Prisma client copied from builder. Install Prisma CLI only for migrate deploy at startup.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Prisma schema + migrations (needed for migrate deploy at startup)
COPY --from=builder /app/prisma ./prisma

# App output and static assets (__dirname in app = dist/)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/services/template ./dist/services/template
RUN mkdir -p dist/views dist/public

EXPOSE 3000

RUN chown -R node:node /app
USER node

# Run pending migrations then start the app (DATABASE_URL must be set at runtime)
CMD ["sh", "-c", "pnpm exec prisma migrate deploy --schema=prisma/schema && exec node dist/app.js"]
