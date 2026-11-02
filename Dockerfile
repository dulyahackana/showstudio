# syntax=docker/dockerfile:1.7
# Single image: API + fleet gateway, serving the built editor. Non-root, no dev dependencies.

FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/schema/package.json packages/schema/
COPY packages/playback/package.json packages/playback/
COPY apps/api/package.json apps/api/
COPY apps/editor/package.json apps/editor/
COPY apps/fleet-sim/package.json apps/fleet-sim/
COPY apps/godot-sim/package.json apps/godot-sim/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
# Runtime manifest: only the packages the bundle keeps external.
RUN bun -e "const p=require('./apps/api/package.json');const d=Object.fromEntries(Object.entries(p.dependencies).filter(([k])=>!k.startsWith('@studio/')));require('fs').writeFileSync('/tmp/runtime-package.json',JSON.stringify({name:'studio-runtime',private:true,type:'module',dependencies:d}))"

FROM oven/bun:1.4.4-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data \
    EDITOR_DIST=/app/editor
WORKDIR /app
COPY --from=build /tmp/runtime-package.json package.json
RUN bun install --production && rm -rf /root/.bun/install/cache
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/editor/dist ./editor
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1
CMD ["bun", "dist/server.js"]

# Dev tooling image (seed + simulated fleet) used by docker-compose.
FROM build AS tools
CMD ["bun", "apps/fleet-sim/src/main.ts"]
