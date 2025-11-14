# Multi-stage Dockerfile for Brewery Digest API
# Optimized for Coolify deployment

# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Generate Prisma Client
RUN npx prisma generate

# Stage 2: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npx nx build api --prod

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app

# Add non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy dependencies from deps stage
COPY --chown=nestjs:nodejs --from=deps /app/node_modules ./node_modules
COPY --chown=nestjs:nodejs --from=deps /app/prisma ./prisma

# Copy built application from builder stage
COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /app/package*.json ./

# Copy Prisma schema for migrations
COPY --chown=nestjs:nodejs prisma ./prisma

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/apps/api/main.js"]
