# Build context: repository root. VITE_ values are public and compiled in.
FROM oven/bun:1.4.0 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
ARG VITE_API_ORIGIN
ARG VITE_APP_ORIGIN
ARG VITE_WEB_ORIGIN
ENV VITE_API_ORIGIN=$VITE_API_ORIGIN \
    VITE_APP_ORIGIN=$VITE_APP_ORIGIN \
    VITE_WEB_ORIGIN=$VITE_WEB_ORIGIN
RUN bun run --cwd apps/app build

FROM oven/bun:1.4.0-slim
WORKDIR /app
COPY --from=build /repo/apps/app/.output ./.output
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
