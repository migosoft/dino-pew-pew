# --- Build: install, test, bundle client (Vite) and server (esbuild) ---
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

# --- Runtime: the server bundle is self-contained, so no node_modules needed ---
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY --from=build /src/dist-server ./dist-server
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "dist-server/server.cjs"]
