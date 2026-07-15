<script setup lang="ts">
interface Props {
    status: string | null | undefined;
}

defineProps<Props>();
</script>

<template>
    <UBadge
        :color="getStatusColor(status)"
        variant="soft"
        class="capitalize"
    >
        <template #leading>
            <UIcon :name="getStatusIcon(status)" class="size-3.5" />
        </template>
        {{ status || 'unknown' }}
    </UBadge>
</template>
