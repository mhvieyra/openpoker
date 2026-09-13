FROM node:20-slim AS build
WORKDIR /repo

COPY package.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm install --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/engine packages/engine
COPY packages/shared packages/shared
COPY apps/server apps/server

RUN npm run build --workspace packages/engine \
 && npm run build --workspace packages/shared \
 && npm run build --workspace apps/server

FROM node:20-slim
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/package.json package.json
COPY --from=build /repo/packages/engine packages/engine
COPY --from=build /repo/packages/shared packages/shared
COPY --from=build /repo/apps/server apps/server

EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]
