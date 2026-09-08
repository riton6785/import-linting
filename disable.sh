#!/bin/bash
# Removes the import-ordering rule.
tooling=$(cd -- "$(dirname "$0")" &> /dev/null && pwd)
workspace=$(cd "$tooling/../.." &> /dev/null && pwd)

if cmp -s -- "$tooling/_eslintrc-imports.json" "$workspace/.eslintrc.json"; then
    rm -f "$workspace/.eslintrc.json"
else
    echo "Left $workspace/.eslintrc.json alone: it is not the file enable.sh wrote"
fi
rm -f "$workspace/node_modules/eslint-plugin-odoo-import-order"
rmdir "$workspace/node_modules" 2> /dev/null

cd "$tooling" || exit
rm -rf node_modules
rm -f package-lock.json

echo ""
echo "Import linting has been removed"
echo "Reload the eslint server in your editor"
echo ""
