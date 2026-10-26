#!/bin/sh
branch=$(git symbolic-ref --quiet --short HEAD) || exit 0

if [ "$branch" = "main" ]; then
	echo "Commits on main are not allowed. Create a branch: git switch -c <initials>/<feature-name>" >&2
	exit 1
fi
