#!/bin/sh
set -eu

LOCKFILE="node_modules/.docker-package-lock.hash"

# Compute the current package-lock.json hash
current_hash() {
    sha256sum package-lock.json | awk '{print $1}'
}

install_dependencies() {
    echo "📦 Installing dependencies..."

    npm ci

    # Only write the hash if installation succeeded
    current_hash > "$LOCKFILE"

    echo "✅ Dependencies installed."
}

CURRENT_HASH="$(current_hash)"

if [ ! -d node_modules ]; then
    echo "📦 node_modules not found."
    install_dependencies

elif [ ! -f "$LOCKFILE" ]; then
    echo "📦 Dependency hash not found."
    install_dependencies

elif [ "$CURRENT_HASH" != "$(cat "$LOCKFILE")" ]; then
    echo "📦 package-lock.json changed."
    install_dependencies

else
    echo "✅ Dependencies are up to date."
fi

exec "$@"