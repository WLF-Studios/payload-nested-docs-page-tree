import {
  closestCenter,
  type Collision,
  type CollisionDetection,
  pointerWithin,
} from '@dnd-kit/core'

import type { PageTreeDropTarget, PageTreeRowDropTarget } from './dropTargets.js'

export const PAGE_TREE_INSERT_EDGE_SIZE_PX = 6
type PageTreeDragType = 'move' | 'order'
type PageTreeDragData = {
  dragType?: PageTreeDragType
  parentID?: null | string
}

export type PageTreePointerCollisionCandidate = {
  dragType?: PageTreeDragType
  dropTarget?: PageTreeDropTarget
  id: Collision['id']
  parentID?: null | string
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
  const existingPointerCollision = pointerCollisions.find(
    (collision) => collision.id === collisionID,
  )

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

function getDragData(value: unknown): PageTreeDragData {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const data = value as { dragType?: unknown; parentID?: unknown }
  const dragType = data.dragType === 'move' || data.dragType === 'order' ? data.dragType : undefined
  const parentID =
    data.parentID === null || typeof data.parentID === 'string' ? data.parentID : undefined

  return {
    dragType,
    parentID,
  }
}

function getCollisionDropTarget(collision: Collision): PageTreeDropTarget | undefined {
  return collision.data?.droppableContainer.data.current as PageTreeDropTarget | undefined
}

function getCollisionDragData(collision: Collision): PageTreeDragData {
  return getDragData(collision.data?.droppableContainer.data.current)
}

function isSortableOrderCollision(collision: Collision, activeDragData: PageTreeDragData): boolean {
  const collisionDragData = getCollisionDragData(collision)

  return (
    collisionDragData.dragType === 'order' && collisionDragData.parentID === activeDragData.parentID
  )
}

export function resolvePageTreePointerCollisionID(args: {
  activeParentID?: null | string
  collisions: PageTreePointerCollisionCandidate[]
  dragType?: PageTreeDragType
  pointerCoordinates: Parameters<CollisionDetection>[0]['pointerCoordinates']
}): Collision['id'] | null {
  const { activeParentID, collisions, dragType, pointerCoordinates } = args

  if (!pointerCoordinates) {
    return null
  }

  if (dragType === 'order') {
    return (
      collisions.find(
        (collision) => collision.dragType === 'order' && collision.parentID === activeParentID,
      )?.id ?? null
    )
  }

  const directInsertCollision = collisions.find(
    (collision) => collision.dropTarget?.dropType === 'insert',
  )

  if (directInsertCollision) {
    return directInsertCollision.id
  }

  const rowCollision = collisions.find(isRowCollision)

  if (!rowCollision) {
    return null
  }

  if (
    rowCollision.dropTarget.insertBeforeDropID &&
    pointerCoordinates.y - rowCollision.rect.top <= PAGE_TREE_INSERT_EDGE_SIZE_PX
  ) {
    return rowCollision.dropTarget.insertBeforeDropID
  }

  if (
    rowCollision.dropTarget.insertAfterDropID &&
    rowCollision.rect.bottom - pointerCoordinates.y <= PAGE_TREE_INSERT_EDGE_SIZE_PX
  ) {
    return rowCollision.dropTarget.insertAfterDropID
  }

  return rowCollision.id
}

export const pageTreeCollisionDetectionStrategy: CollisionDetection = (args) => {
  const activeDragData = getDragData(args.active.data.current)

  if (activeDragData.dragType === 'order') {
    const closestRowCollision = closestCenter(args).find((collision) =>
      isSortableOrderCollision(collision, activeDragData),
    )

    return closestRowCollision ? [closestRowCollision] : []
  }

  const pointerCollisions = pointerWithin(args)
  const resolvedCollisionID = resolvePageTreePointerCollisionID({
    activeParentID: activeDragData.parentID,
    collisions: pointerCollisions.map((collision) => ({
      id: collision.id,
      ...getCollisionDragData(collision),
      dropTarget: getCollisionDropTarget(collision),
      rect: args.droppableRects.get(collision.id) ?? undefined,
    })),
    dragType: activeDragData.dragType,
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
