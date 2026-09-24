/**
 * Periodically calls a refresh function while the page is open.
 *
 * Runs on the client only and pauses while the tab is hidden, so a background
 * tab does not keep hitting the API. When the tab becomes visible again the
 * refresh fires immediately once, then the interval resumes.
 */
export function usePollingRefresh(refresh: () => void | Promise<void>, intervalMs: number = 30_000) {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
        if (timer !== null || import.meta.server) return;
        timer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                refresh();
            }
        }, intervalMs);
    }

    function stop() {
        if (timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    }

    function onVisibilityChange() {
        // Catch up right away when the user comes back to the tab
        if (document.visibilityState === 'visible') {
            refresh();
        }
    }

    onMounted(() => {
        start();
        document.addEventListener('visibilitychange', onVisibilityChange);
    });

    onUnmounted(() => {
        stop();
        document.removeEventListener('visibilitychange', onVisibilityChange);
    });

    return {
        stop
    };
}