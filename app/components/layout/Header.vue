<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import LeiCraftMCLogo from "../img/LeiCraftMCLogo.vue";

const links = computed<NavigationMenuItem[]>(() => [
    {
        label: "Overview",
        to: "/",
        icon: "i-lucide-layout-dashboard",
    },
    {
        label: "Incidents",
        to: "/incidents",
        icon: "i-lucide-alert-circle",
    },
    {
        label: "Scheduled Events",
        to: "/scheduled-events",
        icon: "i-lucide-clock",
    }
]);

const socialLinks = [
    { icon: "i-lucide-github", to: "https://github.com/LeiCraftMC/Status-Page", label: "GitHub" },
    { icon: "i-lucide-gitlab", to: "https://git.leicraftmc.de/LeiCraftMC/Status-Page", label: "GitLab" },
    { icon: "i-lucide-message-circle", to: "https://discord.com/invite/3cdazADhtv", label: "Discord" },
];

const mobileLinks = computed<NavigationMenuItem[][]>(() => [
    links.value,
    socialLinks.map(social => ({
        label: social.label,
        to: social.to,
        target: "_blank",
        icon: social.icon
    }))
]);

</script>

<template>

    <UHeader class="backdrop-blur-xl">
        <template #title>
            <NuxtLink to="/" class="flex items-center gap-1.5">
                <LeiCraftMCLogo></LeiCraftMCLogo>
            </NuxtLink>
        </template>

        <UNavigationMenu :items="[links]" />

        <template #body>
            <UNavigationMenu :items="mobileLinks" orientation="vertical" class="w-full" />
        </template>

        <template #right>
            <div class="hidden lg:flex items-center gap-2">
                <UButton
                    v-for="social in socialLinks"
                    :key="social.label"
                    :to="social.to"
                    target="_blank"
                    :icon="social.icon"
                    color="neutral"
                    variant="ghost"
                    size="lg"
                    :aria-label="social.label"
                    class="hover:scale-110 transition-transform duration-200"
                />
            </div>
        </template>
    </UHeader>

</template>
