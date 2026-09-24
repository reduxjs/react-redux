# React Redux docs

The pages in this folder are published as part of the combined Redux docs site, at https://redux.js.org/react-redux. The site itself (Docusaurus config, theme, search, redirects, build scripts) lives in the [`reduxjs/redux`](https://github.com/reduxjs/redux) repo under `website/`. This folder holds only the React Redux pages.

## What lives where

| What                                                                 | Where                                       |
| -------------------------------------------------------------------- | ------------------------------------------- |
| React Redux pages                                                    | `docs/**/*.{md,mdx}` in this repo           |
| React Redux sidebar                                                  | `docs/sidebars.ts` in this repo             |
| Images used by these pages                                           | `docs/assets/`, referenced by relative path |
| Tutorials, TypeScript setup, style guide, FAQ, troubleshooting       | `docs/` in `reduxjs/redux`                  |
| Site config, navbar, theme, search, redirects (`website/_redirects`) | `website/` in `reduxjs/redux`               |

Topics shared by all the Redux libraries are written once, in the core docs. Link to them instead of repeating them here.

## Links

- Other React Redux pages: a relative file link (`../api/hooks.md`) or a site path (`/react-redux/api/hooks`).
- Other libraries and the core docs: site paths, such as `/usage/usage-with-typescript`, `/toolkit/api/configureStore`, or `/reselect/api/createSelector`. Do not use full `https://redux.js.org/...` URLs.
- When you rename, move, or delete a page, add a redirect for the old URL to `website/_redirects` in `reduxjs/redux`.

## Sidebar

New pages only appear in the navigation once they are listed in `docs/sidebars.ts`. The file has no imports because the site loads it from a copy of this folder. Its local `SidebarItem` type catches misspelled keys:

```bash
pnpm exec tsc -p docs/tsconfig.json --noEmit
```

The site build checks that every doc id in the sidebar exists.

## Previewing a PR

Every PR that changes `docs/` gets a Netlify deploy preview of the whole combined site, with this branch's React Redux docs in place of the published ones.

## Previewing locally

Clone `reduxjs/redux` next to this repo and install the site's dependencies once:

```bash
git clone https://github.com/reduxjs/redux.git ../redux
cd ../redux/docs && pnpm install
cd ../website && pnpm install
```

Then start the dev server from `../redux/website`, pointing it at this checkout:

```bash
DOCS_SOURCE_REACT_REDUX=../../react-redux pnpm dev
```

`pnpm dev` copies this repo's docs into `website/external/react-redux`, copies each file again when it changes, and runs `docusaurus start`. The other libraries are cloned from GitHub. Set `DOCS_SOURCE_REDUX_TOOLKIT` or `DOCS_SOURCE_RESELECT` as well to use local checkouts of those.

The dev server does not report broken links. To run the same checks as a deploy preview:

```bash
DOCS_SOURCE_REACT_REDUX=../../react-redux pnpm fetch-docs --force
pnpm build
```
