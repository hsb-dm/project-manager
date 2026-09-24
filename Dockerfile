# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY build.js ./
COPY src ./src
COPY shared ./shared

RUN node build.js


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    COS_DATA_DIR=/app/data \
    COS_BACKUP_DIR=/app/data/backups

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node db ./db
COPY --chown=node:node shared ./shared
COPY --from=builder --chown=node:node /app/public ./public

RUN mkdir -p /app/data/backups && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "--no-warnings", "server/server.js"]
