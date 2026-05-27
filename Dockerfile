FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/data
EXPOSE 4000
CMD ["node", "backend/dist/index.js"]
