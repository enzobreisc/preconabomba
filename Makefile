.PHONY: setup lint fmt test pipeline amostra app req check

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

app:
	uv run streamlit run app.py

req:
	uv export --no-dev --no-hashes --no-emit-project -o requirements.txt && echo "-e ." >> requirements.txt

check: lint test
