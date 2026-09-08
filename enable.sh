#!/bin/bash
# Installs the import-ordering rule, as a lint pass of its own and as an extra
# rule for the editor.
#
# It never writes into the checkout itself: the editor part relies on eslintrc
# configs cascading, so the config placed next to the checkout is merged into
# the .eslintrc.json that addons/web/tooling puts inside it. That .eslintrc.json
# and package.json stay byte for byte what web/tooling wrote, so its pre-commit
# hook keeps passing.
tooling=$(cd -- "$(dirname "$0")" &> /dev/null && pwd)
workspace=$(cd "$tooling/../.." &> /dev/null && pwd)

cd "$tooling" || exit
npm install || exit

mkdir -p "$workspace/node_modules"
ln -sfn "$tooling/eslint-plugin-odoo-import-order" \
    "$workspace/node_modules/eslint-plugin-odoo-import-order"
cp "$tooling/_eslintrc-imports.json" "$workspace/.eslintrc.json"

echo ""
echo "Import linting has been enabled in $workspace"
echo "Lint:  cd <root you want to lint> && $tooling/lint-imports.sh [paths]"
echo "Fix:   cd <root you want to lint> && $tooling/lint-imports.sh --fix [paths]"
echo ""

if [[ -d "$workspace/community" && ! -f "$workspace/community/.eslintrc.json" ]]; then
    echo "Note: web/tooling is not enabled in community"
    echo "The editor needs it to run eslint at all, so run its enable.sh too:"
    echo "  $workspace/community/addons/web/tooling/enable.sh"
    echo "Then reload the eslint server in your editor."
    echo ""
else
    echo "Reload the eslint server in your editor to pick up the new rule"
    echo ""
fi
