# Jarvis API: local Docker and Cloud Run.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080

WORKDIR /srv

# Dependencies first so code changes don't bust the cache.
COPY pyproject.toml ./
RUN mkdir jarvis_core jarvis_api \
    && touch jarvis_core/__init__.py jarvis_api/__init__.py \
    && pip install . \
    && rm -rf jarvis_core jarvis_api

COPY jarvis_core ./jarvis_core
COPY jarvis_api ./jarvis_api
COPY migrations ./migrations
COPY alembic.ini ./
RUN pip install --no-deps .

RUN useradd --system --uid 10001 jarvis
USER jarvis

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/healthz')"
CMD ["sh", "-c", "exec uvicorn jarvis_api.main:app --host 0.0.0.0 --port ${PORT}"]
