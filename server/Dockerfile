# Maverick core: gateway + OpenCode server (+ the PWA build for iOS/web).
# Build context: repository root.
FROM node:22-bookworm AS web
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npx vite build

FROM node:22-bookworm AS server-build
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

FROM node:22-bookworm
# Tools the coding agent commonly needs inside project workspaces.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ripgrep jq python3-venv python3-pip unzip zip \
 && rm -rf /var/lib/apt/lists/*
ARG OPENCODE_VERSION=1.19.3
RUN npm install -g opencode-ai@${OPENCODE_VERSION} && opencode --version
WORKDIR /srv
COPY --from=server-build /srv/node_modules ./node_modules
COPY --from=server-build /srv/dist ./dist
COPY server/package.json ./
COPY --from=web /src/app/dist ./public
ENV NODE_ENV=production \
    DATA_DIR=/data \
    WEB_DIR=/srv/public \
    OPENCODE_BIN=opencode \
    PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
