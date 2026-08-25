# Scripts

Start and stop the app. Both pairs do the same thing; pick the one for your platform.

| Script | Platform |
| --- | --- |
| `start.sh`, `stop.sh` | Mac and Linux |
| `start.ps1`, `stop.ps1` | Windows |

## Usage

```
./scripts/start.sh          # Mac, Linux
./scripts/stop.sh

powershell ./scripts/start.ps1   # Windows
powershell ./scripts/stop.ps1
```

`start` builds the image and starts the container detached, then prints
`http://localhost:8000`. `stop` runs `docker compose down`, which stops and removes the
container while leaving the `pm-data` volume, so the database survives a restart.

## Behaviour

- Each script changes to the project root first, so they work from any directory
- `start` fails early with a clear message if `.env` is missing from the project root
- `start` generates a random `SECRET_KEY` into `.env` when there is not one already, and
  compose passes it to the container through `env_file`. Without it the container would sign
  session cookies with the fallback in `backend/app/main.py`, which is published in the
  source, so anyone who had read the repository could forge a session. It is written once
  and kept, so a restart does not sign everyone out
- Shell scripts use `set -euo pipefail`; PowerShell scripts use
  `$ErrorActionPreference = "Stop"` and check `$LASTEXITCODE` after `docker compose`,
  because a native command's non-zero exit does not trigger PowerShell's error handling

## Requirements

Docker must be installed and its engine running. On Windows that means Docker Desktop with
the WSL2 backend, which needs the "Virtual Machine Platform" and "Windows Subsystem for
Linux" optional features enabled.
