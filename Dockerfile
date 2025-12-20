# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install OpenSSL for Prisma Client and build dependencies for native modules
# Add edge repository for openssl1.1-compat if needed
RUN apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/main openssl1.1-compat || \
    apk add --no-cache openssl libc6-compat || \
    apk add --no-cache openssl
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Remove build dependencies to reduce image size (keep openssl and libc6-compat for Prisma)
RUN apk del python3 make g++

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Create logs and uploads directories and set permissions BEFORE switching user
RUN mkdir -p /app/logs /app/uploads && \
    chown -R nestjs:nodejs /app/logs /app/uploads

USER nestjs

EXPOSE 3000

CMD ["node", "dist/src/main"]

