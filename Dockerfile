FROM node:22.13-bookworm-slim

WORKDIR /app

# The application uses only Node.js built-ins; no npm install is required.
COPY --chown=node:node . .
RUN node build.js \
    && mkdir -p /app/data \
    && chown -R node:node /app

ENV NODE_ENV=production \
    COS_DATA_DIR=/app/data

EXPOSE 6969

USER node

CMD ["npm", "start"]
