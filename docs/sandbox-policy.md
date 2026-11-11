# Policy and Profiles

Governed mode is configured by three files under `openshell/`:

| File | Role |
|---|---|
| `openshell/policy/crowd-counter-agent.yaml` | Sandbox policy: filesystem, Landlock, process identity. Holds **no** network rules. |
| `openshell/profile/ollama-openai.yaml` | Inference provider profile: host-local Ollama, credentialless. |
| `openshell/profile/minio-aistor-s3.yaml` | Data provider profile: host-local AIStor, static credentials held gateway-side, SigV4 re-signed by the gateway. |

## Sandbox policy — `crowd-counter-agent.yaml`

| Field | Value | Why |
|---|---|---|
| `version` | `1` | Policy schema version. |
| `filesystem_policy.include_workdir` | `true` | `/sandbox` (the image `WORKDIR`) is read-write. |
| `filesystem_policy.read_only` | `/bin`, `/usr`, `/lib`, `/proc`, `/dev/urandom`, `/etc`, `/var/log` | System paths readable, nothing writable. |
| `filesystem_policy.read_write` | `/tmp`, `/dev/null` | Scratch space for the agent. |
| `landlock.compatibility` | `hard_requirement` | The sandbox refuses to start without Landlock ABI >= 3 (linux/wsl2). |
| `process.run_as_user` / `run_as_group` | `1500` | Non-root `sandbox` identity, matching `USER sandbox` in `agent/Dockerfile.sandbox`. |

Network rules are intentionally absent from the policy: the attached provider
profiles contribute the only allow rules (`host.openshell.internal:11434` for
Ollama and `:9000` for AIStor). `openshell policy get crowd-counter --full`
shows exactly those plus this policy and nothing else — default-deny egress,
seccomp, and Landlock are implicit OpenShell behavior.

## Provider profiles

### `ollama-openai.yaml` — inference, credentialless

- `category: inference`, `inference_capable: true`, `credentials: []`
- Endpoint `host.openshell.internal:11434`, `protocol: rest`, `access: read-write`
- `binaries` trimmed to paths that actually exist in the workload image:
  `/usr/bin/curl`, `/usr/local/bin/python*`, `/sandbox/.venv/**`

### `minio-aistor-s3.yaml` — data, gateway-signed

- `category: data`; credentials `access_key_id` / `secret_access_key` with
  `refresh.strategy: static`
- `env_vars` declare both `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  (required by the SigV4 signer) and `S3_ACCESS_KEY` / `S3_SECRET_KEY` (the
  names the agent code reads), so the placeholder lands in the agent env and
  the gateway re-signs
- Endpoint `host.openshell.internal:9000` with `credential_signing: sigv4`,
  `signing_service: s3`, `signing_region: us-east-1` (non-standard host)
- The real keys are passed gateway-side via
  `openshell provider create --credential ...` and never stored in the repo;
  the sandbox env only ever holds `openshell:resolve:env:...` placeholders

## Schema conformance

Only schema-valid top-level fields are allowed: `version`, `filesystem_policy`,
`landlock`, `process`, `network_policies`, `network_middlewares`. Unknown
fields are rejected by the gateway, and
`__tests__/openshell/schema-conformance.test.ts` fails the build if an invented
field (e.g. `masked_paths`, `default_egress`, `no_new_privileges`) appears in
any of these files.
