# AI Enrich Data

A CLI tool for data enrichment.

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Installation

1. **Clone the repository:**

    ```bash
    git clone https://github.com/yourusername/ai-enrich-data.git
    cd ai-enrich-data
    ```

### Running the Application

You can run the application using Docker.

#### Using Docker

1. **Build and run the Docker container:**

    ```bash
    docker compose up --build
    ```

2. **Access the application:**

    The application will run and you should see the output in the terminal.

### Running Tests

To run the tests, use the following command:

```bash
docker compose run --rm app poetry run pytest
```

### Code Quality Checks

To run code quality checks, use the following commands:

```bash
docker compose run --rm app poetry run flake8 .
docker compose run --rm app poetry run black --check .
docker compose run --rm app poetry run mypy .
```

### Running Full QA

To run the full QA (tests and code quality checks) using the `ci.bash` script, use the following command:

```bash
./ci.bash
```

### Contributing

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes.
4. Commit your changes (`git commit -am 'Add new feature'`).
5. Push to the branch (`git push origin feature-branch`).
6. Create a new Pull Request.

### License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
