<script setup lang="ts">
import type { GetStatusPagesBySlugResponses, GetPublicStatusPagesBySlugResponses } from '@/api-client/types.gen';

type GroupedMonitor = GetStatusPagesBySlugResponses[200]['data']['groups'][number];
type UngroupedMonitor = GetStatusPagesBySlugResponses[200]['data']['ungrouped'][number];

type PublicGroupedMonitor = GetPublicStatusPagesBySlugResponses[200]['data']['groups'][number];
type PublicUngroupedMonitor = GetPublicStatusPagesBySlugResponses[200]['data']['ungrouped'][number];

interface Props {
    groups: GroupedMonitor[] | PublicGroupedMonitor[];
    ungrouped: UngroupedMonitor[] | PublicUngroupedMonitor[];
}

defineProps<Props>();
</script>

<template>
    <div class="space-y-4">
        <div
            v-for="group in groups"
            :key="group.id"
            class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
        >
            <div class="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
                <h3 class="font-semibold text-white">{{ group.name }}</h3>
            </div>

            <div class="divide-y divide-slate-800">
                <div
                    v-for="monitor in group.monitors"
                    :key="monitor.id"
                    class="flex items-center justify-between px-4 py-3"
                >
                    <div class="min-w-0">
                        <p class="font-medium text-white truncate">
                            {{ monitor.display_name || monitor.name }}
                        </p>
                        <p class="text-xs text-slate-400 truncate">{{ monitor.target }}</p>
                    </div>

                    <div class="flex items-center gap-3 shrink-0">
                        <span
                            v-if="monitor.latest_check?.response_time_ms != null"
                            class="text-xs text-slate-400 hidden sm:inline"
                        >
                            {{ monitor.latest_check.response_time_ms }} ms
                        </span>
                        <StatusBadge :status="monitor.latest_check?.status" />
                    </div>
                </div>
            </div>
        </div>

        <div
            v-if="ungrouped.length"
            class="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden"
        >
            <div class="px-4 py-3 border-b border-slate-800 bg-slate-900/80">
                <h3 class="font-semibold text-white">Ungrouped</h3>
            </div>

            <div class="divide-y divide-slate-800">
                <div
                    v-for="monitor in ungrouped"
                    :key="monitor.id"
                    class="flex items-center justify-between px-4 py-3"
                >
                    <div class="min-w-0">
                        <p class="font-medium text-white truncate">
                            {{ monitor.display_name || monitor.name }}
                        </p>
                        <p class="text-xs text-slate-400 truncate">{{ monitor.target }}</p>
                    </div>

                    <div class="flex items-center gap-3 shrink-0">
                        <span
                            v-if="monitor.latest_check?.response_time_ms != null"
                            class="text-xs text-slate-400 hidden sm:inline"
                        >
                            {{ monitor.latest_check.response_time_ms }} ms
                        </span>
                        <StatusBadge :status="monitor.latest_check?.status" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
