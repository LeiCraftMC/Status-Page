<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";

definePageMeta({
    layout: "auth",
});

useSeoMeta({
    title: "Login | LeiCraft_MC Status Page",
    description: "Login to your account",
});

const route = useRoute();
let redirectUrl = route.query.url?.toString() || "/";

// Only allow safe in-app destinations: a single leading "/" that is not a
// protocol-relative ("//host") or backslash ("/\host") open-redirect.
if (!redirectUrl.startsWith("/") || redirectUrl.startsWith("//") || redirectUrl.startsWith("/\\")) {
    redirectUrl = "/";
}


const toast = useToast();
const loading = ref(false);

const fields: AuthFormField[] = [
    {
        name: "username",
        type: "text",
        label: "Username",
        placeholder: "Enter your username",
        required: true,
    },
    {
        name: "password",
        label: "Password",
        type: "password",
        placeholder: "Enter your password",
        required: true,
    },
    {
        name: "remember",
        label: "Remember me",
        type: "checkbox",
        description: "You will stay logged in for 30 days.",
    },
];

const schema = z.object({
    username: z
        .string("Username is required")
        .trim()
        .min(1, "Username is required"),
    password: z
        .string("Password is required")
        .trim()
        .min(1, "Password is required"),
    remember: z.boolean().optional(),
});

type Schema = z.output<typeof schema>;

async function onSubmit(payload: FormSubmitEvent<Schema>) {
    // Guard against double-submit creating duplicate sessions / toasts.
    if (loading.value) return;
    loading.value = true;

    try {
        const result = await useAPI((api) => {
            return api.postAuthLogin({ body: payload.data });
        });

        if (result.success) {
            updateAPIClient(result.data.token);

            const sessionToken = useCookie("lccfwsp_session_token", {
                path: "/",
                secure: true,
                sameSite: "lax",
                httpOnly: false,
                maxAge: payload.data.remember ? 60 * 60 * 24 * 30 : undefined, // 30 days
            });

            sessionToken.value = result.data.token;

            await useUserInfoStore().refresh();

            toast.add({
                title: "Login Successful",
                description: "You have been logged in successfully.",
            });

            await navigateTo(redirectUrl.toString());
            return;
        } else if ((result.code as number) === 401) {
            toast.add({
                title: "Invalid Username or Password",
                description: "Please check your credentials and try again.",
                icon: "i-lucide-alert-circle",
                color: "error",
            });
        } else {
            toast.add({
                title: "Login Failed",
                description: result.message || "An error occurred during login. Please try again later.",
                icon: "i-lucide-alert-circle",
                color: "error",
            });
        }
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <UAuthForm
        :schema="schema"
        title="Login"
        description="Enter your credentials to access your account."
        icon="i-lucide-user"
        :fields="fields"
        @submit="onSubmit"
        :submit="{
            label: 'Login',
            loading,
            disabled: loading,
        }"
    >
        <template #footer>
            <div class="text-center text-sm">
                Forgot your password?
                <NuxtLink
                    to="/auth/forgot-password"
                    class="text-primary hover:underline"
                >
                    Reset here
                </NuxtLink>
            </div>
        </template>
    </UAuthForm>
</template>
