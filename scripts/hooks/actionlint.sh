#!/bin/sh
# Same actionlint version as .github/workflows/ci.yml.
set -e
version=1.7.12
cache_dir="node_modules/.cache/actionlint/$version"

if command -v actionlint >/dev/null 2>&1; then
	bin=actionlint
else
	bin="$cache_dir/actionlint"
	if [ ! -x "$bin" ]; then
		mkdir -p "$cache_dir"
		(cd "$cache_dir" && bash -c "bash <(curl -fsSL https://raw.githubusercontent.com/rhysd/actionlint/v$version/scripts/download-actionlint.bash) $version" >/dev/null 2>&1) \
			|| { echo "Failed to download actionlint $version" >&2; exit 1; }
	fi
fi

"$bin" -color "$@"
