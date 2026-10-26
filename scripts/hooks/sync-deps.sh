#!/bin/sh
# Runs `npm ci` when a package-lock.json changed between two revisions.
old="$1"
new="$2"
checkout_type="$3"

[ "$checkout_type" = "0" ] && exit 0
[ -d "$(git rev-parse --git-path rebase-merge)" ] && exit 0
[ -d "$(git rev-parse --git-path rebase-apply)" ] && exit 0
git rev-parse --quiet --verify "$old^{commit}" >/dev/null || exit 0

if git diff --quiet "$old" "$new" -- package-lock.json '*/package-lock.json'; then
	exit 0
fi

echo "package-lock.json changed, running npm ci..."
npm ci
