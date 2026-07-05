<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField, FormError } from "@nuxt/ui";

definePageMeta({
    layout: 'auth'
});

useSeoMeta({
    title: "Reset Password | LeiCraft_MC Status Page",
    description: "Reset your password",
});

const route = useRoute();
const reset_token = route.query.token as string || '';

const toast = useToast();
const loading = ref(false);

const fields: AuthFormField[] = [
    {
        name: "password",
        label: "New Password",
        type: "password",
        placeholder: "Enter a new password",
        required: true,
    },
    {
        name: "confirm_password",
        label: "Confirm New Password",
        type: "password",
        placeholder: "Re-enter your new password",
        required: true,
    },
];

const schema = z.object({
    password: z
        .string("Password is required")
        .trim()
        .min(8, "Must be at least 8 characters")
        .max(50, "Must be at most 50 characters")
        .regex(/[A-Z]/, "Must contain at least one uppercase letter")
        .regex(/[a-z]/, "Must contain at least one lowercase letter")
        .regex(/[0-9]/, "Must contain at least one number")
        .regex(/[\W_]/, "Must contain at least one special character"),
    confirm_password: z
        .string("Confirm Password is required")
        .trim()
        .min(1, "Confirm Password is required"),
});

type NewPasswordSchema = z.output<typeof schema>;

const formState = reactive<NewPasswordSchema>({
    password: "",
    confirm_password: "",
});

const validate = (state: Partial<NewPasswordSchema>): FormError[] => {
    const errors: FormError[] = [];
    if (
        state.password &&
        state.confirm_password &&
        state.password !== state.confirm_password
    ) {
        errors.push({
            name: "confirm_password",
            message: "Passwords do not match",
        });
    }
    return errors;
};
async function onSubmit(payload: FormSubmitEvent<NewPasswordSchema>) {
    // A reset token is single-use; guard against double-submit re-using a consumed token.
    if (loading.value) return;
    loading.value = true;

    try {
        const result = await useAPI((api) => {
            return api.postAuthResetPassword({
                body: {
                    reset_token,
                    new_password: payload.data.password,
                }
            });
        });

        if (result.success) {
            toast.add({
                title: 'Password Reset Successful',
                description: 'Your password has been reset successfully.',
                icon: 'i-lucide-check',
                color: 'success'
            });

            await navigateTo("/auth/login");
            return;
        } else {
            toast.add({
                title: 'Password Reset Failed',
                description: 'An error occurred during password reset.',
                icon: 'i-lucide-alert-circle',
                color: 'error'
            });
        }
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <template v-if="reset_token">
        <UAuthForm
            :schema="schema"
            title="Reset Password"
            description="Enter your new password below to reset it."
            icon="i-lucide-mail"
            :fields="fields"
            @submit="onSubmit"
            :submit="{
                label: 'Reset Password',
                loading,
                disabled: loading,
            }"
        >
            <template #footer>
                <div class="text-center text-sm">
                    Remembered your password?
                    <NuxtLink
                        to="/auth/login"
                        class="text-primary-400 hover:underline"
                    >
                        Login here
                    </NuxtLink>
                </div>
            </template>
        </UAuthForm>
    </template>
    <template v-else>
        <div class="text-center h-12 mb-4">
            Invalid or missing reset token. Please check your reset link or
            request a new password reset.
        </div>
        <NuxtLink
            to="/auth/forgot-password"
            class="text-primary-400 hover:underline text-center"
        >
            Request a new password reset
        </NuxtLink>
    </template>
</template>
