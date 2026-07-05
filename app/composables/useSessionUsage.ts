interface Usage {
    costUsd: number;
    turns: number;
}

// Module-level so per-session usage survives the page remount that happens when a brand
// new session navigates to its saved URL. Only ever written client-side (from WS 'done'
// events), so there is no SSR cross-request concern.
const usageBySession = reactive<Record<string, Usage>>({});

export function useSessionUsage() {
    function add(sessionId: string | null | undefined, costUsd?: number) {
        if (!sessionId) return;
        const u = usageBySession[sessionId] ?? (usageBySession[sessionId] = { costUsd: 0, turns: 0 });
        u.costUsd += costUsd || 0;
        u.turns += 1;
    }

    function get(sessionId: string | null | undefined): Usage {
        return (sessionId && usageBySession[sessionId]) || { costUsd: 0, turns: 0 };
    }

    return { add, get };
}
