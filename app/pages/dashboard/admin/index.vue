<script setup lang="ts">
// /admin has no landing page of its own; the admin role gate lives in the global
// auth middleware, so non-admins never reach here. Forward to the users screen.
definePageMeta({
    redirect: '/admin/users',
});
</script>

<template>
    <div />
</template>
