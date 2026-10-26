#!/bin/sh
zero=0000000000000000000000000000000000000000
status=0

while read -r local_ref local_sha remote_ref _remote_sha; do
	[ "$local_sha" = "$zero" ] && continue

	if [ "$remote_ref" = "refs/heads/main" ]; then
		echo "Pushing to main is not allowed. Open a pull request instead." >&2
		status=1
		continue
	fi

	case "$local_ref" in
		refs/heads/*)
			branch=${local_ref#refs/heads/}
			if ! printf '%s\n' "$branch" | grep -Eq '^[a-z]{2,4}/[a-z0-9]+(-[a-z0-9]+)*$'; then
				echo "Branch '$branch' does not follow <initials>/<feature-name> (e.g. abc/uppercase-diagnostics)." >&2
				status=1
			fi
			;;
	esac
done

exit $status
