<script setup lang="ts">
import type { ModalProps } from '@nuxt/ui'

interface Props extends ModalProps {
    title: string
    description?: string
    icon?: string
    iconColor?: 'primary' | 'success' | 'warning' | 'error' | 'neutral'
    loading?: boolean
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { required: true })

// Resolve to @nuxt/ui semantic color tokens so the modal follows the theme.
const iconColorClasses: Record<NonNullable<Props['iconColor']>, string> = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    neutral: 'text-muted'
}
</script>

<template>
    <UModal
        v-on="$attrs"
        v-model:open="open"
        :title="title"
        :description="description"
        :ui="{
            content: 'sm:max-w-lg',
            footer: 'justify-end'
        }"
    >
        <template #title>
            <div class="flex items-center gap-2">
                <UIcon
                    v-if="icon"
                    :name="icon"
                    :class="iconColorClasses[iconColor ?? 'primary']"
                />
                <span>{{ title }}</span>
            </div>
        </template>

        <template #body>
            <div v-if="loading" class="flex items-center justify-center py-8">
                <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-slate-400" />
            </div>
            <slot v-else />
        </template>

        <template #footer>
            <slot name="footer" :ui="ui" />
        </template>

        <template #close="{ ui }">
            <slot name="close" :ui="ui" />
        </template>
    </UModal>
</template>
