#!/bin/sh
msg_file="$1"
body=$(grep -v '^#' "$msg_file")
subject=$(printf '%s\n' "$body" | sed -n '1p')

case "$subject" in
	"Merge "* | "Revert "* | "fixup! "* | "squash! "* | "amend! "*) exit 0 ;;
esac

fail() {
	echo "Invalid commit message: $1" >&2
	echo "" >&2
	echo "Expected:" >&2
	echo "  feature|fix|test|chore: short message without final period" >&2
	echo "" >&2
	echo "  AI-assisted: yes (<model>)   or   AI-assisted: no" >&2
	exit 1
}

printf '%s\n' "$subject" | grep -Eq '^(feature|fix|test|chore): [^ ]' \
	|| fail "subject must start with 'feature: ', 'fix: ', 'test: ' or 'chore: '"

case "$subject" in
	*.) fail "subject must not end with a period" ;;
esac

[ "${#subject}" -le 72 ] || fail "subject is longer than 72 characters"

printf '%s\n' "$body" | grep -Eq '^AI-assisted: (yes \(.+\)|no)$' \
	|| fail "missing 'AI-assisted: yes (<model>)' or 'AI-assisted: no' trailer"
