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

# ---- Tools Stage ----
FROM projectdiscovery/httpx:latest AS httpx_source

# ---- Production Stage ----
FROM node:20-slim

WORKDIR /app

# Install dependencies and tools (Nmap, Nikto)
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init curl tzdata \
    ca-certificates \
    nmap \
    perl \
    git \
    unzip \
    libnet-ssleay-perl \
    && rm -rf /var/lib/apt/lists/*

# Install Nikto
RUN git clone https://github.com/sullo/nikto.git /opt/nikto && \
    chmod +x /opt/nikto/program/nikto.pl && \
    echo '#!/bin/bash\nperl /opt/nikto/program/nikto.pl "$@"' > /usr/local/bin/nikto && \
    chmod +x /usr/local/bin/nikto


# Install httpx (Direct download)
RUN curl -L -o httpx.zip https://github.com/projectdiscovery/httpx/releases/download/v1.6.8/httpx_1.6.8_linux_amd64.zip && \
    unzip httpx.zip && \
    mv httpx /usr/local/bin/ && \
    rm httpx.zip

COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared

EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]