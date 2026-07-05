import { client } from "@/api-client/client.gen";
import { useRuntimeAppConfigs } from "./useRuntimeAppConfigs";

export function updateAPIClient(token: string | null) {

    const appUrl = useRuntimeAppConfigs().appUrl.replace(/\/$/, "");
    const apiURL = appUrl + "/api/v1"

    if (token) {
        client.setConfig({
            baseURL: apiURL,
            headers: {
                Authorization: `Bearer ${token}`
            },
            ignoreResponseError: true
        });
    } else {
        client.setConfig({
            baseURL: apiURL,
            ignoreResponseError: true
        });
    }
}