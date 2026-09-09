FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build must not talk to real Postgres (hostname "postgres" only exists at runtime).
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# sharp rasterises the product-label SVG on the server; the base image ships no
# fonts, so without this every glyph renders as a missing-glyph box. Liberation
# Sans is metric-compatible with the Arial widths label-layout.ts measures with.
RUN apk add --no-cache fontconfig font-liberation font-dejavu \
    || apk add --no-cache fontconfig ttf-liberation ttf-dejavu \
    || apk add --no-cache fontconfig ttf-dejavu
RUN fc-cache -f
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
