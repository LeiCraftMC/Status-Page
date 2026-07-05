import { Hono } from "hono";
import { APIVersionRouter } from "../../utils/apiVersionRouter";
import type { GenerateSpecOptions } from "hono-openapi";
import { router as authRouter } from "./routes/auth";
import { router as accountRouter } from "./routes/account";
import { router as adminRouter } from "./routes/admin";
import { router as usersRouter } from "./routes/users";
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
        ],

        "x-tagGroups": [
            {
                name: "Admin",
                tags: [
                    "Admin / Users",
                ],
            },
            {
                name: "Account & Authentication",
                tags: [
                    "Account",
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
                name: "Account",
                description: "Endpoints for user account management",
            },
            {
                name: "Authentication",
                description: "Endpoints for authentication and authorization",
            },
            {
                name: "Users",
                description: "Public user search, allowing authenticated users to find other users.",
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

export class APIv1Router extends APIVersionRouter {
    constructor() {
        super({
            version: 1,
            openAPIConfig,
            routes: router
        });
    }
}
