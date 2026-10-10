# syntax=docker/dockerfile:1
# Reconstructed from the running quay.io/hedgedoc/hedgedoc:1.12.0 image
# (see original_dockerfile.txt) with the build process switched to pnpm.

########## build stage ##########
FROM node:20-bullseye AS build
WORKDIR /build

# pnpm is pinned via the packageManager field in package.json
RUN corepack enable

# install dependencies first so they are cached between source changes
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# build the frontend bundles, then drop devDependencies for the runtime image
COPY . .
RUN pnpm build \
 && pnpm prune --prod

########## runtime stage ##########
FROM node:20-bullseye

LABEL org.opencontainers.image.title="HedgeDoc production image (debian)"
LABEL org.opencontainers.image.url="https://hedgedoc.org"
LABEL org.opencontainers.image.source="https://github.com/hedgedoc/container"
LABEL org.opencontainers.image.documentation="https://github.com/hedgedoc/container/blob/master/README.md"
LABEL org.opencontainers.image.licenses="AGPL-3.0"

WORKDIR /hedgedoc
ARG UID=10000
ARG GID=10000
ENV NODE_ENV=production
ENV UPLOADS_MODE=0700

RUN echo "deb http://archive.debian.org/debian bullseye main" > /etc/apt/sources.list \
 && echo "deb http://archive.debian.org/debian-security bullseye-security main" >> /etc/apt/sources.list \
 && apt-get update -o Acquire::Check-Valid-Until=false \
 && apt-get install --no-install-recommends -y gosu \
 && rm -r /var/lib/apt/lists/*

RUN addgroup --gid $GID hedgedoc \
 && adduser --uid $UID --ingroup hedgedoc --home /hedgedoc/ --disabled-password --system hedgedoc

COPY --from=build --chown=10000:10000 /build /hedgedoc

# The container config is just a bind-mount target (the image is configured
# via CMD_* env vars), so create it here instead of COPY: this keeps the build
# independent of untracked files in the build context.
RUN mkdir -p /files \
 && printf '{}\n' > /files/config.json

COPY --chown=10000:10000 resources/healthcheck.mjs /hedgedoc/healthcheck.mjs

HEALTHCHECK --interval=15s CMD node healthcheck.mjs

RUN ln -s /hedgedoc /codimd \
 && rm -f /hedgedoc/config.json \
 && ln -s /files/config.json /hedgedoc/config.json

EXPOSE 3000

COPY resources/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "app.js"]
