FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @crm/api... --frozen-lockfile

FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.base.json package.json pnpm-workspace.yaml ./
WORKDIR /repo/apps/api
RUN pnpm exec prisma generate && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/package.json ./
COPY --from=build /repo/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/server.js"]
