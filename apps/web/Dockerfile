# Build context: repository root. VITE_ values are public and compiled in.
FROM oven/bun:1.4.0 AS build
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
ARG VITE_APP_ORIGIN
ARG VITE_WEB_ORIGIN
ENV VITE_APP_ORIGIN=$VITE_APP_ORIGIN \
    VITE_WEB_ORIGIN=$VITE_WEB_ORIGIN
RUN bun run --cwd apps/web build

FROM oven/bun:1.4.0-slim
WORKDIR /web
COPY --from=build /repo/apps/web/.output ./.output
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3002
EXPOSE 3002
CMD ["bun", ".output/server/index.mjs"]
