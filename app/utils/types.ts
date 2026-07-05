import type {
    GetAccountResponses,
} from "~/api-client";

export namespace UtilityTypes {

    export type SomePartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;

}


export type UserInfo = GetAccountResponses["200"]["data"];

