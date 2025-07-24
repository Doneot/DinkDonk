#!/bin/bash
set -e

git tag -d deploy-discord 2>/dev/null || true
git push origin :refs/tags/deploy-discord 2>/dev/null || true

git tag deploy-discord
git push origin deploy-discord
