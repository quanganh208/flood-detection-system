#!/bin/bash

# =============================================================================
# Deploy Script for Flood Detection System
# Server: quanganh208@20.196.136.4
# =============================================================================

set -e

# Configuration
SSH_KEY="/Users/quanganh208/.ssh/id_quanganh208"
SERVER_USER="quanganh208"
SERVER_IP="20.196.136.4"
REMOTE_DIR="/home/quanganh208/flood-detection-system"
LOCAL_SOURCE="."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# SSH command helper
ssh_cmd() {
    ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "$1"
}

# SCP command helper
scp_cmd() {
    scp -i "$SSH_KEY" -r "$1" "$SERVER_USER@$SERVER_IP:$2"
}

# Check SSH connection
check_connection() {
    log_info "Checking SSH connection..."
    if ssh_cmd "echo 'Connection successful'" > /dev/null 2>&1; then
        log_success "SSH connection established"
    else
        log_error "Cannot connect to server"
        exit 1
    fi
}

# Setup server environment
setup_server() {
    log_info "Setting up server environment..."

    ssh_cmd "
        # Install Docker if not exists
        if ! command -v docker &> /dev/null; then
            echo 'Installing Docker...'
            curl -fsSL https://get.docker.com -o get-docker.sh
            sudo sh get-docker.sh
            sudo usermod -aG docker \$USER
            rm get-docker.sh
        fi

        # Install Docker Compose if not exists
        if ! command -v docker-compose &> /dev/null; then
            echo 'Installing Docker Compose...'
            sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
        fi

        # Create project directory
        mkdir -p $REMOTE_DIR

        echo 'Server setup complete'
    "

    log_success "Server environment ready"
}

# Upload source code
upload_code() {
    log_info "Uploading source code to server..."

    # Create tarball excluding unnecessary files
    log_info "Creating archive..."
    tar -czf /tmp/flood-detection.tar.gz \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='dist' \
        --exclude='.DS_Store' \
        --exclude='*.log' \
        -C "$LOCAL_SOURCE" .

    # Upload tarball
    log_info "Uploading archive..."
    scp -i "$SSH_KEY" /tmp/flood-detection.tar.gz "$SERVER_USER@$SERVER_IP:/tmp/"

    # Extract on server
    log_info "Extracting on server..."
    ssh_cmd "
        rm -rf $REMOTE_DIR/*
        tar -xzf /tmp/flood-detection.tar.gz -C $REMOTE_DIR
        rm /tmp/flood-detection.tar.gz
    "

    # Cleanup local
    rm /tmp/flood-detection.tar.gz

    log_success "Source code uploaded"
}

# Create production environment file
create_env() {
    log_info "Creating production environment file..."

    ssh_cmd "cat > $REMOTE_DIR/server/.env << 'EOF'
NODE_ENV=production
PORT=3000

# Database (Docker mode)
DATABASE_URL=postgresql://flood_user:flood_password@postgres:5432/flood_detection?schema=public

# PlatformIO Builder Service (Docker mode)
PLATFORMIO_BUILDER_URL=http://platformio-builder:5000

# MQTT Broker (Docker mode)
MQTT_BROKER_URL=mqtt://mosquitto:1883
MQTT_USERNAME=
MQTT_PASSWORD=
EOF"

    log_success "Environment file created"
}

# Create production docker-compose
create_docker_compose_prod() {
    log_info "Creating production docker-compose..."

    ssh_cmd "cat > $REMOTE_DIR/docker-compose.prod.yml << 'EOF'
services:
  # NestJS Server - Main API
  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: flood-server
    ports:
      - \"3000:3000\"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MQTT_BROKER_URL=mqtt://mosquitto:1883
      - PLATFORMIO_BUILDER_URL=http://platformio-builder:5000
      - DATABASE_URL=postgresql://flood_user:flood_password@postgres:5432/flood_detection?schema=public
      - FIREBASE_SERVICE_ACCOUNT_PATH=/app/firebase-adminsdk.json
    volumes:
      - ./server/firebase-adminsdk.json:/app/firebase-adminsdk.json:ro
      - firmware-storage:/storage/firmware
      - uploads-storage:/storage/uploads
    depends_on:
      postgres:
        condition: service_healthy
      platformio-builder:
        condition: service_started
    networks:
      - flood-network
    restart: unless-stopped

  # PlatformIO Builder Service
  platformio-builder:
    build:
      context: ./docker/platformio-builder
      dockerfile: Dockerfile
    container_name: platformio-builder
    ports:
      - \"5001:5000\"
    volumes:
      - platformio-builds:/builds
      - platformio-cache:/root/.platformio
    networks:
      - flood-network
    restart: unless-stopped

  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: flood-postgres
    ports:
      - \"5432:5432\"
    environment:
      - POSTGRES_USER=flood_user
      - POSTGRES_PASSWORD=flood_password
      - POSTGRES_DB=flood_detection
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - flood-network
    restart: unless-stopped
    healthcheck:
      test: [\"CMD-SHELL\", \"pg_isready -U flood_user -d flood_detection\"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MQTT Broker
  mosquitto:
    image: eclipse-mosquitto:2
    container_name: mosquitto
    ports:
      - \"1883:1883\"
      - \"9001:9001\"
    volumes:
      - mosquitto-data:/mosquitto/data
      - mosquitto-log:/mosquitto/log
    networks:
      - flood-network
    restart: unless-stopped
    command: mosquitto -c /mosquitto-no-auth.conf

networks:
  flood-network:
    driver: bridge

volumes:
  platformio-cache:
  platformio-builds:
  postgres-data:
  firmware-storage:
  uploads-storage:
  mosquitto-config:
  mosquitto-data:
  mosquitto-log:
EOF"

    log_success "Production docker-compose created"
}

# Update Dockerfile for production
update_dockerfile_prod() {
    log_info "Updating Dockerfile for production..."

    ssh_cmd "cat > $REMOTE_DIR/server/Dockerfile << 'EOF'
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY . .

# Build NestJS app
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts

# Copy Prisma schema and migrations
COPY prisma ./prisma
RUN npx prisma generate

# Copy built app from builder stage
COPY --from=builder /app/dist ./dist

# Copy public folder for static files
COPY public ./public

# Expose port
EXPOSE 3000

# Start server in production mode
CMD [\"node\", \"dist/src/main.js\"]
EOF"

    log_success "Dockerfile updated for production"
}

# Deploy application
deploy() {
    log_info "Deploying application..."

    ssh_cmd "
        cd $REMOTE_DIR

        # Stop existing containers
        docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

        # Build and start containers
        docker-compose -f docker-compose.prod.yml build --no-cache
        docker-compose -f docker-compose.prod.yml up -d

        # Wait for services to be healthy
        echo 'Waiting for services to start...'
        sleep 15

        # Run database migrations (apply SQL directly since prisma config issue)
        echo 'Applying database migrations...'
        if [ -f $REMOTE_DIR/server/prisma/migrations/20251118125013_init/migration.sql ]; then
            cat $REMOTE_DIR/server/prisma/migrations/20251118125013_init/migration.sql | docker exec -i flood-postgres psql -U flood_user -d flood_detection 2>/dev/null || true
        fi

        # Show status
        docker-compose -f docker-compose.prod.yml ps
    "

    log_success "Application deployed"
}

# Show logs
show_logs() {
    log_info "Showing application logs..."
    ssh_cmd "cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml logs -f --tail=100"
}

# Check status
check_status() {
    log_info "Checking application status..."
    ssh_cmd "
        cd $REMOTE_DIR
        docker-compose -f docker-compose.prod.yml ps
        echo ''
        echo 'Health check:'
        curl -s http://localhost:3000/health || echo 'Server not responding yet'
    "
}

# Stop application
stop() {
    log_info "Stopping application..."
    ssh_cmd "cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml down"
    log_success "Application stopped"
}

# Restart application
restart() {
    log_info "Restarting application..."
    ssh_cmd "cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml restart"
    log_success "Application restarted"
}

# Clean up Docker resources
cleanup() {
    log_info "Cleaning up Docker resources..."
    ssh_cmd "
        docker system prune -af
        docker volume prune -f
    "
    log_success "Cleanup complete"
}

# Full deployment
full_deploy() {
    log_info "Starting full deployment..."
    echo ""

    check_connection
    setup_server
    upload_code
    create_env
    create_docker_compose_prod
    update_dockerfile_prod
    deploy

    echo ""
    log_success "Deployment completed successfully!"
    echo ""
    echo -e "${GREEN}Application is running at:${NC}"
    echo -e "  - API: http://$SERVER_IP:3000"
    echo -e "  - MQTT: mqtt://$SERVER_IP:1883"
    echo -e "  - WebSocket: ws://$SERVER_IP:9001"
    echo ""
}

# Quick deploy (only upload and restart)
quick_deploy() {
    log_info "Starting quick deployment..."
    echo ""

    check_connection
    upload_code
    create_env
    create_docker_compose_prod
    update_dockerfile_prod

    ssh_cmd "
        cd $REMOTE_DIR
        docker-compose -f docker-compose.prod.yml build server --no-cache
        docker-compose -f docker-compose.prod.yml up -d server
    "

    log_success "Quick deployment completed!"
}

# Print usage
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  deploy      Full deployment (default)"
    echo "  quick       Quick deploy (upload code and restart server only)"
    echo "  setup       Setup server environment only"
    echo "  upload      Upload code only"
    echo "  start       Start application"
    echo "  stop        Stop application"
    echo "  restart     Restart application"
    echo "  status      Check application status"
    echo "  logs        Show application logs"
    echo "  cleanup     Clean up Docker resources"
    echo "  ssh         SSH into server"
    echo ""
}

# Main
case "${1:-deploy}" in
    deploy)
        full_deploy
        ;;
    quick)
        quick_deploy
        ;;
    setup)
        check_connection
        setup_server
        ;;
    upload)
        check_connection
        upload_code
        ;;
    start)
        check_connection
        ssh_cmd "cd $REMOTE_DIR && docker-compose -f docker-compose.prod.yml up -d"
        ;;
    stop)
        check_connection
        stop
        ;;
    restart)
        check_connection
        restart
        ;;
    status)
        check_connection
        check_status
        ;;
    logs)
        check_connection
        show_logs
        ;;
    cleanup)
        check_connection
        cleanup
        ;;
    ssh)
        ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP"
        ;;
    *)
        usage
        exit 1
        ;;
esac
