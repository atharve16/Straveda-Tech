"""Resolve optional reference inputs without coupling the APK to them."""

import os
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]


def reference_dir(env_name: str, folder: str) -> Path:
    configured = os.environ.get(env_name)
    candidates = ([Path(configured).expanduser()] if configured else [
        REPO / 'source-code' / folder,
        REPO / folder,  # Older repository layout.
    ])
    for path in candidates:
        if path.is_dir():
            return path.resolve()
    searched = ', '.join(str(path) for path in candidates)
    raise FileNotFoundError(
        f'{folder} reference data was not found. Set {env_name} to its directory. '
        f'Searched: {searched}'
    )
