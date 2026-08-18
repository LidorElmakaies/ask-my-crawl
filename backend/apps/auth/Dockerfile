# Build context is backend/ (the Nest monorepo root) — `nest build auth` needs the whole
# monorepo (nest-cli.json, tsconfig, libs/auth-kernel), not just this app's folder.
#
#   docker build -f apps/auth/Dockerfile -t askmycrawl-auth .
#
# (devops/docker-compose.yml sets context/dockerfile for you — this is just for reference.)

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npx nest build auth

# nest-cli.json has webpack:true, but the webpack build treats node_modules as external
# (standard Nest behavior, keeps the bundle small) — so the runtime image still needs a real
# npm install, just prod-only.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist/apps/auth ./dist/apps/auth

EXPOSE 8001
CMD ["node", "dist/apps/auth/main.js"]
