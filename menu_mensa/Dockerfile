# Immagine con Node.js e Chromium (Playwright) per leggere il menu da Menu Chiaro.
# Home Assistant passa BUILD_FROM, ma qui serve Debian (Chromium non gira su Alpine).
FROM node:22.22.1-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production

WORKDIR /app
COPY app/package.json ./
RUN npm install --no-audit --no-fund \
 && npx playwright install --with-deps --only-shell chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm

COPY app/ ./

CMD ["node", "/app/servizio.mjs"]
