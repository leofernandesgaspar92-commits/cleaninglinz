#!/usr/bin/env bash
# ============================================================================
#  Leco – Ein-Klick-Wiederherstellung aus einem Backup.
#    ./restore.sh                    # stellt das NEUESTE DB-Backup wieder her
#    ./restore.sh leco_db_XXXX.dump  # stellt ein bestimmtes Backup wieder her
# ============================================================================
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgres://leco:leco@localhost:5432/leco}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/backups}"

FILE="${1:-}"
if [ -z "$FILE" ]; then
  FILE="$(ls -1t "$BACKUP_DIR"/leco_db_*.dump 2>/dev/null | head -1)"
elif [ ! -f "$FILE" ]; then
  FILE="$BACKUP_DIR/$FILE"
fi
[ -f "$FILE" ] || { echo "Kein Backup gefunden: $FILE"; exit 1; }

echo "⚠ Stelle Datenbank aus $FILE wieder her (bestehende Daten werden ersetzt)."
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$FILE"
echo "✓ Wiederherstellung abgeschlossen."
