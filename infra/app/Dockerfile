# Stage 1: Build the application
FROM node:24-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install dependencies
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

COPY infra/app/config config

EXPOSE 5173

CMD ["node", "build"]
