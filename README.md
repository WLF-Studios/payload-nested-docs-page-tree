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
- marks the root page with slug `home` using a home icon on the title link
- hides the read-only breadcrumbs field by default

## Home Indicator

By default, the home icon is enabled only for the `pages` collection.

```ts
nestedDocsPageTreePlugin({
  collections: ['pages'],
})
```

For custom page collection slugs, pass an exact allow-list:

```ts
nestedDocsPageTreePlugin({
  collections: ['page-tree', 'categories'],
  homeIndicator: {
    collections: ['page-tree'],
  },
})
```

To disable the home icon everywhere:

```ts
nestedDocsPageTreePlugin({
  collections: ['pages'],
  homeIndicator: false,
})
```

## Status Badges

The tree view supports three document states:

- `published`: live and up to date
- `changed`: live, but has unpublished changes
- `draft`: not published

Badge colors use Payload theme tokens by default. To override badge labels or colors, pass a
`badges` object:

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
      // Example: use a custom green / orange / yellow palette.
      published: '#bbf3b0',
      changed: '#b9eaf3',
      draft: '#f8d5a7',
    },
  },
}),
```

`labels` and `colors` are optional partial overrides. Missing entries fall back to the built-in
Payload-themed defaults.

## Configuration

- `collections`: target collection slugs
- `parentFieldSlug`: defaults to `'parent'`
- `breadcrumbsFieldSlug`: defaults to `'breadcrumbs'`
- `defaultLimit`: defaults to `100`
- `hideBreadcrumbs`: defaults to `true`
- `disabled`: defaults to `false`
- `homeIndicator`: defaults to `{ collections: ['pages'] }`; set to `false` to disable
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

## Drag-And-Drop Is Triggering A Deploy?

A drag-and-drop parent move calls `payload.update()` on the draft only. The published version of the live site is never touched. So in most setups, dragging a page does not trigger any rebuild and you can skip this section.

### When you can skip this section

- The default Payload website template on Vercel (or any host using Next.js ISR), with drafts and autosave on. The template's `afterChange` hook only calls `revalidatePath` and `revalidateTag` from `next/cache`. Those just clear the edge cache. They do not trigger a Vercel build, do not consume build minutes, and do not change what visitors see when the published HTML has not changed.
- Any setup where your `afterChange` hooks only do in-process cache work (`revalidatePath`, `revalidateTag`, in-memory caches, etc.).

### When you need the one-line fix

You need the fix if **you** wrote an `afterChange` hook that calls something external or expensive on every save. Common cases:

- **Cloudflare Pages / Netlify / Vercel Deploy Hooks** (`fetch(DEPLOY_HOOK_URL)`) - these trigger full rebuilds and burn build minutes.
- **GitHub Actions** `repository_dispatch` triggers.
- **Manually-invoked SSG rebuilds**.
- **Publish notifications** (email, Slack) on status transitions.
- **Heavy search reindex jobs** (Algolia, Meilisearch full-document push).

Why a tree move trips these: a typical deploy hook fires when `previousDoc?._status === 'published'` so that it catches unpublish events too. A tree move on a published doc can match that condition, but the live site has not actually changed. Without the fix, every drag can fire your deploy.

### The fix

Add one line at the top of your hook. The plugin sets a flag on Payload's [hook context](https://payloadcms.com/docs/hooks/context) for every page-tree parent move, and your hook reads it to bail out early:

```ts
import { pageTreeMoveContextKey } from 'payload-nested-docs-page-tree'

// at the top of your afterChange hook:
if (req.context?.[pageTreeMoveContextKey]) return
```

This goes in **your** hook - the one that calls the deploy webhook. Not in any of the template's stock files.

Full example:

```ts
import type { CollectionAfterChangeHook } from 'payload'

import { pageTreeMoveContextKey } from 'payload-nested-docs-page-tree'

export const triggerDeployOnPublishedChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  // -- plugin opt-out --
  if (req.context?.[pageTreeMoveContextKey]) return

  // -- your deploy logic (example) --
  // Fire on publish, republish, or unpublish - every transition the live site cares about.
  if (doc._status === 'published' || previousDoc?._status === 'published') {
    // POST to your Cloudflare / Netlify / Vercel deploy hook here
  }
}
```

See `dev/lib/rebuild.ts` for the full Cloudflare deploy hook example used by the dev playground.

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
