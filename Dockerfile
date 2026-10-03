# Stage 1: Build Environment
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install python and build tools required for sqlite3 native compilation
RUN apk add --no-cache python3 make g++

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install production dependencies
# This will build native modules (like sqlite3) using the installed tools
RUN npm install --omit=dev

# Stage 2: Minimal Production Environment
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy the rest of the application source code
COPY . .

# Copy only the compiled node_modules from the builder stage AFTER COPY . .
# This guarantees we use the Alpine-compiled binaries and not host binaries
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Create uploads directory (needed for multer)
RUN mkdir -p uploads

# Expose the API port
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
