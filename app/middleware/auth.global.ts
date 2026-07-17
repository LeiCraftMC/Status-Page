import { useUserInfoStore } from "~/composables/stores/useUserStore";

export default defineNuxtRouteMiddleware(async(to) => {

    const token = useCookie("lccfwsp_session_token").value;

    // Public status page routes do not require authentication
    if (to.path === '/' || to.path === '/incidents' || to.path === '/scheduled-events') {
        return;
    }

    if (to.path.startsWith('/auth')) {
        if (!token) {
            return;
        }

        const user = await useUserInfoStore().use();

        if (user.value) {
            return navigateTo('/dashboard');
        }

        // Token exists but is invalid — clear it and stay on auth page
        useCookie("lccfwsp_session_token").value = null;
        return;
    }

    if (to.path.startsWith('/dashboard')) {

        if (!token) {
            return navigateTo('/auth/login?url=' + encodeURIComponent(to.fullPath));
        }

        const store = useUserInfoStore();
        const user = await store.use();

        if (!store.isValid(user)) {
            // Token exists but is invalid/expired — clear and redirect to login
            useCookie("lccfwsp_session_token").value = null;
            return navigateTo('/auth/login?url=' + encodeURIComponent(to.fullPath));
        }

        if (to.path.startsWith('/dashboard/admin')) {
            // Check admin access
            if (user.value.role !== 'admin') {
                return navigateTo('/');
            }
        }

    }
});
