FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache openssl libc6-compat \
  && corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --filter @crm/api... --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY --from=deps /repo/apps ./apps
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.base.json package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm --filter @crm/types build \
  && pnpm --filter @crm/api exec prisma generate \
  && pnpm --filter @crm/api build \
  && PRISMA_SKIP_POSTINSTALL_GENERATE=1 pnpm --filter @crm/api deploy --prod /out \
  && cp -R apps/api/prisma /out/prisma \
  && cp -R apps/api/dist /out/dist \
  && cd /out \
  && DATABASE_URL="postgresql://crm:crm@127.0.0.1:5432/crm?schema=public" \
     node node_modules/prisma/build/index.js generate

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl libc6-compat \
  && addgroup -S -g 10001 crm && adduser -S -G crm -u 10001 crm
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=crm:crm /out ./
USER crm
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
