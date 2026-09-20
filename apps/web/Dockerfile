FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @crm/web... --frozen-lockfile

FROM base AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY --from=deps /repo/apps ./apps
COPY packages ./packages
COPY apps/web ./apps/web
COPY tsconfig.base.json package.json pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm --filter @crm/types build && pnpm --filter @crm/web build

FROM node:22-alpine AS runner
RUN addgroup -S -g 10001 crm && adduser -S -G crm -u 10001 crm
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js standalone uses HOSTNAME as the listen address. Docker/K8s set HOSTNAME
# to the container id/pod name, which breaks 127.0.0.1 probes unless overridden.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=build --chown=crm:crm /repo/apps/web/.next/standalone ./
COPY --from=build --chown=crm:crm /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=crm:crm /repo/apps/web/public ./apps/web/public
USER crm
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
