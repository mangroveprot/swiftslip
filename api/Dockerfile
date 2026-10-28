# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Workspace manifests first, so the dependency layer is cached until a
# package.json or the lockfile changes.
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY shared ./shared
COPY api ./api
RUN npm run build -w @swiftslip/api

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --workspace @swiftslip/api --workspace @swiftslip/shared \
 && npm cache clean --force

# tsup bundles @swiftslip/shared into server.js; the workspace copy keeps the
# symlink valid if anything ever requires it directly.
COPY --from=build /app/shared ./shared
COPY --from=build /app/api/build ./api/build

# The host injects PORT (Render uses 10000). 9095 is the local default.
ENV PORT=9095
EXPOSE 9095

CMD ["node", "api/build/server.js"]
