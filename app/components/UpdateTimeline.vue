<script setup lang="ts">
interface TimelineUpdate {
    id: number
    message: string
    status: string
    created_at: number
    updated_at: number
}

interface Props {
    kind: 'incident' | 'maintenance'
    updates: TimelineUpdate[]
    /** The parent's original message, shown as the oldest timeline entry */
    openingMessage?: string
    openingAt?: number | null
    openingLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
    openingMessage: undefined,
    openingAt: null,
    openingLabel: 'Reported'
})

defineSlots<{
    actions?: (props: { update: TimelineUpdate }) => any
}>()

function statusColor(status: string) {
    return props.kind === 'incident'
        ? getIncidentStatusColor(status)
        : getMaintenanceStatusColor(status)
}

const dotClasses: Record<string, string> = {
    success: 'bg-emerald-500 ring-emerald-500/20',
    error: 'bg-red-500 ring-red-500/20',
    warning: 'bg-amber-500 ring-amber-500/20',
    primary: 'bg-sky-500 ring-sky-500/20',
    neutral: 'bg-slate-500 ring-slate-500/20'
}

function dotClass(status: string): string {
    return dotClasses[statusColor(status)] ?? dotClasses.neutral!
}

/** Edits after posting leave updated_at ahead of created_at */
function wasEdited(update: TimelineUpdate): boolean {
    return update.updated_at - update.created_at > 1000
}
</script>

<template>
    <ol class="relative border-l border-slate-800 ml-2 space-y-6">
        <li
            v-for="update in updates"
            :key="update.id"
            class="pl-6 relative"
        >
            <span
                class="absolute -left-[7px] top-1.5 size-3 rounded-full ring-4"
                :class="dotClass(update.status)"
            />

            <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                    <UBadge :color="statusColor(update.status)" variant="soft" class="capitalize">
                        {{ formatStatusLabel(update.status) }}
                    </UBadge>
                    <span class="text-xs text-slate-400">{{ formatDate(update.created_at) }}</span>
                    <span v-if="wasEdited(update)" class="text-xs text-slate-500 italic">(edited)</span>
                </div>
                <slot name="actions" :update="update" />
            </div>

            <p class="text-slate-300 whitespace-pre-line mt-2">{{ update.message }}</p>
        </li>

        <li v-if="openingMessage" class="pl-6 relative">
            <span class="absolute -left-[7px] top-1.5 size-3 rounded-full ring-4 bg-slate-600 ring-slate-600/20" />

            <div class="flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="soft">{{ openingLabel }}</UBadge>
                <span v-if="openingAt" class="text-xs text-slate-400">{{ formatDate(openingAt) }}</span>
            </div>

            <p class="text-slate-300 whitespace-pre-line mt-2">{{ openingMessage }}</p>
        </li>
    </ol>
</template>