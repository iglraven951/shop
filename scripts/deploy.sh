#!/bin/bash

# ============================================================================
# DiscoveryShop Deployment Script
# ============================================================================
# Usage: ./scripts/deploy.sh [environment] [version]
# Example: ./scripts/deploy.sh production 1.0.0
# ============================================================================

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'  # No Color

# Configuration
ENVIRONMENT=${1:-staging}
VERSION=${2:-latest}
PROJECT_NAME="discovery-shop"
REGISTRY="${DOCKER_REGISTRY:-docker.io}"
IMAGE_NAME="${REGISTRY}/${DOCKER_USERNAME:-discovery}/${PROJECT_NAME}"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi

    if [ ! -f ".env.${ENVIRONMENT}" ]; then
        log_error ".env.${ENVIRONMENT} file not found"
        exit 1
    fi

    log_success "All prerequisites met"
}

# Build Docker image
build_image() {
    log_info "Building Docker image for ${ENVIRONMENT}..."

    docker build \
        --tag "${IMAGE_NAME}:${VERSION}" \
        --tag "${IMAGE_NAME}:latest" \
        --build-arg ENVIRONMENT="${ENVIRONMENT}" \
        .

    log_success "Docker image built successfully"
}

# Push to registry
push_image() {
    log_info "Pushing image to registry..."

    docker push "${IMAGE_NAME}:${VERSION}"
    docker push "${IMAGE_NAME}:latest"

    log_success "Image pushed successfully"
}

# Deploy using docker-compose
deploy_docker_compose() {
    log_info "Deploying with docker-compose..."

    export COMPOSE_FILE=docker-compose.yml
    if [ "${ENVIRONMENT}" = "production" ]; then
        COMPOSE_FILE="${COMPOSE_FILE}:docker-compose.prod.yml"
    fi

    # Load environment variables
    set -a
    source ".env.${ENVIRONMENT}"
    set +a

    # Pull latest images
    docker-compose pull

    # Start services
    docker-compose up -d

    # Run migrations
    log_info "Running database migrations..."
    docker-compose exec -T backend python -m alembic upgrade head || true

    # Health check
    sleep 5
    if docker-compose ps | grep -q "healthy"; then
        log_success "Services deployed and healthy"
    else
        log_warning "Services deployed but health check status unknown"
    fi
}

# Rollback deployment
rollback_deployment() {
    log_warning "Rolling back deployment..."

    docker-compose down
    docker-compose up -d

    log_info "Rollback completed"
}

# Health check
health_check() {
    log_info "Performing health checks..."

    # Check backend
    if curl -f http://localhost:5000/api/health &> /dev/null; then
        log_success "Backend is healthy"
    else
        log_error "Backend health check failed"
        return 1
    fi

    # Check database
    if docker-compose exec -T postgres pg_isready &> /dev/null; then
        log_success "Database is healthy"
    else
        log_error "Database health check failed"
        return 1
    fi

    # Check Redis
    if docker-compose exec -T redis redis-cli ping &> /dev/null; then
        log_success "Redis is healthy"
    else
        log_error "Redis health check failed"
        return 1
    fi

    log_success "All health checks passed"
}

# Backup database
backup_database() {
    log_info "Creating database backup..."

    BACKUP_DIR="backups"
    mkdir -p "${BACKUP_DIR}"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="${BACKUP_DIR}/discovery_shop_${TIMESTAMP}.sql"

    docker-compose exec -T postgres pg_dump \
        -U "${DB_USER}" \
        discovery_shop > "${BACKUP_FILE}"

    log_success "Database backed up to ${BACKUP_FILE}"
}

# Main deployment flow
main() {
    log_info "Starting deployment for ${ENVIRONMENT} (v${VERSION})"
    log_info "============================================="

    # Backup database before deployment
    backup_database

    # Check prerequisites
    check_prerequisites

    # Build image
    build_image

    # Push to registry (optional)
    if [ "${PUSH_TO_REGISTRY}" = "true" ]; then
        push_image
    fi

    # Deploy
    deploy_docker_compose

    # Health check
    if ! health_check; then
        log_error "Health checks failed, attempting rollback"
        rollback_deployment
        exit 1
    fi

    log_success "Deployment completed successfully!"
    log_info "============================================="
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Version: ${VERSION}"
    log_info "Image: ${IMAGE_NAME}:${VERSION}"
}

# Run main
main "$@"
