#!/bin/sh
set -eu

LOCKFILE="node_modules/.docker-package-lock.hash"

# Compute the current package-lock.json hash. Avoids a pipe so a failure
# reading the lockfile (e.g. it's missing) propagates under `set -e` instead
# of being masked by awk's own (successful) exit status.
current_hash() {
    hash_and_name="$(sha256sum package-lock.json)"
    echo "${hash_and_name%% *}"
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