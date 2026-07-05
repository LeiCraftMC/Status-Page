<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from "#ui/types";
import type { GetAdminUsersResponses } from "@/api-client/types.gen";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useUserInfoStore } from "~/composables/stores/useUserStore";
import { zPostAdminUsersBody } from "~/api-client/zod.gen";

type AdminUser = GetAdminUsersResponses[200]["data"][number];

definePageMeta({
    layout: "dashboard",
});

useSeoMeta({
    title: "Users | LeiCraft_MC Status Page",
    description: "Manage users",
});

const toast = useToast();

// Check admin access
const userInfoStore = useUserInfoStore();
const currentUser = await userInfoStore.use();
if (!userInfoStore.isValid(currentUser)) {
    throw new Error('User not authenticated but trying to access Admin Users');
}

const isAdmin = currentUser.value.role === "admin";
if (!isAdmin) {
    await navigateTo("/");
}

const userColumns: TableColumn<AdminUser>[] = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "username", header: "Username" },
    { accessorKey: "display_name", header: "Display Name" },
    { accessorKey: "email", header: "Email" },
    { id: "role", header: "Role" },
    { id: "actions", header: "", enableSorting: false, enableHiding: false },
];

const roleOptions = [
    { label: "Admin", value: "admin" },
    { label: "Member", value: "member" },
];

const {
    data: users,
    loading,
    refresh,
} = await useAPILazyAsyncData<AdminUser[]>("admin-users-list", async () => {
    // Don't fire a doomed admin request when the access guard above is redirecting away.
    if (!isAdmin) return [];
    const res = await useAPI((api) => api.getAdminUsers({}));
    if (!res.success) {
        toast.add({
            title: "Failed to load users",
            description: res.message,
            color: "error",
        });
        return [];
    }
    return res.data;
});

function getUserOptionsDropdownItems(row: { original: AdminUser }): DropdownMenuItem[][] {
    return [
        [
            {
                label: "Edit",
                icon: "i-lucide-pencil",
                onSelect: () => openEdit(row.original),
            },
            {
                label: "Reset Password",
                icon: "i-lucide-key",
                onSelect: () => openPassword(row.original),
            },
        ],
        [
            {
                label: "Delete",
                icon: "i-lucide-trash-2",
                color: "error",
                onSelect: () => openDelete(row.original),
            },
        ],
    ];
}

const showCreateModal = ref(false);
const showEditModal = ref(false);
const showPasswordModal = ref(false);
const selectedUser = ref<AdminUser | null>(null);

const createSchema = zPostAdminUsersBody;

type CreateSchema = z.output<typeof createSchema>;

const createForm = reactive<CreateSchema>({
    username: "",
    display_name: "",
    email: "",
    password: "",
    role: "member",
});

const editForm = reactive({
    display_name: "",
    email: "",
    role: "member" as "admin" | "member",
});

const passwordForm = reactive({
    password: "",
});

async function handleCreate(event: FormSubmitEvent<CreateSchema>) {

    const res = await useAPI((api) => api.postAdminUsers({
        body: event.data
    }));

    if (res.success) {

        showCreateModal.value = false;
        createForm.username = "";
        createForm.display_name = "";
        createForm.email = "";
        createForm.password = "";
        createForm.role = "member";

        toast.add({
            title: "User created",
            color: "success"
        });

        await refresh();
    } else {

        toast.add({
            title: "Create failed",
            description: res.message,
            color: "error",
        });
    }
}

function openEdit(user: AdminUser) {
    selectedUser.value = user;
    editForm.display_name = user.display_name;
    editForm.email = user.email;
    editForm.role = user.role;
    showEditModal.value = true;
}

async function submitEdit() {
    if (!selectedUser.value) return;
    const target = selectedUser.value;
    const res = await useAPI((api) =>
        api.putAdminUsersByUserId({
            path: { userId: target.id },
            body: {
                display_name: editForm.display_name,
                email: editForm.email,
                role: editForm.role,
            },
        })
    );

    if (res.success) {
        toast.add({ title: "User updated", color: "success" });
        showEditModal.value = false;
        await refresh();
    } else {
        toast.add({
            title: "Update failed",
            description: res.message,
            color: "error",
        });
    }
}

function openPassword(user: AdminUser) {
    selectedUser.value = user;
    passwordForm.password = "";
    showPasswordModal.value = true;
}

async function submitPassword() {
    if (!selectedUser.value) return;
    const target = selectedUser.value;
    const res = await useAPI((api) =>
        api.putAdminUsersByUserIdPassword({
            path: { userId: target.id },
            body: { password: passwordForm.password },
        })
    );

    if (res.success) {
        toast.add({ title: "Password updated", color: "success" });
        showPasswordModal.value = false;
    } else {
        toast.add({
            title: "Update failed",
            description: res.message,
            color: "error",
        });
    }
}

// Delete with DashboardDeleteModal
const deleteConfirmOpen = ref(false);
const deleteTarget = ref<AdminUser | null>(null);

function openDelete(user: AdminUser) {
    deleteTarget.value = user;
    deleteConfirmOpen.value = true;
}

async function onDeleteUser() {
    if (!deleteTarget.value) return;
    const target = deleteTarget.value;
    const res = await useAPI((api) =>
        api.deleteAdminUsersByUserId({ path: { userId: target.id } })
    );
    if (res.success) {
        toast.add({ title: "User deleted", color: "success" });
        deleteConfirmOpen.value = false;
        deleteTarget.value = null;
        await refresh();
    } else {
        toast.add({
            title: "Delete failed",
            description: res.message,
            color: "error",
        });
    }
}

</script>

<template>
    <UDashboardPanel>
        <template #header>
            <DashboardPageHeader
                title="Users"
                icon="i-lucide-users"
                description="Manage users"
            />
        </template>

        <template #body>
            <DashboardPageBody>
                <DashboardDataTable
                    :data="users"
                    :columns="userColumns"
                    :loading="loading"
                    :filters="[
                        {
                            column: 'username',
                            type: 'text',
                            placeholder: 'Search users...',
                            icon: 'i-lucide-search',
                        },
                        {
                            column: 'role',
                            type: 'select',
                            placeholder: 'All Roles',
                            icon: 'i-lucide-filter',
                            options: [
                                { label: 'Admin', value: 'admin' },
                                { label: 'Member', value: 'member' },
                            ],
                        },
                    ]"
                    empty-title="No users"
                    empty-description="Create your first user to get started."
                    empty-icon="i-lucide-users"
                    @refresh="refresh"
                >
                    <template #header-right>
                        <UButton
                            label="New User"
                            icon="i-lucide-user-plus"
                            color="primary"
                            @click="showCreateModal = true"
                        />
                    </template>

                    <template #id-cell="{ row }">
                        <span class="font-mono text-sm">#{{ row.original.id }}</span>
                    </template>

                    <template #username-cell="{ row }">
                        <span class="font-medium">{{ row.original.username }}</span>
                    </template>

                    <template #email-cell="{ row }">
                        <span class="text-slate-400">{{ row.original.email }}</span>
                    </template>

                    <template #role-cell="{ row }">
                        <UBadge
                            :color="getRoleColor(row.original.role)"
                            variant="soft"
                        >
                            {{ row.original.role }}
                        </UBadge>
                    </template>

                    <template #actions-cell="{ row }">
                        <UDropdownMenu
                            :ui="{ viewport: 'main-bg-color' }"
                            :items="getUserOptionsDropdownItems(row)"
                        >
                            <UButton
                                icon="i-lucide-more-horizontal"
                                variant="ghost"
                                color="neutral"
                                size="xs"
                            />
                        </UDropdownMenu>
                    </template>

                    <template #empty-actions>
                        <UButton
                            label="Create User"
                            color="primary"
                            @click="showCreateModal = true"
                        />
                    </template>
                </DashboardDataTable>
            </DashboardPageBody>
        </template>
    </UDashboardPanel>

    <!-- Create User Modal -->
    <DashboardModal
        v-model:open="showCreateModal"
        title="Create User"
        icon="i-lucide-user-plus"
    >
        <UForm :schema="createSchema" :state="createForm" class="space-y-4" @submit="handleCreate">
            <UFormField label="Username" name="username" required>
                <UInput v-model="createForm.username" placeholder="johndoe" class="w-full" />
            </UFormField>
            <UFormField label="Display Name" name="display_name" required>
                <UInput v-model="createForm.display_name" placeholder="John Doe" class="w-full" />
            </UFormField>
            <UFormField label="Email" name="email" required>
                <UInput v-model="createForm.email" type="email" placeholder="john@example.com" class="w-full" />
            </UFormField>
            <UFormField label="Password" name="password" required>
                <UInput v-model="createForm.password" type="password" placeholder="••••••••" class="w-full" />
            </UFormField>
            <UFormField label="Role" name="role" required>
                <USelect v-model="createForm.role" :items="roleOptions" placeholder="Select role" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    @click="showCreateModal = false"
                />
                <UButton
                    type="submit"
                    label="Create"
                    color="primary"
                />
            </div>
        </UForm>
    </DashboardModal>

    <!-- Edit User Modal -->
    <DashboardModal
        v-model:open="showEditModal"
        :title="`Edit User: ${selectedUser?.username}`"
        icon="i-lucide-pencil"
    >
        <div class="space-y-4">
            <UFormField label="Display Name">
                <UInput v-model="editForm.display_name" class="w-full" />
            </UFormField>
            <UFormField label="Email">
                <UInput v-model="editForm.email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Role">
                <USelect v-model="editForm.role" :items="roleOptions" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    @click="showEditModal = false"
                />
                <UButton label="Save" color="primary" @click="submitEdit" />
            </div>
        </div>
    </DashboardModal>

    <!-- Password Modal -->
    <DashboardModal
        v-model:open="showPasswordModal"
        :title="`Reset Password: ${selectedUser?.username}`"
        icon="i-lucide-key"
        icon-color="warning"
    >
        <div class="space-y-4">
            <UFormField label="New Password">
                <UInput
                    v-model="passwordForm.password"
                    type="password"
                    placeholder="••••••••"
                    class="w-full"
                />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
                <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    @click="showPasswordModal = false"
                />
                <UButton
                    label="Update Password"
                    color="primary"
                    @click="submitPassword"
                />
            </div>
        </div>
    </DashboardModal>

    <!-- Delete User Modal -->
    <DashboardDeleteModal
        title="Delete User"
        :warning-text="`Are you sure you want to delete user &quot;${deleteTarget?.username || ''}&quot;? This action cannot be undone.`"
        v-model:open="deleteConfirmOpen"
        :on-delete="onDeleteUser"
        :prevent-auto-close="true"
    />
</template>
