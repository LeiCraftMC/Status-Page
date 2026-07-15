<script setup lang="ts">
import LeiCraftMCLogo from "~/components/img/LeiCraftMCLogo.vue";

const colorMode = useColorMode();

// Public pages follow the site's default theme. The default is fetched and
// applied by each public page, but we ensure a sensible fallback here.
if (!colorMode.preference || colorMode.preference === 'system') {
    colorMode.preference = 'dark';
}
</script>

<template>
    <div class="min-h-screen flex flex-col public-layout">
        <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
            <div class="max-w-5xl mx-auto px-4 py-4 flex items-center gap-2">
                <LeiCraftMCLogo class="h-6 w-auto" />
                <span class="text-sm text-slate-400">Status Page</span>
            </div>
        </header>

        <main class="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
            <slot />
        </main>

        <footer class="border-t border-slate-800 py-6 text-center text-sm text-slate-500">
            Powered by LeiCraft_MC Status Page
        </footer>
    </div>
</template>

<style scoped>
.public-layout {
    color: rgb(241 245 249);
    background-color: rgb(2 6 23);
}
</style>
