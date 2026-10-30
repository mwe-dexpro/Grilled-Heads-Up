# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY client client
COPY server server
RUN npm run build
# Keep only the server's production dependencies, installed offline from the cache filled above.
RUN rm -rf node_modules client/node_modules server/node_modules \
 && npm ci --omit=dev --workspace server --offline

FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    CLIENT_DIR=/app/client/dist \
    DATABASE_FILE=/data/grilled-heads-up.sqlite
WORKDIR /app
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
