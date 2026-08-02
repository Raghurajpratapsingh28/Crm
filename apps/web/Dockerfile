FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @crm/web... --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY packages ./packages
COPY apps/web ./apps/web
COPY tsconfig.base.json package.json pnpm-workspace.yaml ./
WORKDIR /repo/apps/web
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
