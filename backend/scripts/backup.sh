#!/usr/bin/env bash
# ============================================================================
#  Leco – automatisches Backup (PostgreSQL + Dokumentenablage)
#
#  Erstellt einen komprimierten, mit Zeitstempel versehenen Dump der Datenbank
#  sowie ein Archiv der Dokumentenablage. Hält die letzten N Backups vor
#  (Rotation) und ist für einen täglichen Cron-Job gedacht:
#
#    0 2 * * *  /pfad/zu/backend/scripts/backup.sh >> /var/log/leco-backup.log 2>&1
#
#  Für Point-in-Time-Recovery zusätzlich WAL-Archivierung am DB-Server aktivieren
#  (archive_mode=on); Georedundanz durch Sync des BACKUP_DIR in Cloud-Storage
#  (z.B. `aws s3 sync`, `rclone`) – siehe README.
# ============================================================================
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://leco:leco@localhost:5432/leco}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/backups}"
DOCS_DIR="${DOCS_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/documents}"
KEEP="${BACKUP_KEEP:-14}"          # so viele Backups behalten
TS="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] Backup startet → $BACKUP_DIR"

# 1) Datenbank (custom-Format, komprimiert – ideal für pg_restore/Teilwiederherstellung)
DB_FILE="$BACKUP_DIR/leco_db_$TS.dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$DB_FILE"
echo "  ✓ Datenbank: $(basename "$DB_FILE") ($(du -h "$DB_FILE" | cut -f1))"

# 2) Dokumentenablage (falls vorhanden)
if [ -d "$DOCS_DIR" ]; then
  DOCS_FILE="$BACKUP_DIR/leco_docs_$TS.tar.gz"
  tar -czf "$DOCS_FILE" -C "$(dirname "$DOCS_DIR")" "$(basename "$DOCS_DIR")"
  echo "  ✓ Dokumente: $(basename "$DOCS_FILE")"
fi

# 3) Prüfsumme für Integrität
sha256sum "$BACKUP_DIR"/*_"$TS".* > "$BACKUP_DIR/checksums_$TS.sha256" 2>/dev/null || true

# 4) Rotation: nur die letzten $KEEP DB-Backups behalten
ls -1t "$BACKUP_DIR"/leco_db_*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  base="$(basename "$old" .dump | sed 's/leco_db_//')"
  rm -f "$BACKUP_DIR"/*_"$base".* "$BACKUP_DIR"/checksums_"$base".sha256
  echo "  ⟲ altes Backup entfernt: $base"
done

echo "[$(date -Is)] Backup fertig."
