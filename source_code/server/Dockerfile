FROM node:20-alpine

# Install git for husky hooks setup
RUN apk add --no-cache git

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY . .

# Build NestJS app
RUN npm run build

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "run", "start:dev"]
