# DiscoveryShop Deployment Scripts

Automated scripts for production deployment, database management, and backup operations.

## Available Scripts

### 1. **deploy.sh** - Production Deployment

Automates the entire deployment process with health checks and rollback capability.

```bash
# Deploy to staging
./scripts/deploy.sh staging latest

# Deploy to production (requires v1.0.0 tag)
./scripts/deploy.sh production 1.0.0

# Deploy with environment variable
export FLASK_ENV=production
./scripts/deploy.sh production 1.0.0
```

**What it does:**
- ✓ Checks prerequisites (Docker, docker-compose, .env file)
- ✓ Builds Docker image
- ✓ Optionally pushes to Docker registry
- ✓ Creates database backup before deployment
- ✓ Starts services with docker-compose
- ✓ Runs database migrations
- ✓ Performs health checks (backend, database, Redis)
- ✓ Rolls back if health checks fail

**Environment Variables:**
```env
PUSH_TO_REGISTRY=true          # Push to Docker Hub
DOCKER_REGISTRY=docker.io      # Registry URL
DOCKER_USERNAME=your_username  # Your Docker Hub username
```

### 2. **migrate.sh** - Database Migrations

Manages database schema migrations using Alembic.

```bash
# Upgrade to latest migration
./scripts/migrate.sh upgrade production

# Rollback one migration
./scripts/migrate.sh downgrade production

# Show current migration
./scripts/migrate.sh current production

# Show migration history
./scripts/migrate.sh history production

# Create new migration
./scripts/migrate.sh create production "add_user_preferences"
```

**Commands:**
- `upgrade` - Apply migrations up to head
- `downgrade` - Rollback one migration
- `current` - Show current migration version
- `history` - Show all migrations
- `create` - Create new migration (requires name)

**Notes:**
- Works with both Docker and local installations
- Requires Alembic to be configured (comes with setup)
- Always backup database before migrating production data

### 3. **backup.sh** - Database & File Backups

Automated backup with compression, integrity checks, and S3 upload.

```bash
# Backup production database (keep 30 days)
./scripts/backup.sh production 30

# Backup staging (keep 14 days)
./scripts/backup.sh staging 14

# Manual backup
./scripts/backup.sh development 7
```

**What it does:**
- ✓ Backs up PostgreSQL database (compressed)
- ✓ Backs up uploads folder (tar.gz)
- ✓ Creates manifest file with backup info
- ✓ Verifies backup integrity (gzip, tar)
- ✓ Uploads to S3 (if configured)
- ✓ Cleans up old backups automatically

**Backup Location:**
```
backups/
├── production_20240115_103000_database.sql.gz
├── production_20240115_103000_uploads.tar.gz
└── production_20240115_103000_manifest.txt
```

**Restore from Backup:**

```bash
# Restore database
gunzip < backups/production_*.sql.gz | psql discovery_shop

# Restore uploads
tar -xzf backups/production_*.tar.gz
```

**S3 Configuration (Optional):**
```bash
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1
export S3_BACKUP_BUCKET=discovery-shop-backups
export BACKUP_TO_S3=true

./scripts/backup.sh production 30
```

## Prerequisites

All scripts require:
- Bash shell (Unix/Mac) or WSL (Windows)
- Docker & Docker Compose installed
- `.env` file configured for your environment
- SSH access (for remote deployments)

## Setup

Make scripts executable:

```bash
chmod +x scripts/*.sh
```

## Environment Configuration

Create environment-specific files:

```bash
# Development
cp .env.example .env.development
# Edit .env.development

# Staging
cp .env.example .env.staging
# Edit .env.staging

# Production
cp .env.production.example .env.production
# Edit .env.production (with real credentials!)
```

## Deployment Workflow

### 1. **Development**
```bash
# Run locally (no Docker)
python backend/app.py

# Or with Docker
docker-compose up -d
```

### 2. **Staging**
```bash
# Build and deploy to staging server
./scripts/deploy.sh staging latest

# Check logs
docker-compose logs -f backend
```

### 3. **Production**
```bash
# Tag release
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# CI/CD auto-deploys with GitHub Actions
# Or manual deploy:
./scripts/deploy.sh production 1.0.0
```

## Health Checks

After deployment, verify services are healthy:

```bash
# API health
curl http://localhost:5000/api/health

# Database
docker-compose exec postgres pg_isready

# Redis
docker-compose exec redis redis-cli ping

# View logs
docker-compose logs -f backend
```

## Rollback

If deployment fails:

```bash
# Manual rollback
docker-compose down
docker pull discovery-shop:previous-tag
docker-compose up -d
```

## Monitoring

Monitor running deployments:

```bash
# Check container status
docker-compose ps

# View resource usage
docker stats

# Stream logs
docker-compose logs -f backend --tail=100

# View PostgreSQL logs
docker-compose logs postgres

# View Redis logs
docker-compose logs redis
```

## Troubleshooting

### Deploy script fails

```bash
# Check prerequisites
docker --version
docker-compose --version
ls -la .env.production

# Check Docker daemon
docker ps

# Verify network connectivity
curl https://registry.docker.io/
```

### Database migration fails

```bash
# Check current state
./scripts/migrate.sh current production

# View migration history
./scripts/migrate.sh history production

# Manual check
docker-compose exec postgres psql -U discovery_user discovery_shop
```

### Backup fails

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres pg_isready

# Check disk space
df -h

# Manual backup
docker-compose exec postgres pg_dump -U discovery_user discovery_shop > backup.sql
```

## Best Practices

1. **Always backup before production changes**
   ```bash
   ./scripts/backup.sh production 30
   ```

2. **Test deployments in staging first**
   ```bash
   ./scripts/deploy.sh staging latest
   ```

3. **Keep automated backups running**
   ```bash
   # Add to crontab (daily at 2 AM)
   0 2 * * * cd /app && ./scripts/backup.sh production 30
   ```

4. **Monitor logs regularly**
   ```bash
   docker-compose logs --tail=50 backend
   ```

5. **Test disaster recovery**
   ```bash
   # Monthly: restore backup in test environment
   gunzip < backups/production_*.sql.gz | psql discovery_shop_test
   ```

## Scheduling with Cron

Set up automated backups and deployments:

```bash
# Edit crontab
crontab -e

# Add backup schedule (daily at 2 AM)
0 2 * * * cd /app && ./scripts/backup.sh production 30 >> logs/backup.log 2>&1

# Add database optimization (weekly)
0 3 * * 0 cd /app && docker-compose exec postgres vacuumdb -U discovery_user discovery_shop

# Add log rotation (monthly)
0 0 1 * * cd /app && find logs -name "*.log" -mtime +30 -delete
```

## Support

For issues or questions:
- Check `.claude/architecture/DEPLOYMENT.md` for detailed guide
- Review logs: `docker-compose logs -f backend`
- GitHub Issues: Report bugs and feature requests

---

**Last Updated:** 2024-01-15
**Version:** 1.0.0
