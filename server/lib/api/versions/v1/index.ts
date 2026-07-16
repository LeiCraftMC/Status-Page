import { Hono } from "hono";
import { APIVersionRouter } from "../../utils/apiVersionRouter";
import type { GenerateSpecOptions } from "hono-openapi";
import { router as authRouter } from "./routes/auth";
import { router as accountRouter } from "./routes/account";
import { router as adminRouter } from "./routes/admin";
import { router as usersRouter } from "./routes/users";
import { router as monitorsRouter } from "./routes/monitors";
import { router as statusPagesRouter } from "./routes/status-pages";
import { router as publicStatusPagesRouter } from "./routes/status-pages/public";
import { authMiddlewareV1 } from "./middleware/auth";

const openAPIConfig: Partial<GenerateSpecOptions> = {

    documentation: {
        info: {
            title: "LeiCraft_MC Status Page API",
            version: "1.0.0",
            description: "LeiCraft_MC Status Page API. Endpoints are scoped by resource and gated by per-route permission checks.",
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description: "Enter your bearer token in the format **Bearer &lt;token&gt;**",
                }
            },
            responses: {
                undefined: {
                    description: "Authentication information is missing or invalid",
                },
            },
        },

        security: [{
            bearerAuth: []
        }],

        servers: [
            {
                url: "http://localhost:12336/api/v1/",
                description: "Local development server",
            },
            {
                url: "https://status.leicraftmc.com/api/v1/",
                description: "Production server",
            }
        ],

        "x-tagGroups": [
            {
                name: "Admin",
                tags: [
                    "Admin / Users",
                    "Admin / Monitors",
                    "Admin / Status Pages",
                    "Admin / Settings",
                ],
            },
            {
                name: "Status Page",
                tags: [
                    "Monitors",
                    "Status Pages",
                    "Status Page Content",
                    "Public Status Pages",
                ],
            },
            {
                name: "Account & Authentication",
                tags: [
                    "Account",
                    "Account / API Keys",
                    "Authentication",
                ],
            }
        ],

        tags: [
            {
                name: "Admin / Users",
                // @ts-ignore
                "x-displayName": "Users",
                summary: "Users",
                parent: "Admin",
                description: "Site-admin user management.",
            },
            {
                name: "Admin / Monitors",
                // @ts-ignore
                "x-displayName": "Monitors",
                summary: "Monitors",
                parent: "Admin",
                description: "Site-admin monitor management.",
            },
            {
                name: "Admin / Status Pages",
                // @ts-ignore
                "x-displayName": "Status Pages",
                summary: "Status Pages",
                parent: "Admin",
                description: "Site-admin status page management.",
            },
            {
                name: "Admin / Settings",
                // @ts-ignore
                "x-displayName": "Settings",
                summary: "Settings",
                parent: "Admin",
                description: "Site-admin application settings.",
            },
            {
                name: "Account",
                description: "Endpoints for user account management",
            },
            {
                name: "Account / API Keys",
                // @ts-ignore
                "x-displayName": "API Keys",
                summary: "API Keys",
                parent: "Account",
                description: "Endpoints for managing account API keys",
            },
            {
                name: "Authentication",
                description: "Endpoints for authentication and authorization",
            },
            {
                name: "Users",
                description: "Public user search, allowing authenticated users to find other users.",
            },
            {
                name: "Monitors",
                description: "Authenticated read access to monitors and their status.",
            },
            {
                name: "Status Pages",
                description: "Authenticated read access to status pages.",
            },
            {
                name: "Status Page Content",
                description: "Authenticated posting of incidents, maintenance, and updates on status pages.",
            },
            {
                name: "Public Status Pages",
                description: "Unauthenticated public access to status pages and monitors.",
            }
        ]
    }
};

const router = new Hono();

router.use(authMiddlewareV1);

router.route("/", authRouter);
router.route("/", accountRouter);
router.route("/", adminRouter);
router.route("/", usersRouter);
router.route("/", monitorsRouter);
router.route("/", statusPagesRouter);
router.route("/", publicStatusPagesRouter);

export class APIv1Router extends APIVersionRouter {
    constructor() {
        super({
            version: 1,
            openAPIConfig,
            routes: router
        });
    }
}
