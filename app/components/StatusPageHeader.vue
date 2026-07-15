<script setup lang="ts">
import type { GetStatusPagesBySlugResponses, GetPublicStatusPagesBySlugResponses } from '@/api-client/types.gen';

type Page = GetStatusPagesBySlugResponses[200]['data']['page'] | GetPublicStatusPagesBySlugResponses[200]['data']['page'];

interface Props {
    page: Page;
    showViewLink?: boolean;
    viewLink?: string;
}

defineProps<Props>();
</script>

<template>
    <div class="space-y-2">
        <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
                <h1 class="text-2xl font-bold text-white">{{ page.title }}</h1>
                <p v-if="page.description" class="text-slate-400">{{ page.description }}</p>
            </div>

            <UButton
                v-if="showViewLink && viewLink"
                :to="viewLink"
                icon="i-lucide-external-link"
                label="View public page"
                color="neutral"
                variant="ghost"
                target="_blank"
            />
        </div>

        <div class="flex flex-wrap gap-2">
            <UBadge :color="page.is_public ? 'success' : 'warning'" variant="soft">
                {{ page.is_public ? 'Public' : 'Private' }}
            </UBadge>
            <UBadge :color="page.is_enabled ? 'success' : 'neutral'" variant="soft">
                {{ page.is_enabled ? 'Enabled' : 'Disabled' }}
            </UBadge>
            <UBadge variant="soft" color="neutral" class="capitalize">
                {{ page.theme }} theme
            </UBadge>
        </div>
    </div>
</template>
