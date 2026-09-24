# Builds once on the host architecture (the output is plain JS), then copies into a
# tiny runtime image for each target platform — no QEMU needed for arm64.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --ignore-scripts=false
COPY packages packages
COPY apps apps
COPY tools tools
RUN pnpm --filter @werk/client build && pnpm --filter @werk/server build && mkdir -p /out/data

FROM node:22-alpine
ENV NODE_ENV=production \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning \
    PORT=8080 \
    DATA_DIR=/data \
    MAPS_DIR=/app/maps \
    CLIENT_DIR=/app/public
WORKDIR /app
COPY --from=build /src/apps/server/dist ./server
COPY --from=build /src/apps/client/dist ./public
COPY maps ./maps
COPY --chmod=755 deploy/werk /usr/local/bin/werk
# empty dir owned by "node" so a fresh named volume is writable (no RUN => no emulation for arm64)
COPY --from=build --chown=node:node /out/data /data
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
