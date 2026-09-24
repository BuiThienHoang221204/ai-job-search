FROM diegosouzapw/omniroute:latest

USER root

RUN cd /app && npm install playwright-core@1.62.1 playwright@1.62.1 --legacy-peer-deps && \
    npx playwright install --with-deps chromium && \
    mkdir -p /app/node_modules/playwright/node_modules && ln -sf /app/node_modules/playwright-core /app/node_modules/playwright/node_modules/playwright-core && \
    cp -r /root/.cache/ms-playwright /app/ms-playwright && \
    chown -R node:node /app/node_modules/playwright /app/ms-playwright /app/node_modules/playwright-core

ENV PLAYWRIGHT_BROWSERS_PATH=/app/ms-playwright

USER node
