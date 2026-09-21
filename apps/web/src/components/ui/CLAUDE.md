# components/ui — vendored, unadopted

React Aria registry output (`components.json` points the CLI here). Source you
paste in and then own, not a library — and nothing in this app imports any of
it today.

It is excluded from `tsc` (`tsconfig.app.json`) and from eslint
(`eslint.config.js`): it was generated against laxer settings than this
project uses — no `verbatimModuleSyntax`, no `noUnusedLocals` — and the CLI
rewrites these files, so fixing them in place would lose the fixes on the next
`add`.

**To adopt a component:** move it into `presentation/atoms|molecules|organisms`
following the Atomic Design layout in `src/CLAUDE.md`, give it the project's
declarative props instead of React Aria's directly, and bring it up to house
style. That copy is type-checked and linted like everything else. Leave this
folder as the staging area it is.

The alternative is deleting it — nothing depends on it.
