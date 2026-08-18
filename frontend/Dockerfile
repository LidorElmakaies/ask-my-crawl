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
RUN npm run build:web

FROM caddy:2-alpine AS runner
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
