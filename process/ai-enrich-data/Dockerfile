FROM python:3.10-slim

WORKDIR /app

COPY pyproject.toml /app/

RUN pip install poetry

# Use a shared volume for dependencies
VOLUME /app/poetry_cache

RUN poetry install

COPY . /app

ENTRYPOINT ["poetry", "run", "python", "ai_enrich_data/main.py"]
