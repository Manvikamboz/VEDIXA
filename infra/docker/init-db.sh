#!/bin/bash
# Initialize Postgres with required extensions for VEDIXA
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  CREATE EXTENSION IF NOT EXISTS "vector";
  CREATE EXTENSION IF NOT EXISTS "ltree";
  CREATE EXTENSION IF NOT EXISTS "pg_trgm";

  -- Confirm extensions installed
  SELECT extname, extversion FROM pg_extension
    WHERE extname IN ('uuid-ossp','pgcrypto','vector','ltree','pg_trgm');
EOSQL

echo "VEDIXA Postgres extensions initialized."
