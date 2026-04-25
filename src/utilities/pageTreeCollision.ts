import {
  closestCenter,
  type Collision,
  type CollisionDetection,
  pointerWithin,
} from '@dnd-kit/core'

import type { PageTreeDropTarget, PageTreeRowDropTarget } from './dropTargets.js'

export const PAGE_TREE_INSERT_EDGE_SIZE_PX = 6

export type PageTreePointerCollisionCandidate = {
  dropTarget?: PageTreeDropTarget
  id: Collision['id']
  rect?: {
    bottom: number
    top: number
  }
}

function getResolvedCollision(args: {
  collisionID: Collision['id']
  droppableContainers: Parameters<CollisionDetection>[0]['droppableContainers']
  pointerCollisions: Collision[]
}): Collision | null {
  const { collisionID, droppableContainers, pointerCollisions } = args
  const existingPointerCollision = pointerCollisions.find((collision) => collision.id === collisionID)

  if (existingPointerCollision) {
    return existingPointerCollision
  }

  const droppableContainer = droppableContainers.find((container) => container.id === collisionID)

  if (!droppableContainer) {
    return null
  }

  return {
    id: collisionID,
    data: {
      droppableContainer,
      value: 0,
    },
  }
}

type PageTreeResolvedRowCollision = {
  dropTarget: PageTreeRowDropTarget
  rect: {
    bottom: number
    top: number
  }
} & PageTreePointerCollisionCandidate

function isRowCollision(
  collision: PageTreePointerCollisionCandidate,
): collision is PageTreeResolvedRowCollision {
  return collision.dropTarget?.dropType === 'row' && Boolean(collision.rect)
}

export function resolvePageTreePointerCollisionID(args: {
  collisions: PageTreePointerCollisionCandidate[]
  pointerCoordinates: Parameters<CollisionDetection>[0]['pointerCoordinates']
}): Collision['id'] | null {
  const { collisions, pointerCoordinates } = args

  if (!pointerCoordinates) {
    return null
  }

  const directInsertCollision = collisions.find((collision) => collision.dropTarget?.dropType === 'insert')

  if (directInsertCollision) {
    return directInsertCollision.id
  }

  const rowCollision = collisions.find(isRowCollision)

  if (!rowCollision) {
    return null
  }

  if (pointerCoordinates.y - rowCollision.rect.top <= PAGE_TREE_INSERT_EDGE_SIZE_PX) {
    return rowCollision.dropTarget.insertBeforeDropID
  }

  if (rowCollision.rect.bottom - pointerCoordinates.y <= PAGE_TREE_INSERT_EDGE_SIZE_PX) {
    return rowCollision.dropTarget.insertAfterDropID
  }

  return rowCollision.id
}

export const pageTreeCollisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  const resolvedCollisionID = resolvePageTreePointerCollisionID({
    collisions: pointerCollisions.map((collision) => ({
      id: collision.id,
      dropTarget: collision.data?.droppableContainer.data.current as PageTreeDropTarget | undefined,
      rect: args.droppableRects.get(collision.id) ?? undefined,
    })),
    pointerCoordinates: args.pointerCoordinates,
  })

  if (resolvedCollisionID !== null) {
    const resolvedCollision = getResolvedCollision({
      collisionID: resolvedCollisionID,
      droppableContainers: args.droppableContainers,
      pointerCollisions,
    })

    if (resolvedCollision) {
      return [resolvedCollision]
    }
  }

  return closestCenter(args)
}
