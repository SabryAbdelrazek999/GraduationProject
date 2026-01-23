# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init bash git && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Production Stage ----
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init curl tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]