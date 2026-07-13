FROM node:22-bookworm-slim AS build

WORKDIR /server

COPY package.json package-lock.json ./
COPY apps/medusa/package.json apps/medusa/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace @fotomax/medusa --include-workspace-root

COPY tsconfig.base.json ./
COPY apps/medusa apps/medusa
COPY packages/shared packages/shared
RUN npm run build --workspace @fotomax/medusa

RUN mkdir -p /server/apps/medusa/packages \
  && cp -R /server/packages/shared /server/apps/medusa/packages/shared

WORKDIR /server/apps/medusa/.medusa/server
RUN npm install --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /server

COPY --from=build /server/apps/medusa/.medusa/server ./

EXPOSE 9000
CMD ["npm", "run", "start:container"]
