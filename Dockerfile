# syntax=docker/dockerfile:1

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY tools/package.json tools/
RUN npm ci
COPY client client
COPY server server
RUN npm run build
# Keep only the server's production dependencies, installed offline from the cache filled above.
RUN rm -rf node_modules client/node_modules server/node_modules \
 && npm ci --omit=dev --workspace server --offline

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIR=/app/client/dist \
    DATABASE_FILE=/data/grilled-heads-up.sqlite
WORKDIR /app
# The server runs with `node` alone. The package managers that come with the image (npm, npx, corepack, yarn) are not
# needed to run it, and the packages they bundle carry advisories of their own, which the image scan would report.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v*
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/dist/server.js"]
