# syntax=docker/dockerfile:1
#
# One image, one service: the Express API also serves the built web app.
# Build context = repo root.   docker build -t swiftslip .

# ---------- build: compile api + web ----------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so the dependency layer is cached until one changes.
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY shared ./shared
COPY api ./api
COPY web ./web

# Leave VITE_API_URL unset: the web app then calls /api on its own origin.
# (`shared` ships as TypeScript source and is bundled into both builds.)
RUN npm run build

# ---------- runtime: production deps + the two build outputs ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --workspace @swiftslip/api --workspace @swiftslip/shared \
 && npm cache clean --force

COPY --from=build /app/shared ./shared
COPY --from=build /app/api/build ./api/build
COPY --from=build /app/web/dist ./web/dist

# The API serves this folder as the website (see WEB_DIST in api/.env.example).
ENV WEB_DIST=/app/web/dist
# The host injects PORT (Render uses 10000). 9095 is the local default.
ENV PORT=9095
EXPOSE 9095

# The API writes logs/ next to the working directory; run unprivileged.
RUN mkdir -p /app/logs && chown node:node /app/logs
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9095)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "api/build/server.js"]
