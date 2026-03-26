#!/bin/sh
set -e

echo "Starting Web Analytics Pro..."

# Wait for database to be ready (optional, but good practice)
# We assume the database is up based on compose depends_on, but doing a quick push ensures schema is updated
echo "Running database migrations..."
npx drizzle-kit push

echo "Starting Next.js server..."
exec node server.js
