# Static web export, served by Caddy. This is a preview/dev-in-a-container target for the web
# build only — Android/iOS still run via `npx expo start` locally, no useful way to containerize
# a device/simulator target.
#
#   docker build -t askmycrawl-frontend .

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
# Single source of truth for the deployment's public origin — see devops/.env.example. Passed in
# as a build arg (devops/frontend/docker-compose.yml), re-exposed with the EXPO_PUBLIC_ prefix
# Expo requires to inline a var into the client bundle at build time — src/config/urls.js reads
# it. Default here matches urls.js's own fallback, for a plain `docker build` with no --build-arg.
ARG PUBLIC_ORIGIN=http://localhost:8000
ENV EXPO_PUBLIC_GATEWAY_ORIGIN=$PUBLIC_ORIGIN
RUN npm run build:web

FROM caddy:2-alpine AS runner
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
