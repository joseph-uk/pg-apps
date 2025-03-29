#!/bin/bash

set -e

# Function to check if running inside Docker
is_docker() {
    [[ -f /.dockerenv ]]
}

if is_docker; then
    echo "Running inside Docker container..."
else
    echo "Not running inside Docker container. Re-running inside Docker..."
    docker compose run --rm app ./ci.bash
    exit 0
fi

echo "Running flake8..."
poetry run flake8 .

echo "Running black..."
poetry run black --check .

echo "Running mypy..."
poetry run mypy .

echo "Running pytest..."
poetry run pytest

echo "All checks passed!"
