# Import ordering lint

An extra ESLint rule for Odoo JS, `odoo-import-order/sort-imports`, that keeps the import
block at the top of a file in a predictable order. It is a **layer on top of** the standard
Odoo linter in `community/addons/web/tooling` — that one still owns all the core rules, this
one only looks at import order.

## Where this folder lives

The layout matters: `enable.sh` finds the workspace root by going up two directories from
itself, and writes its config and plugin symlink there. So this folder has to sit one level
inside a directory that is a sibling of your checkout:

```
~/odoo19/                  <- workspace root
├── community/
└── custom/                <- your own code, sibling of the checkout
    └── import-linting/    <- this folder
```

`custom/` is the usual home for anything of your own that is not part of a checkout. If you
do not have one, create it next to `community/` and put this folder in it. Any other name
works as long as the nesting stays the same (`<workspace>/<anything>/import-linting/`).

## Setup

Order matters: the Odoo linter installs eslint itself, so it has to go first.

```bash
# 1. the standard Odoo linter (skip if you already run it)
~/odoo19/community/addons/web/tooling/enable.sh

# 2. this rule on top
~/odoo19/custom/import-linting/enable.sh
```

Then reload the editor's linter: command palette → **"ESLint: Restart ESLint Server"**.
You now get red squiggles and quick fixes for import order alongside the core Odoo ones.

To turn it off again:

```bash
~/odoo19/custom/import-linting/disable.sh    # this rule only
```

The Odoo linter keeps working; disable it separately with its own `disable.sh` if you want.

## What it enforces

Three groups, in this order, alphabetical inside each one, plus alphabetical named
specifiers within a single statement:

1. **external** — a module of *another* addon (`@web/…` seen from `html_editor`)
2. **internal** — a module of the *current* addon (`@html_editor/…`, then relative `./…`)
3. **owl** — `@odoo/owl`

The addon a file belongs to comes from its path (`<addon>/static/…`), and that is what
tells external from internal.

Before:

```js
// addons/html_editor/static/src/main/foo.js
import { Component, useState } from "@odoo/owl";
import { withSequence } from "@html_editor/utils/resource";
import { Plugin } from "./plugin";
import { selectElements, childNodes, closestElement } from "@html_editor/utils/dom_traversal";
import { user } from "@web/core/user";
import { registry } from "@web/core/registry";
```

After:

```js
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { childNodes, closestElement, selectElements } from "@html_editor/utils/dom_traversal";
import { withSequence } from "@html_editor/utils/resource";
import { Plugin } from "./plugin";
import { Component, useState } from "@odoo/owl";
```

Blank lines between groups are optional. A file that already has them keeps them; the rule
never adds them to a file that does not.

## Using it

In the editor, hover a flagged import and pick **"Fix this odoo-import-order/sort-imports
problem"**. Each problem carries its own fix and moves **only that one statement** — the
misplaced line below it stays put and is reported separately, so you fix them one at a time.
("Fix all auto-fixable problems" sorts the whole file in one go.)

From the command line, run it from the root you want to lint so that root's `.eslintignore`
applies:

```bash
cd ~/odoo19/community
~/odoo19/custom/import-linting/lint-imports.sh addons/html_editor          # report
~/odoo19/custom/import-linting/lint-imports.sh --fix addons/html_editor    # fix
```

With no path it lints `.`. Other eslint flags are passed through.

## What it reports but will not autofix

- a comment between the statement and where it has to land — moving the line would silently
  change which import the comment belongs to;
- anything sitting in the middle of the import block — a side-effect import
  (`import "@web/foo";`) or a plain statement. Its position can matter, so it acts as a
  fence and nothing is reordered across it.

Fix those by hand.

## If nothing is reported

- **No squiggles at all, for any rule.** The Odoo linter is not enabled — it is what
  installs eslint. Run step 1 of Setup.
- **Squiggles, but import order behaves like an older version of the rule.** The eslint
  server caches the plugin for the life of its process. Run "ESLint: Restart ESLint Server"
  in *every* open window — each window runs its own server and the command only restarts
  the focused one.
