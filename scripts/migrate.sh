#!/bin/bash

# ============================================================================
# DiscoveryShop Database Migration Script
# ============================================================================
# Usage: ./scripts/migrate.sh [command] [environment]
# Commands: upgrade, downgrade, current, history
# Example: ./scripts/migrate.sh upgrade production
# ============================================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
COMMAND=${1:-upgrade}
ENVIRONMENT=${2:-development}

# Determine if running in Docker or local
if command -v docker-compose &> /dev/null && docker-compose ps &>/dev/null; then
    EXEC_CMD="docker-compose exec -T backend python -m alembic"
else
    EXEC_CMD="python -m alembic"
fi

log_info "Running migrations in ${ENVIRONMENT} environment"
log_info "Command: ${COMMAND}"

case "${COMMAND}" in
    upgrade)
        log_info "Upgrading database to latest version..."
        eval "${EXEC_CMD} upgrade head"
        log_success "Database upgraded successfully"
        ;;

    downgrade)
        log_info "Rolling back to previous migration..."
        eval "${EXEC_CMD} downgrade -1"
        log_success "Database rolled back successfully"
        ;;

    current)
        log_info "Current migration version:"
        eval "${EXEC_CMD} current"
        ;;

    history)
        log_info "Migration history:"
        eval "${EXEC_CMD} history"
        ;;

    create)
        if [ -z "$3" ]; then
            log_error "Migration name required: ./scripts/migrate.sh create development 'migration_name'"
            exit 1
        fi
        log_info "Creating migration: $3"
        eval "${EXEC_CMD} revision --autogenerate -m '$3'"
        log_success "Migration created successfully"
        ;;

    *)
        log_error "Unknown command: ${COMMAND}"
        echo "Available commands:"
        echo "  upgrade      - Upgrade to latest migration"
        echo "  downgrade    - Roll back one migration"
        echo "  current      - Show current migration"
        echo "  history      - Show migration history"
        echo "  create       - Create new migration (requires name)"
        exit 1
        ;;
esac

exit 0
