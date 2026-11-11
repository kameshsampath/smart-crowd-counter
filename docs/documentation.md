# Building These Docs

!!! note "Not part of the published site"
    This page is excluded from the built site (`exclude_docs` in `mkdocs.yaml`)
    and kept in the repo for contributors working on the docs.

The docs are a [MkDocs](https://www.mkdocs.org/) site using the
[Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) theme.
Configuration lives in `mkdocs.yaml` at the repo root; pages live in `docs/`.

## Serve locally

The docs are a uv project (`docs/pyproject.toml` + `docs/uv.lock`):

```sh
uv sync --project docs                 # one-time; creates docs/.venv
uv run --project docs mkdocs serve -a 127.0.0.1:8080   # default port 8000 collides with the agent
```

Open <http://127.0.0.1:8080>. Without uv, `pip install -r docs/requirements.txt`
works too — that file is generated from the pyproject with
`uv pip compile docs/pyproject.toml -o docs/requirements.txt` and is what CI uses.

## Build

```sh
uv run --project docs mkdocs build --strict   # output in site/, which is git-ignored
```

## Layout

- `mkdocs.yaml` — site config: Material theme features, navigation, Markdown
  extensions (mermaid diagrams render through a `pymdownx.superfences` custom
  fence), the `search` plugin, and `docs/stylesheets/extra.css` overrides.
- `pyproject.toml` / `uv.lock` — docs toolchain as a uv project (`package = false`);
  `requirements.txt` is the pip/CI export of it. Both are excluded from the
  built site via `exclude_docs`.
- Existing deep dives (`openshell.md`, `governed-agent.md`) are part of the nav
  under "Governed Agent (OpenShell)". The `idd/` design artifact is excluded
  from the built site like this page.

To add a page: create `docs/<page>.md` and add it to `nav:` in `mkdocs.yaml` —
`mkdocs build --strict` fails on pages missing from the nav.

## Publishing

`.github/workflows/docs.yml` builds the site with `mkdocs build --strict` on
every push to `main` (and on manual dispatch) and publishes `site/` to the
`gh-pages` branch. To serve the site, enable GitHub Pages in the repo
settings with "Deploy from a branch" → `gh-pages` / `/ (root)`; it will be
available at the `site_url` in `mkdocs.yaml`.
