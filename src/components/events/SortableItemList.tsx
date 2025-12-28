import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { EventItemWithData } from '@/types/event'
import { EventItemCard } from './EventItemCard'

interface SortableItemListProps {
  items: EventItemWithData[]
  selectedItemId?: string
  onItemClick?: (item: EventItemWithData) => void
  onReorder: (itemIds: string[]) => void
}

export function SortableItemList({
  items,
  selectedItemId,
  onItemClick,
  onReorder,
}: SortableItemListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)

      const newItems = arrayMove(items, oldIndex, newIndex)
      onReorder(newItems.map((item) => item.id))
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {items.map((item) => (
            <EventItemCard
              key={item.id}
              item={item}
              isSelected={item.id === selectedItemId}
              onClick={() => onItemClick?.(item)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
