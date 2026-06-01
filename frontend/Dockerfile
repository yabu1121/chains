# --- dependencies -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* is inlined into the client bundle at build time, so the
# production API URL must be supplied here (e.g.
# --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com).
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
# Produces .next/standalone (output: "standalone" in next.config.mjs).
RUN npm run build

# --- runtime ----------------------------------------------------------------
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# The standalone bundle contains a minimal server.js plus the traced
# node_modules; static assets and public/ are copied in alongside it.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
USER node
CMD ["node", "server.js"]
