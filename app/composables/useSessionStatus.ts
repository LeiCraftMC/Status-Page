import { useAPI } from './useAPI';
import { ref, readonly, watch, onUnmounted, toValue } from 'vue';
import type { MaybeRef } from 'vue';

const POLL_INTERVAL_MS = 3000;

export function useSessionStatus(absolute_path: MaybeRef<string | null | undefined>) {
    const runningIds = ref<Set<string>>(new Set());
    const attachedCounts = ref<Record<string, number>>({});
    let interval: ReturnType<typeof setInterval> | null = null;

    async function fetchStatus() {
        const path = toValue(absolute_path);
        if (!path) return;
        const result = await useAPI((api) => api.getClaudeProjectsByAbsolutePathSessionsStatus({
            path: { absolute_path: encodeURIComponent(path) }
        }));
        if (result.success) {
            const nextRunning = new Set<string>();
            const nextAttached: Record<string, number> = {};
            for (const s of result.data.sessions) {
                nextAttached[s.session_id] = s.attached_peers;
                if (s.status === 'running') {
                    nextRunning.add(s.session_id);
                }
            }
            runningIds.value = nextRunning;
            attachedCounts.value = nextAttached;
        }
    }

    function startPolling() {
        if (interval) return;
        fetchStatus();
        interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    }

    function stopPolling() {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
    }

    watch(() => toValue(absolute_path), (path) => {
        if (path) {
            startPolling();
        } else {
            stopPolling();
        }
    }, { immediate: true });

    onUnmounted(() => {
        stopPolling();
    });

    function isRunning(sessionId: string): boolean {
        return runningIds.value.has(sessionId);
    }

    function attachedPeers(sessionId: string): number {
        return attachedCounts.value[sessionId] || 0;
    }

    return {
        runningIds: readonly(runningIds),
        attachedCounts: readonly(attachedCounts),
        isRunning,
        attachedPeers,
        refresh: fetchStatus,
    };
}
