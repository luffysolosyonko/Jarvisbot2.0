from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Jarvis API", version="0.1.0")

    @app.get("/healthz", tags=["ops"])
    def healthz() -> dict[str, str]:
        """Liveness probe for Cloud Run. Unauthenticated by design."""
        return {"status": "ok"}

    return app


app = create_app()
