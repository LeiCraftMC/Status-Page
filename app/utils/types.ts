import type {
    GetAccountResponses,
    GetClaudeProjectsByAbsolutePathResponses
} from "~/api-client";

export namespace UtilityTypes {

    export type SomePartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;

}


export type UserInfo = GetAccountResponses["200"]["data"];


export type Project = GetClaudeProjectsByAbsolutePathResponses["200"]["data"];
export type ProjectWithSessions = {
    exists: true;
    name: string;
    absolute_path: string;
    last_used: number;
    sessions: Array<{
        session_id: string;
        title: string;
        last_modified: number;
        git_branch?: string;
        created_at?: number;
    }>;
} | {
    exists: false;
    name: string;
    absolute_path: string;
    last_used: unknown;
    sessions: Array<{
        session_id: string;
        title: string;
        last_modified: number;
        git_branch?: string;
        created_at?: number;
    }>;
}