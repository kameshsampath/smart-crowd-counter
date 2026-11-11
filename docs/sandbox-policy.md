# Policy and Profiles

Governed mode is configured by three files under `openshell/`. Each file is
embedded below with numbered callouts and explained underneath; the GitHub
links open the source on `main`.

| File |  Role |
|---|------|
| [`openshell/policy/crowd-counter-agent.yaml`](https://github.com/kameshsampath/smart-crowd-counter/blob/main/openshell/policy/crowd-counter-agent.yaml) | Sandbox policy: filesystem, Landlock, process identity. Holds **no** network rules. |
| [`openshell/profile/ollama-openai.yaml`](https://github.com/kameshsampath/smart-crowd-counter/blob/main/openshell/profile/ollama-openai.yaml) | Inference provider profile: host-local Ollama, credentialless. |
| [`openshell/profile/minio-aistor-s3.yaml`](https://github.com/kameshsampath/smart-crowd-counter/blob/main/openshell/profile/minio-aistor-s3.yaml) | Data provider profile: host-local AIStor, static credentials held gateway-side, SigV4 re-signed by the gateway. |

## Sandbox policy — `crowd-counter-agent.yaml`

```yaml
--8<-- "openshell/policy/crowd-counter-agent.yaml"
```

1. `version` — policy schema version.
2. `include_workdir: true` — `/sandbox` (the image `WORKDIR`) is read-write.
3. `read_only` — system paths (`/bin`, `/usr`, `/lib`, `/proc`, `/etc`, …) readable, nothing writable.
4. `read_write` — scratch space for the agent: `/tmp` and `/dev/null`.
5. `landlock.compatibility: hard_requirement` — the sandbox refuses to start without Landlock ABI >= 3 (linux/wsl2).
6. `process.run_as_user` / `run_as_group: "1500"` — non-root `sandbox` identity, matching `USER sandbox` in `agent/Dockerfile.sandbox`.

!!! note
    Network rules are intentionally absent from the policy provider
    profiles contribute the only allow rules:
      - `host.openshell.internal:11434` for Ollama 
      - `host.openshell.internal:9000` for AIStor
    
    `openshell policy get crowd-counter --full` shows exactly those plus this policy.

## Profiles 

### `ollama-openai.yaml` (inference, credentialless)

```yaml
--8<-- "openshell/profile/ollama-openai.yaml"
```

1. `id` — the profile name referenced when attaching the provider to the sandbox.
2. `category: inference` + `inference_capable: true` — this is the credentialless inference path ([NVIDIA inference docs](https://docs.nvidia.com/openshell/latest/how-it-works/inference)).
3. `credentials: []` — no credentials at all; Ollama needs none.
4. Endpoint `host.openshell.internal:11434` — host-local services are reached via this hostname, never loopback.
5. `binaries` — trimmed to paths that actually exist in the workload image (`agent/Dockerfile.sandbox`); anything else is denied even on an allowed endpoint.

### `minio-aistor-s3.yaml` (data, gateway-signed)

```yaml
--8<-- "openshell/profile/minio-aistor-s3.yaml"
```

1. `id` — profile name referenced when attaching the provider.
2. `category: data` — a data provider, not inference ([NVIDIA provider profiles](https://docs.nvidia.com/openshell/latest/how-it-works/providers/profiles)).
3. `env_vars` declare both `AWS_*` (required by the SigV4 signer) and `S3_*` (the names the agent code reads), so the placeholder lands in the agent env and the gateway re-signs. The real keys are passed gateway-side via `openshell provider create --credential ...` and never stored in the repo.
4. Endpoint `host.openshell.internal:9000` — never `127.0.0.1`/`localhost`; network policy never authorizes loopback.
5. `credential_signing: sigv4` + `signing_service: s3` — the gateway holds the secret and signs S3 requests gateway-side; the sandbox only ever sees `openshell:resolve:env:...` placeholders.
6. `binaries` — trimmed to `/usr/bin/curl`, the only binary the workload needs for this endpoint.

!!! note "Schema conformance"
    Only schema-valid top-level fields are allowed (`version`, `filesystem_policy`,
    `landlock`, `process`, `network_policies`, `network_middlewares`) — see the
    [NVIDIA policy schema reference](https://docs.nvidia.com/openshell/latest/how-it-works/policies/schema).
    Unknown fields are rejected by the gateway; default-deny egress, seccomp,
    and Landlock are implicit OpenShell behavior.
