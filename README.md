# payload-nested-docs-page-tree

Companion admin plugin for [`@payloadcms/plugin-nested-docs`](https://payloadcms.com/docs/plugins/nested-docs).

<p align="center">
  <img alt="Page tree demo" src="assets/page-tree.gif" width="100%" />
</p>

Adds a nested tree list view for nested docs collections in Payload admin, with drag-and-drop parent changes and status badges for published / changed / draft documents.

It works alongside `@payloadcms/plugin-nested-docs`. It does not replace nested docs persistence, breadcrumbs generation, or routing.

Tested with Payload `3.81` and Next.js `16.2`.


## Install

```bash
pnpm add payload-nested-docs-page-tree
```

## Quick Setup

`@payloadcms/plugin-nested-docs` should already be installed, and each target collection should already have:

- a nested docs parent field
- a nested docs breadcrumbs field
- a top-level `admin.useAsTitle` field

Add `nestedDocsPageTreePlugin(...)` right after `nestedDocsPlugin(...)`:

```ts
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { nestedDocsPageTreePlugin } from 'payload-nested-docs-page-tree'

export const plugins = [
  nestedDocsPlugin({
    // your existing nested docs config
  }),
  nestedDocsPageTreePlugin({
    collections: ['pages'],
  }),
]
```

If needed, refresh the admin import map:

```bash
payload generate:importmap
```

## What It Adds

- replaces the collection list view with a nested tree table
- preserves sorting, filters, pagination, bulk selection, and row actions
- adds `POST /:id/move` for drag-and-drop parent changes
- hides the read-only breadcrumbs field by default

## Status Badges

The tree view supports three document states:

- `published`: live and up to date
- `changed`: live, but has unpublished changes
- `draft`: not published

To override badge labels or colors, pass a `badges` object:

```ts
nestedDocsPageTreePlugin({
  collections: ['pages'],
  badges: {
    labels: {
      published: 'Live',
      changed: 'Has Changes',
      draft: 'Draft Only',
    },
    colors: {
      published: '#1e90ff',
      changed: '#9333ea',
      draft: '#dc2626',
    },
  },
}),
```

`labels` and `colors` are optional partial overrides. Missing entries fall back to the built-in defaults.

## Configuration

- `collections`: target collection slugs
- `parentFieldSlug`: defaults to `'parent'`
- `breadcrumbsFieldSlug`: defaults to `'breadcrumbs'`
- `defaultLimit`: defaults to `100`
- `hideBreadcrumbs`: defaults to `true`
- `disabled`: defaults to `false`
- `badges`: optional label and color overrides for `published`, `changed`, and `draft`
- `diagnostics`: defaults to `false`. Enables structured diagnostic logging for tree-related publish/draft regressions; see below.

## Diagnostics Mode

If a drag-and-drop move is doing something unexpected to publish state, enable diagnostics and reproduce. Each page-tree-triggered write emits one or more structured events on the dev server stdout:

```ts
nestedDocsPageTreePlugin({
  collections: ['pages'],
  diagnostics: true,
})
```

Or with a custom sink:

```ts
nestedDocsPageTreePlugin({
  collections: ['pages'],
  diagnostics: {
    enabled: true,
    logger: (event) => req.payload.logger.info({ pageTree: event }),
  },
})
```

Each event is one line tagged `[payload-nested-docs-page-tree]` followed by the event source (`move-endpoint:enter`, `move-endpoint:ok`, `move-endpoint:error`, `page-tree-change:after`, `page-tree-change:status-flip`) and a JSON payload that includes:

- `flow`: id shared by every event for one logical move
- `publishedMainRowBefore` / `publishedMainRowAfter`: fresh reads of the public/published row (`draft: false`)
- `before` / `after` / `changed`: projected diffs for `_status`, the parent field, and the orderable field when present

If the published main row goes from `published` to anything else as a result of a page-tree change, the plugin additionally emits a `page-tree-change:status-flip` WARN line.

Diagnostics is opt-in and adds extra reads per move. Leave it off in production unless you are actively investigating.

## Development

For local plugin development, use the internal `dev/` app:

```bash
pnpm install
pnpm dev
pnpm generate:types
pnpm generate:importmap
```

Plugin source is in `src/`. The internal test app is in `dev/`.

For checks:

```bash
pnpm test:int
pnpm exec tsc --noEmit
```

## Test in Another Project

For release validation, test the packed artifact instead of a live source-folder dependency:

```bash
pnpm build
pnpm pack
```

Then in the external consumer app:

```bash
pnpm add /path/payload-nested-docs-page-tree-*.tgz
```
