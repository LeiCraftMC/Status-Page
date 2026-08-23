<script setup lang="ts">
import type {
    GetStatusPageConfigResponses,
    GetMonitorsResponses,
    GetPublicStatusPageHistoryResponses,
    GetStatusPageHistoryResponses
} from '@/api-client/types.gen'

type Group = GetStatusPageConfigResponses[200]['data']['groups'][number]
type Link = GetStatusPageConfigResponses[200]['data']['links'][number]
type Monitor = GetMonitorsResponses[200]['data'][number]

type PublicHistory = GetPublicStatusPageHistoryResponses[200]['data']['monitors'][number]
type AuthHistory = GetStatusPageHistoryResponses[200]['data']['monitors'][number]
type MonitorHistory = PublicHistory | AuthHistory

interface Props {
    groups: Group[]
    links: Link[]
    monitors: Monitor[]
    histories?: MonitorHistory[]
    loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    histories: () => [],
    loading: false
})

const emit = defineEmits<{
    'reorder-groups': [groups: { id: number; sort_order: number }[]]
    'reorder-links': [links: { id: number; group_id: number | null; sort_order: number }[]]
    'create-link': [link: { monitor_id: number; group_id: number | null; display_name?: string | null; sort_order: number }]
    'update-link': [link: { id: number; display_name?: string | null; group_id?: number | null; sort_order?: number }]
    'delete-link': [id: number]
    'create-group': [group: { name: string; sort_order: number }]
    'update-group': [group: { id: number; name: string; sort_order?: number }]
    'delete-group': [id: number]
}>()

// --- Computed editor state ---

const linkedMonitorIds = computed(() => new Set(props.links.map(l => l.monitor_id)))

const availableMonitors = computed(() =>
    props.monitors.filter(m => !linkedMonitorIds.value.has(m.id))
)

const historyByMonitorId = computed(() => {
    const map = new Map<number, MonitorHistory>()
    for (const h of props.histories) {
        map.set(h.monitor_id, h)
    }
    return map
})

type EditorLink = Link & { monitor?: Monitor }

type EditorGroup = {
    id: number | null
    name: string
    sort_order: number
    links: EditorLink[]
}

const editorGroups = computed<EditorGroup[]>(() => {
    const groupMap = new Map<number | null, EditorGroup>()

    groupMap.set(null, {
        id: null,
        name: 'Ungrouped',
        sort_order: Infinity,
        links: []
    })

    for (const group of props.groups) {
        groupMap.set(group.id, {
            id: group.id,
            name: group.name,
            sort_order: group.sort_order,
            links: []
        })
    }

    for (const link of props.links) {
        const group = groupMap.get(link.group_id ?? null)
        if (!group) continue
        group.links.push({
            ...link,
            monitor: props.monitors.find(m => m.id === link.monitor_id)
        })
    }

    for (const group of groupMap.values()) {
        group.links.sort((a, b) => a.sort_order - b.sort_order)
    }

    const realGroups = [...groupMap.values()]
        .filter(g => g.id !== null)
        .sort((a, b) => a.sort_order - b.sort_order)

    const ungrouped = groupMap.get(null)!

    return [...realGroups, ungrouped]
})

// --- Drag & drop state ---

type DragPayload =
    | { type: 'link'; id: number; link: EditorLink; sourceGroupId: number | null }
    | { type: 'group'; id: number; group: Group }

const dragState = ref<DragPayload | null>(null)
const dragOverGroupId = ref<number | null>(null)
const dragOverLinkIndex = ref<number | null>(null)
const dragOverGroupIndex = ref<number | null>(null)
const dragIndicatorPosition = ref<'before' | 'after'>('before')

function setDragPayload(payload: DragPayload) {
    dragState.value = payload
}

function clearDragState() {
    dragState.value = null
    dragOverGroupId.value = null
    dragOverLinkIndex.value = null
    dragOverGroupIndex.value = null
}

// --- Add monitor menu ---

function addMonitorMenuItems(groupId: number | null) {
    if (availableMonitors.value.length === 0) return [[]]
    return [
        availableMonitors.value.map(m => ({
            label: m.name,
            onSelect: () => {
                const targetLinks = editorGroups.value.find(g => g.id === groupId)?.links ?? []
                const nextSortOrder = targetLinks.length ? Math.max(...targetLinks.map(l => l.sort_order)) + 1 : 0
                emit('create-link', {
                    monitor_id: m.id,
                    group_id: groupId,
                    display_name: null,
                    sort_order: nextSortOrder
                })
            }
        }))
    ]
}

// --- Group header drag (reorder groups) ---

function onGroupDragStart(group: Group, event: DragEvent) {
    event.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'group', id: group.id }))
    event.dataTransfer!.effectAllowed = 'move'
    setDragPayload({ type: 'group', id: group.id, group })
}

function onGroupDropZoneDragOver(targetIndex: number, event: DragEvent) {
    if (dragState.value?.type !== 'group') return
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    dragOverGroupIndex.value = targetIndex
}

function onGroupDropZoneDrop(targetIndex: number, event: DragEvent) {
    event.preventDefault()
    const draggedId = dragState.value?.type === 'group' ? dragState.value.id : null
    if (draggedId === null) return

    const realGroups = props.groups.slice().sort((a, b) => a.sort_order - b.sort_order)
    const currentIndex = realGroups.findIndex(g => g.id === draggedId)
    if (currentIndex === -1) return

    const moved = realGroups.splice(currentIndex, 1)[0]
    // targetIndex is the position *before* which to insert
    const insertIndex = targetIndex > currentIndex ? targetIndex - 1 : targetIndex
    realGroups.splice(insertIndex, 0, moved)

    const reordered = realGroups.map((g, idx) => ({ id: g.id, sort_order: idx }))
    emit('reorder-groups', reordered)
    clearDragState()
}

// --- Monitor link drag ---

function onLinkDragStart(link: EditorLink, group: EditorGroup, event: DragEvent) {
    event.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'link', id: link.id }))
    event.dataTransfer!.effectAllowed = 'move'
    setDragPayload({ type: 'link', id: link.id, link, sourceGroupId: group.id })
}

function getLinkDropIndex(group: EditorGroup, event: DragEvent, linkElement: HTMLElement): number | null {
    const rect = linkElement.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const isBefore = event.clientY < midpoint

    const index = group.links.findIndex(l => l.id === Number(linkElement.dataset.linkId))
    if (index === -1) return null

    dragIndicatorPosition.value = isBefore ? 'before' : 'after'
    return isBefore ? index : index + 1
}

function onLinkDragOver(group: EditorGroup, link: EditorLink, index: number, event: DragEvent) {
    if (!dragState.value || dragState.value.type === 'group') return
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'

    const el = event.currentTarget as HTMLElement
    const dropIndex = getLinkDropIndex(group, event, el)
    if (dropIndex === null) return

    dragOverGroupId.value = group.id
    dragOverLinkIndex.value = dropIndex
}

function onGroupBodyDragOver(group: EditorGroup, event: DragEvent) {
    if (!dragState.value || dragState.value.type === 'group') return
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'

    const el = event.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const children = Array.from(el.querySelectorAll('[data-link-row]')) as HTMLElement[]

    // If empty or below all items, drop at end
    if (children.length === 0 || event.clientY > rect.bottom - 8) {
        dragOverGroupId.value = group.id
        dragOverLinkIndex.value = group.links.length
        dragIndicatorPosition.value = 'before'
        return
    }
}

function onLinkOrBodyDrop(group: EditorGroup, event: DragEvent) {
    event.preventDefault()
    if (!dragState.value || dragState.value.type === 'group') return

    const targetGroupId = group.id
    const draggedLinkId = dragState.value.id
    const sourceGroupId = dragState.value.sourceGroupId
    const insertIndex = dragOverLinkIndex.value ?? group.links.length

    // Build full new order for all groups
    const reordered: { id: number; group_id: number | null; sort_order: number }[] = []

    for (const g of editorGroups.value) {
        let links = g.links.slice()

        if (g.id === sourceGroupId) {
            // Remove dragged link from source
            links = links.filter(l => l.id !== draggedLinkId)
        }

        if (g.id === targetGroupId) {
            // Insert or move to target index
            const existing = g.links.find(l => l.id === draggedLinkId)
            const sourceIndex = g.links.findIndex(l => l.id === draggedLinkId)

            if (existing && g.id === sourceGroupId) {
                // Reorder within same group
                const moved = g.links.filter(l => l.id === draggedLinkId)[0]
                links = g.links.filter(l => l.id !== draggedLinkId)
                const adjustedIndex = sourceIndex !== -1 && insertIndex > sourceIndex ? insertIndex - 1 : insertIndex
                links.splice(adjustedIndex, 0, moved)
            } else if (existing) {
                // Move from another group to this group
                links = g.links.filter(l => l.id !== draggedLinkId)
                links.splice(insertIndex, 0, existing)
            } else {
                // Should not happen because we handled source removal; but just in case
                links.splice(insertIndex, 0, dragState.value.link)
            }
        }

        links.forEach((l, idx) => {
            reordered.push({
                id: l.id,
                group_id: g.id,
                sort_order: idx
            })
        })
    }

    emit('reorder-links', reordered)
    clearDragState()
}

function onDragEnd() {
    clearDragState()
}

// --- Inline editing ---

const editingGroupId = ref<number | null>(null)
const editingGroupName = ref('')

function startEditGroup(group: EditorGroup) {
    if (group.id === null) return
    editingGroupId.value = group.id
    editingGroupName.value = group.name
}

function submitEditGroup(group: EditorGroup) {
    if (group.id === null) return
    const name = editingGroupName.value.trim()
    if (name && name !== group.name) {
        emit('update-group', { id: group.id, name, sort_order: group.sort_order })
    }
    editingGroupId.value = null
}

const editingLinkId = ref<number | null>(null)
const editingLinkDisplayName = ref('')

function startEditLink(link: EditorLink) {
    editingLinkId.value = link.id
    editingLinkDisplayName.value = link.display_name ?? ''
}

function submitEditLink(link: EditorLink) {
    const displayName = editingLinkDisplayName.value.trim()
    const newValue = displayName === '' ? null : displayName
    if (newValue !== link.display_name) {
        emit('update-link', { id: link.id, display_name: newValue })
    }
    editingLinkId.value = null
}

// --- Create group modal ---

const showCreateGroupModal = ref(false)
const newGroupName = ref('')

function submitCreateGroup() {
    const name = newGroupName.value.trim()
    if (!name) return
    const sortOrder = props.groups.length
    emit('create-group', { name, sort_order: sortOrder })
    newGroupName.value = ''
    showCreateGroupModal.value = false
}

// --- Delete / unlink confirmations ---

const deleteGroupTarget = ref<Group | null>(null)
const unlinkLinkTarget = ref<Link | null>(null)

function openDeleteGroup(group: EditorGroup) {
    if (group.id === null) return
    deleteGroupTarget.value = group
}

function confirmDeleteGroup() {
    if (!deleteGroupTarget.value) return
    emit('delete-group', deleteGroupTarget.value.id)
    deleteGroupTarget.value = null
}

function openUnlinkLink(link: EditorLink) {
    unlinkLinkTarget.value = link
}

function confirmUnlinkLink() {
    if (!unlinkLinkTarget.value) return
    emit('delete-link', unlinkLinkTarget.value.id)
    unlinkLinkTarget.value = null
}
</script>

<template>
    <div class="space-y-4">
        <div v-if="props.loading" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-slate-400" />
        </div>

        <template v-else>
            <!-- Drop zone before first real group -->
            <div
                v-if="editorGroups.some(g => g.id !== null)"
                class="h-2 rounded transition-colors"
                :class="dragState?.type === 'group' && dragOverGroupIndex === 0 ? 'bg-primary-500/40' : 'bg-transparent'"
                @dragover="onGroupDropZoneDragOver(0, $event)"
                @drop="onGroupDropZoneDrop(0, $event)"
                @dragleave="dragOverGroupIndex = null"
            />

            <template v-for="(group, groupIndex) in editorGroups" :key="group.id ?? 'ungrouped'">
                <div
                    class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
                    :class="{ 'opacity-60': dragState?.type === 'group' && dragState.id === group.id }"
                >
                    <!-- Group header -->
                    <div class="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center gap-3">
                        <div
                            v-if="group.id !== null"
                            draggable="true"
                            class="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-1"
                            @dragstart="group.id !== null && onGroupDragStart(group as Group, $event)"
                            @dragend="onDragEnd"
                        >
                            <UIcon name="i-lucide-grip-vertical" class="size-5" />
                        </div>
                        <UIcon v-else name="i-lucide-layers" class="size-5 text-slate-500" />

                        <div class="flex-1 min-w-0">
                            <div v-if="editingGroupId === group.id" class="flex items-center gap-2">
                                <UInput
                                    v-model="editingGroupName"
                                    size="sm"
                                    class="w-full"
                                    @blur="submitEditGroup(group)"
                                    @keydown.enter="submitEditGroup(group)"
                                />
                            </div>
                            <div v-else class="group flex items-center gap-2">
                                <h3 class="font-semibold text-white truncate">{{ group.name }}</h3>
                                <UButton
                                    v-if="group.id !== null"
                                    icon="i-lucide-pencil"
                                    color="neutral"
                                    variant="ghost"
                                    size="xs"
                                    class="opacity-0 group-hover:opacity-100 transition-opacity"
                                    @click="startEditGroup(group)"
                                />
                            </div>
                        </div>

                        <UBadge variant="soft" color="neutral">{{ group.links.length }}</UBadge>

                        <UDropdownMenu :items="addMonitorMenuItems(group.id)">
                            <UButton
                                icon="i-lucide-plus"
                                color="neutral"
                                variant="ghost"
                                size="xs"
                                :disabled="availableMonitors.length === 0"
                                :title="availableMonitors.length === 0 ? 'All monitors are already linked' : 'Add monitor to this group'"
                            />
                        </UDropdownMenu>

                        <UDropdownMenu
                            v-if="group.id !== null"
                            :items="[[
                                { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startEditGroup(group) },
                                { label: 'Delete group', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openDeleteGroup(group) }
                            ]]"
                        >
                            <UButton icon="i-lucide-more-horizontal" color="neutral" variant="ghost" size="xs" />
                        </UDropdownMenu>
                    </div>

                    <!-- Group body -->
                    <div
                        class="divide-y divide-slate-800 min-h-[60px]"
                        @dragover="onGroupBodyDragOver(group, $event)"
                        @drop="onLinkOrBodyDrop(group, $event)"
                    >
                        <div v-if="group.links.length === 0 && !props.loading" class="text-center py-6 text-sm text-slate-500">
                            Drag monitors here or use the + button
                        </div>
                        <div
                            v-if="group.links.length === 0 && !props.loading && dragState?.type === 'link' && dragOverGroupId === group.id"
                            class="h-1 rounded bg-primary-500/70 my-1"
                        />

                        <template v-for="(link, linkIndex) in group.links" :key="link.id">
                            <!-- Drop indicator before item -->
                            <div
                                v-if="dragState?.type === 'link' && dragOverGroupId === group.id && dragOverLinkIndex === linkIndex && dragIndicatorPosition === 'before'"
                                class="h-1 rounded bg-primary-500/70 my-1"
                            />

                            <div
                                :data-link-row="true"
                                :data-link-id="link.id"
                                draggable="true"
                                class="px-4 py-3 flex gap-3 cursor-grab active:cursor-grabbing transition-colors hover:bg-slate-800/40"
                                :class="{ 'opacity-60': dragState?.type === 'link' && dragState.id === link.id }"
                                @dragstart="onLinkDragStart(link, group, $event)"
                                @dragover="onLinkDragOver(group, link, linkIndex, $event)"
                                @drop="onLinkOrBodyDrop(group, $event)"
                                @dragend="onDragEnd"
                            >
                                <UIcon name="i-lucide-grip-vertical" class="text-slate-500 size-4 shrink-0 mt-1" />

                                <div class="flex-1 min-w-0 space-y-2">
                                    <div class="flex items-center justify-between gap-4">
                                        <div class="min-w-0">
                                            <div v-if="editingLinkId === link.id" class="flex items-center gap-2">
                                                <UInput
                                                    v-model="editingLinkDisplayName"
                                                    size="xs"
                                                    placeholder="Display name"
                                                    class="w-full"
                                                    @blur="submitEditLink(link)"
                                                    @keydown.enter="submitEditLink(link)"
                                                />
                                            </div>
                                            <template v-else>
                                                <p class="text-sm font-medium text-white truncate">
                                                    {{ link.display_name || link.monitor_name }}
                                                </p>
                                                <p class="text-xs text-slate-400 truncate">
                                                    {{ link.display_name ? link.monitor_name : link.monitor?.target }}
                                                </p>
                                            </template>
                                        </div>

                                        <div class="flex items-center gap-3 shrink-0">
                                            <span
                                                v-if="link.monitor?.latest_check?.response_time_ms != null"
                                                class="text-xs text-slate-400 hidden sm:inline"
                                            >
                                                {{ link.monitor.latest_check.response_time_ms }} ms
                                            </span>
                                            <StatusBadge :status="link.monitor?.latest_check?.status" />
                                            <UButton
                                                icon="i-lucide-pencil"
                                                color="neutral"
                                                variant="ghost"
                                                size="xs"
                                                @click="startEditLink(link)"
                                            />
                                            <UButton
                                                icon="i-lucide-unlink"
                                                color="neutral"
                                                variant="ghost"
                                                size="xs"
                                                @click="openUnlinkLink(link)"
                                            />
                                        </div>
                                    </div>

                                    <MonitorUptimeBars
                                        v-if="historyByMonitorId.has(link.monitor_id)"
                                        :history="historyByMonitorId.get(link.monitor_id)!"
                                    />
                                </div>
                            </div>

                            <!-- Drop indicator after last item -->
                            <div
                                v-if="dragState?.type === 'link' && dragOverGroupId === group.id && dragOverLinkIndex === linkIndex + 1 && (linkIndex === group.links.length - 1)"
                                class="h-1 rounded bg-primary-500/70 my-1"
                            />
                        </template>

                        <!-- Drop indicator at end of non-empty group when hovering below all items -->
                        <div
                            v-if="dragState?.type === 'link' && dragOverGroupId === group.id && dragOverLinkIndex === group.links.length && group.links.length > 0 && dragIndicatorPosition === 'before'"
                            class="h-1 rounded bg-primary-500/70 my-1"
                        />
                    </div>
                </div>

                <!-- Drop zone after this group (only for real groups) -->
                <div
                    v-if="group.id !== null"
                    class="h-2 rounded transition-colors"
                    :class="dragState?.type === 'group' && dragOverGroupIndex === groupIndex + 1 ? 'bg-primary-500/40' : 'bg-transparent'"
                    @dragover="onGroupDropZoneDragOver(groupIndex + 1, $event)"
                    @drop="onGroupDropZoneDrop(groupIndex + 1, $event)"
                    @dragleave="dragOverGroupIndex = null"
                />
            </template>

            <!-- Add group button -->
            <UButton
                icon="i-lucide-folder-plus"
                label="Add Group"
                color="primary"
                variant="subtle"
                class="w-full justify-center"
                @click="showCreateGroupModal = true"
            />
        </template>

        <!-- Create group modal -->
        <DashboardModal v-model:open="showCreateGroupModal" title="Add Group" icon="i-lucide-folder-plus">
            <div class="space-y-4">
                <UFormField label="Group name" required>
                    <UInput v-model="newGroupName" placeholder="e.g. Game Servers" class="w-full" @keydown.enter="submitCreateGroup" />
                </UFormField>
                <div class="flex justify-end gap-2 pt-2">
                    <UButton label="Cancel" color="neutral" variant="ghost" @click="showCreateGroupModal = false" />
                    <UButton label="Create" color="primary" :disabled="!newGroupName.trim()" @click="submitCreateGroup" />
                </div>
            </div>
        </DashboardModal>

        <!-- Delete group confirmation -->
        <DashboardDeleteModal
            v-if="deleteGroupTarget"
            :open="!!deleteGroupTarget"
            title="Delete Group"
            :warning-text="`Are you sure you want to delete group &quot;${deleteGroupTarget.name}&quot;? Monitors in this group will become ungrouped.`"
            @update:open="deleteGroupTarget = null"
            :on-delete="confirmDeleteGroup"
        />

        <!-- Unlink monitor confirmation -->
        <DashboardDeleteModal
            v-if="unlinkLinkTarget"
            :open="!!unlinkLinkTarget"
            title="Unlink Monitor"
            :warning-text="`Are you sure you want to unlink &quot;${unlinkLinkTarget.display_name || unlinkLinkTarget.monitor_name}&quot; from the status page?`"
            @update:open="unlinkLinkTarget = null"
            :on-delete="confirmUnlinkLink"
        />
    </div>
</template>

<style scoped>
.cursor-grab {
    cursor: grab;
}
.active\:cursor-grabbing:active,
.cursor-grabbing {
    cursor: grabbing;
}
</style>
