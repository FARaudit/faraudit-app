# PDF Service — explicit Dockerfile so the runtime image actually carries
# the system libs @sparticuz/chromium needs. Railpack's apt config was
# scheduling the install but the libs weren't surviving the multi-stage
# merge into the runtime layer; using a hand-rolled image removes the
# guess-work.

FROM node:22-bookworm-slim

# Headless Chromium runtime deps. @sparticuz/chromium ships the binary in
# /tmp/chromium but expects these shared libs on PATH at execution time.
# The list mirrors puppeteer's documented Debian-Bookworm prerequisites,
# minus a few X11 libs we don't need for off-screen render.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 \
      libnspr4 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libxfixes3 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
      libatspi2.0-0 \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (production-only). Keeps image size sane.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Service source — tsx executes index.ts at runtime; no build step.
COPY index.ts tsconfig.json ./

EXPOSE 8080
ENV PORT=8080

CMD ["npx", "tsx", "index.ts"]
