#!/bin/sh
# Wires up the repo-tracked hooks. Run once after a fresh clone:
#   sh scripts/install-hooks.sh
git config --local core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null
echo "✓ pre-commit secret scan active (.githooks/pre-commit)"
