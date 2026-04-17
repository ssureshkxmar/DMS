from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.lifespan import lifespan
from app.core.logging import configure_logging
from app.routers.driver_monitoring import router as driver_monitoring_router
from app.routers.health import router as health_router
from app.routers.webrtc import router as webrtc_router


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(
        title=settings.app_name,
        description="API for the Suraksha Driver Safety Monitoring App",
        lifespan=lifespan,
        license_info={
            "name": "Apache 2.0",
            "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
        },
        docs_url="/swagger",
        redoc_url="/docs",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(webrtc_router)
    app.include_router(driver_monitoring_router)

    @app.get("/", include_in_schema=False)
    def root():
        return RedirectResponse(url="/docs")

    # Custom OpenAPI
    def custom_openapi():
        if app.openapi_schema:
            return app.openapi_schema

        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            terms_of_service=app.terms_of_service,
            contact=app.contact,
            license_info=app.license_info,
            routes=app.routes,
            servers=app.servers,
        )

        openapi_schema["paths"]["/ws/driver-monitoring"] = {
            "get": {
                "tags": ["driver_monitoring"],
                "summary": "WebSocket: Driver Monitoring",
                "description": (
                    "This is a WebSocket endpoint.\n\n"
                    "Connect with a WebSocket client to:\n"
                    "`ws://<host>/ws/driver-monitoring`\n\n"
                    "Send JSON messages with types: `offer`, `answer`, `ice-candidate`."
                ),
            }
        }

        app.openapi_schema = openapi_schema
        return app.openapi_schema

    app.openapi = custom_openapi

    return app


app = create_app()
