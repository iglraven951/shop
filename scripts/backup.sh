#!/bin/bash

# ============================================================================
# DiscoveryShop Backup Script
# ============================================================================
# Backs up database and uploads (storage)
# Usage: ./scripts/backup.sh [environment] [keep-days]
# Example: ./scripts/backup.sh production 30
# ============================================================================

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-development}
KEEP_DAYS=${2:-30}
BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PREFIX="${ENVIRONMENT}_${TIMESTAMP}"

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

# Create backup directory
mkdir -p "${BACKUP_DIR}"

log_info "Starting backup for ${ENVIRONMENT} environment"
log_info "=============================================="

# Backup database
backup_database() {
    log_info "Backing up database..."

    DB_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_database.sql"

    if command -v docker-compose &> /dev/null && docker-compose ps &>/dev/null; then
        docker-compose exec -T postgres pg_dump \
            -U "${DB_USER:-discovery_user}" \
            discovery_shop > "${DB_FILE}"
    else
        pg_dump -U "${DB_USER:-discovery_user}" discovery_shop > "${DB_FILE}"
    fi

    # Compress backup
    gzip "${DB_FILE}"
    DB_FILE="${DB_FILE}.gz"

    FILE_SIZE=$(du -h "${DB_FILE}" | cut -f1)
    log_success "Database backed up: ${DB_FILE} (${FILE_SIZE})"
}

# Backup uploads
backup_uploads() {
    log_info "Backing up uploads..."

    if [ ! -d "uploads" ]; then
        log_info "No uploads directory found, skipping"
        return
    fi

    UPLOADS_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_uploads.tar.gz"

    tar -czf "${UPLOADS_FILE}" uploads/

    FILE_SIZE=$(du -h "${UPLOADS_FILE}" | cut -f1)
    log_success "Uploads backed up: ${UPLOADS_FILE} (${FILE_SIZE})"
}

# Upload to S3 (optional)
upload_to_s3() {
    if [ -z "${AWS_ACCESS_KEY_ID}" ] || [ -z "${AWS_SECRET_ACCESS_KEY}" ]; then
        log_info "S3 credentials not configured, skipping S3 upload"
        return
    fi

    log_info "Uploading backups to S3..."

    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not installed, skipping S3 upload"
        return
    fi

    S3_BUCKET="${S3_BACKUP_BUCKET:-discovery-shop-backups}"
    S3_PREFIX="${ENVIRONMENT}/"

    aws s3 sync "${BACKUP_DIR}/" \
        "s3://${S3_BUCKET}/${S3_PREFIX}" \
        --region "${AWS_REGION:-us-east-1}" \
        --sse AES256

    log_success "Backups uploaded to S3"
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${KEEP_DAYS} days..."

    find "${BACKUP_DIR}" -name "${ENVIRONMENT}_*" -type f -mtime +${KEEP_DAYS} -delete

    log_success "Cleanup completed"
}

# Create backup manifest
create_manifest() {
    log_info "Creating backup manifest..."

    MANIFEST_FILE="${BACKUP_DIR}/${BACKUP_PREFIX}_manifest.txt"

    cat > "${MANIFEST_FILE}" << EOF
=======================================================
DiscoveryShop Backup Manifest
=======================================================
Environment: ${ENVIRONMENT}
Timestamp: ${TIMESTAMP}
Hostname: $(hostname)
Backup Date: $(date)

Files Included:
EOF

    # Add file list
    ls -lh "${BACKUP_DIR}/${BACKUP_PREFIX}"* 2>/dev/null | \
        awk '{print $9, "(" $5 ")"}' >> "${MANIFEST_FILE}" || true

    cat >> "${MANIFEST_FILE}" << EOF

Database Info:
  Database Name: discovery_shop
  PostgreSQL Version: $(docker-compose exec -T postgres postgres --version 2>/dev/null || echo "N/A")

Restore Instructions:
  Database:
    gunzip < backup.sql.gz | psql discovery_shop

  Uploads:
    tar -xzf uploads.tar.gz

Retention: ${KEEP_DAYS} days
=======================================================
EOF

    log_success "Manifest created: ${MANIFEST_FILE}"
}

# Verify backup integrity
verify_backup() {
    log_info "Verifying backup integrity..."

    local has_errors=0

    # Check database backup
    if [ -f "${BACKUP_DIR}/${BACKUP_PREFIX}_database.sql.gz" ]; then
        if gzip -t "${BACKUP_DIR}/${BACKUP_PREFIX}_database.sql.gz" 2>/dev/null; then
            log_success "Database backup integrity verified"
        else
            log_error "Database backup is corrupted"
            has_errors=1
        fi
    fi

    # Check uploads backup
    if [ -f "${BACKUP_DIR}/${BACKUP_PREFIX}_uploads.tar.gz" ]; then
        if tar -tzf "${BACKUP_DIR}/${BACKUP_PREFIX}_uploads.tar.gz" > /dev/null 2>&1; then
            log_success "Uploads backup integrity verified"
        else
            log_error "Uploads backup is corrupted"
            has_errors=1
        fi
    fi

    return $has_errors
}

# Main backup flow
main() {
    backup_database
    backup_uploads
    create_manifest

    if verify_backup; then
        log_success "Backup verification passed"
    else
        log_error "Backup verification failed"
        exit 1
    fi

    # Optional: upload to S3
    upload_to_s3

    # Cleanup old backups
    cleanup_old_backups

    log_success "Backup completed successfully!"
    log_info "=============================================="
    log_info "Backup Location: ${BACKUP_DIR}"
    ls -lh "${BACKUP_DIR}/${BACKUP_PREFIX}"* 2>/dev/null || true
}

# Run main
main "$@"
