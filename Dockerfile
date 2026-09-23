# 2MAILS — Dockerfile pour Coolify (2mailsnew)

FROM node:20-alpine
RUN apk add --no-cache git libc6-compat sqlite
RUN npm install -g bun
WORKDIR /app
RUN git clone https://github.com/topmuch/2mailsnew.git .
RUN bun install
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/2mails.db
RUN bun run build
RUN mkdir -p /app/data
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL=file:/app/data/2mails.db
CMD sh -c "mkdir -p /app/data && export DATABASE_URL=file:/app/data/2mails.db && npx prisma db push --skip-generate 2>/dev/null || true && node scripts/seed-admin.mjs 2>/dev/null || true && exec node .next/standalone/server.js"
