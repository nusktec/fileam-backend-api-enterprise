FROM node:22 AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:22 AS runner

WORKDIR /app

RUN npm install -g pnpm

ENV NODE_ENV=production
ENV PORT=80

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/public ./src/public
COPY --from=builder /app/src/views ./src/views
COPY --from=builder /app/src/services/template ./dist/services/template

EXPOSE 80

CMD ["node", "dist/app.js", "--seed"]
