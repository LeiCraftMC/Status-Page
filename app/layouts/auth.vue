<script setup lang="ts">

</script>

<template>
    <NuxtLoadingIndicator
        color="#f97316"
        position="top"
    />

    <div class="app-layout main-bg-color min-h-screen flex items-center justify-center p-4">
        <div class="pointer-events-none absolute inset-0 bg-linear-to-b from-transparent via-primary/5 to-transparent"></div>
        <UPageCard class="w-full max-w-md border-default">
            <slot />
        </UPageCard>
    </div>
</template>

<style scoped>
.app-layout {
    color: rgb(241 245 249);
}
</style>
