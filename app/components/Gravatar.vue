<script setup lang="ts">
import type { AvatarProps } from '@nuxt/ui';
import { useGravatarURL } from '~/composables/useGravatarURL';

const props = defineProps<Omit<AvatarProps, 'src'> & { email?: string }>();

const avatarSrc = ref<string | undefined>(undefined);

if (props.email) {
    useGravatarURL(props.email).then((url) => {
        avatarSrc.value = url;
    });
    // On failure, avatarSrc stays undefined — component renders without image
}

</script>

<template>
    <UAvatar
        :src="avatarSrc"
        v-bind="props"
    >
        <slot />
    </UAvatar>
</template>
