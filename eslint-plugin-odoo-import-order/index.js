"use strict";

/**
 * Import ordering for Odoo JS modules.
 *
 * Three groups, in this order:
 *   1. external  - modules of another addon      ("@web/core/registry" from inside html_editor)
 *   2. internal  - modules of the current addon  ("@html_editor/utils/dom", then "./plugin")
 *   3. owl       - "@odoo/owl"
 *
 * Within a group the import statements are ordered alphabetically by source, and
 * the named specifiers of a single statement are ordered alphabetically too.
 */

// `group` drives the blank line kept between groups, `rank` drives the ordering:
// inside the internal group the aliases of the addon come before its relative paths.
const KINDS = {
    external: { group: "external", rank: 0, label: "external (other addon)" },
    internal: { group: "internal", rank: 1, label: "internal (same addon)" },
    relative: { group: "internal", rank: 2, label: "relative" },
    owl: { group: "owl", rank: 3, label: "@odoo/owl" },
};

/** The addon a file belongs to, from its `<addon>/static/...` path. */
function addonOfFile(filename) {
    if (!filename) {
        return null;
    }
    const parts = filename.split(/[\\/]/);
    const staticIndex = parts.indexOf("static");
    return staticIndex > 0 ? parts[staticIndex - 1] : null;
}

function kindOf(source, addon) {
    if (source === "@odoo/owl") {
        return KINDS.owl;
    }
    if (source.startsWith(".")) {
        return KINDS.relative;
    }
    if (addon && (source === `@${addon}` || source.startsWith(`@${addon}/`))) {
        return KINDS.internal;
    }
    return KINDS.external;
}

/** Locale independent, so a fix is identical on every machine. */
function compareStrings(a, b) {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    if (lowerA !== lowerB) {
        return lowerA < lowerB ? -1 : 1;
    }
    if (a !== b) {
        return a < b ? -1 : 1;
    }
    return 0;
}

const BLANK_LINE = /\n[ \t]*\n/;

function compareEntries(a, b) {
    return a.kind.rank - b.kind.rank || compareStrings(a.source, b.source);
}

/** `import { a as b }` sorts on `a`; string names (`import { "a-b" as c }`) on their value. */
function specifierName(specifier) {
    return specifier.imported.name !== undefined
        ? specifier.imported.name
        : specifier.imported.value;
}

const sortImports = {
    meta: {
        type: "layout",
        docs: {
            description:
                "Order import statements by group (external, internal, @odoo/owl), alphabetically within a group, and order the named specifiers of each statement alphabetically",
        },
        fixable: "code",
        schema: [],
        messages: {
            groupOrder:
                'Import of "{{source}}" is {{group}} and must come before the {{previousGroup}} imports. Group order is: external (other addon), internal (same addon, relative paths last), @odoo/owl.',
            alphabetical:
                'Import of "{{source}}" must come before "{{previousSource}}": {{group}} imports are ordered alphabetically.',
            specifierOrder:
                'Named imports of "{{source}}" must be ordered alphabetically: {{expected}}.',
        },
    },

    create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();
        const filename = context.filename || context.getFilename();
        const addon = addonOfFile(filename);
        const text = sourceCode.getText();

        /** Text between two nodes, used to decide whether moving them around is safe. */
        function gapBefore(nodes, index) {
            return text.slice(nodes[index - 1].range[1], nodes[index].range[0]);
        }

        function checkSpecifiers(declaration) {
            const named = declaration.specifiers.filter((s) => s.type === "ImportSpecifier");
            if (named.length < 2) {
                return;
            }
            const sorted = named
                .slice()
                .sort((a, b) => compareStrings(specifierName(a), specifierName(b)));
            if (sorted.every((specifier, i) => specifier === named[i])) {
                return;
            }

            const start = named[0].range[0];
            const end = named[named.length - 1].range[1];
            // A comment inside the braces has no obvious owner once the names move.
            const hasComment = sourceCode
                .getCommentsInside(declaration)
                .some((c) => c.range[0] >= start && c.range[1] <= end);

            let joiner = ", ";
            if (text.slice(start, end).includes("\n")) {
                const lineStart = text.lastIndexOf("\n", start) + 1;
                joiner = `,\n${/^[ \t]*/.exec(text.slice(lineStart, start))[0]}`;
            }
            const replacement = sorted.map((s) => sourceCode.getText(s)).join(joiner);

            context.report({
                node: declaration,
                messageId: "specifierOrder",
                data: {
                    source: declaration.source.value,
                    expected: sorted.map(specifierName).join(", "),
                },
                fix: hasComment
                    ? null
                    : (fixer) => fixer.replaceTextRange([start, end], replacement),
            });
        }

        function checkOrder(declarations) {
            const entries = declarations.map((node) => {
                const source = node.source.value;
                return { node, source, kind: kindOf(source, addon) };
            });
            const last = entries.length - 1;

            /** Whether the statements from `from` to `to` are separated by whitespace only. */
            function movable(from, to) {
                for (let k = from + 1; k <= to; k++) {
                    if (/\S/.test(gapBefore(declarations, k))) {
                        return false;
                    }
                }
                return true;
            }

            // A file that separates its groups with a blank line keeps doing so.
            const spaced = declarations
                .slice(1)
                .some((_, i) => BLANK_LINE.test(gapBefore(declarations, i + 1)));
            const separator = (a, b) => (spaced && a !== b ? "\n\n" : "\n");

            /** The statement plus one of its gaps, keeping the wider one behind. */
            function removalRange(index) {
                const node = entries[index].node;
                if (index === 0) {
                    return [node.range[0], entries[1].node.range[0]];
                }
                if (index === last) {
                    return [entries[last - 1].node.range[1], node.range[1]];
                }
                return BLANK_LINE.test(gapBefore(declarations, index + 1)) &&
                    !BLANK_LINE.test(gapBefore(declarations, index))
                    ? [entries[index - 1].node.range[1], node.range[1]]
                    : [node.range[0], entries[index + 1].node.range[0]];
            }

            /**
             * Moves one statement to its place among the others, and leaves every other
             * line alone. Repeated passes sort the file one statement at a time.
             */
            function moveOne(fixer, index, target) {
                const moved = entries[index];
                const text = sourceCode.getText(moved.node);
                const after = separator(moved.kind.group, entries[target].kind.group);
                return [
                    // Rewriting the gap it lands in, rather than inserting into it, keeps
                    // the blank line on the boundary between two groups and off the others.
                    target === 0
                        ? fixer.insertTextBeforeRange(entries[0].node.range, text + after)
                        : fixer.replaceTextRange(
                              [
                                  entries[target - 1].node.range[1],
                                  entries[target].node.range[0],
                              ],
                              separator(entries[target - 1].kind.group, moved.kind.group) +
                                  text +
                                  after
                          ),
                    fixer.removeRange(removalRange(index)),
                ];
            }

            for (let i = 1; i <= last; i++) {
                const current = entries[i];
                const previous = entries[i - 1];
                let report = null;
                if (current.kind.rank < previous.kind.rank) {
                    report = {
                        messageId: "groupOrder",
                        data: {
                            source: current.source,
                            group: current.kind.label,
                            previousGroup: previous.kind.label,
                        },
                    };
                } else if (
                    current.kind.rank === previous.kind.rank &&
                    compareStrings(current.source, previous.source) < 0
                ) {
                    report = {
                        messageId: "alphabetical",
                        data: {
                            source: current.source,
                            previousSource: previous.source,
                            group: current.kind.label,
                        },
                    };
                }
                if (!report) {
                    continue;
                }
                // The statement sorts before its predecessor, so its place is at or before
                // it: this always stops, and always lands before the line being reported.
                let target = 0;
                while (compareEntries(current, entries[target]) >= 0) {
                    target++;
                }
                const safe = movable(Math.max(target - 1, 0), Math.min(i + 1, last));
                context.report({
                    node: current.node,
                    ...report,
                    fix: safe ? (fixer) => moveOne(fixer, i, target) : null,
                });
            }
        }

        return {
            "Program:exit"(program) {
                // A side effect import (`import "@web/foo";`) or any other statement
                // acts as a fence: its position can matter, so nothing moves across it.
                let block = [];
                for (const node of program.body) {
                    if (node.type === "ImportDeclaration") {
                        checkSpecifiers(node);
                        if (node.specifiers.length > 0) {
                            block.push(node);
                            continue;
                        }
                    }
                    if (block.length > 1) {
                        checkOrder(block);
                    }
                    block = [];
                }
                if (block.length > 1) {
                    checkOrder(block);
                }
            },
        };
    },
};

module.exports = { rules: { "sort-imports": sortImports } };
