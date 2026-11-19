.PHONY: setup lint fmt test pipeline amostra json site check

setup:
	uv sync

lint:
	uv run ruff check . && uv run ruff format --check .

fmt:
	uv run ruff check --fix . && uv run ruff format .

test:
	uv run pytest

pipeline:
	uv run python -m preco_na_bomba.pipeline

amostra:
	uv run python -m preco_na_bomba.pipeline --amostra

json:
	uv run python -m preco_na_bomba.exportar

site:
	cd site && pnpm install && pnpm dev

check: lint test
