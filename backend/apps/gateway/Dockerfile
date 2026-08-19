# Build context is backend/ (the Nest monorepo root) — `npm run build:gateway` needs the whole
# monorepo (nest-cli.json, tsconfig, shared libs), not just this app's folder.
#
#   docker build -f apps/gateway/Dockerfile -t askmycrawl-gateway .
#
# (devops/docker-compose.yml sets context/dockerfile for you — this is just for reference.)

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
# Webpack is disabled (nest-cli.json) so OTel's require()-hook auto-instrumentation actually works
# — it can't patch a call a bundler inlined. Consequences, all handled by this one script:
#   1. libs are compiled separately into dist/libs/* (webpack used to inline them), and
#   2. tsc-alias rewrites the @app/* path aliases in the emitted JS into real relative requires.
RUN npm run build:gateway

# The build treats node_modules as external, so the runtime image still needs a real npm install,
# just prod-only.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist/apps/gateway ./dist/apps/gateway
# Required: the rewritten relative requires in dist/apps/gateway point into here.
COPY --from=builder /app/dist/libs ./dist/libs

EXPOSE 8000
CMD ["node", "dist/apps/gateway/src/main.js"]
