# Se construye desde la raíz del monorepo:
#   docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
# Los package.json de todos los workspaces, para que el lockfile cuadre
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @genon/shared -w @genon/api --include-workspace-root --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @genon/shared && npm run build -w @genon/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @genon/shared -w @genon/api --include-workspace-root --omit=dev --ignore-scripts
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/main.js"]
