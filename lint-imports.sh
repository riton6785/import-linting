#!/bin/bash
# Runs ONLY the import-ordering rule, over the paths given (default: the current
# directory). Run it from the root you want to lint, so the .eslintignore of that
# root applies. Any eslint flag is forwarded, --fix included.
tooling=$(cd -- "$(dirname "$0")" &> /dev/null && pwd)

if [[ ! -x "$tooling/node_modules/.bin/eslint" ]]; then
    echo "Import linting is not enabled. Run $tooling/enable.sh first."
    exit 1
fi

args=("$@")
hasTarget=false
for arg in "$@"; do
    if [[ $arg != -* ]]; then
        hasTarget=true
    fi
done
if [[ $hasTarget == false ]]; then
    args+=(".")
fi

exec "$tooling/node_modules/.bin/eslint" \
    --no-eslintrc \
    --resolve-plugins-relative-to "$tooling" \
    -c "$tooling/_eslintrc-imports.json" \
    "${args[@]}"
