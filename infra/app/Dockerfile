# Stage 1: Build the application
FROM node:24-alpine AS builder

WORKDIR /app

# Use the pnpm version pinned in package.json#packageManager (via Corepack)
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install dependencies exactly as locked
RUN pnpm install --frozen-lockfile

# Copy the application source code
COPY src src
COPY static static
COPY .gitignore svelte.config.js tsconfig.json vite.config.ts ./

# Build the application
RUN pnpm run build

# Stage 2: Production image
FROM node:24-alpine

WORKDIR /app

# Copy built assets from the builder stage
COPY --from=builder /app/build build
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json ./

EXPOSE 5173

CMD ["node", "build"]
