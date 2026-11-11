// Schema conformance for the OpenShell artifacts (commit 8 of the IDD plan).
//
// The allowlist in ./schema-allowlist.ts is GENERATED from the authoritative
// NVIDIA schema reference (see scripts/openshell/gen-schema-allowlist.mjs):
// a field is legal only if the schema lists it. An invented-but-plausible
// field (masked_paths / default_egress / no_new_privileges) therefore fails
// this test — such a regression must be impossible to ship.
import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import YAML from "yaml"
import {
  POLICY_FIELDS,
  PROFILE_FIELDS,
  PROFILE_CREDENTIAL_FIELDS,
  PROFILE_REFRESH_FIELDS,
} from "./schema-allowlist"

const REPO = path.resolve(__dirname, "../..")
const POLICY_DIR = path.join(REPO, "openshell/policy")
const PROFILE_DIR = path.join(REPO, "openshell/profile")

function loadYaml(file: string): unknown {
  return YAML.parse(readFileSync(file, "utf8"))
}

/** Recursively collect every mapping key at paths where keys are field names. */
function collectKeys(node: unknown, pathKey: string | null, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectKeys(item, pathKey, out)
    return
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      // under network_policies / network_middlewares the immediate keys are
      // dynamic rule names, not schema fields
      const isRuleName = pathKey === "network_policies" || pathKey === "network_middlewares"
      if (!isRuleName) out.push(k)
      collectKeys(v, k, out)
    }
  }
}

function expectKeysAllowed(keys: string[], allow: ReadonlySet<string>, file: string): void {
  const unknown = keys.filter((k) => !allow.has(k))
  expect(unknown, `${file}: unknown fields not in the schema allowlist: ${unknown.join(", ")}`).toEqual([])
}

function validatePolicyDoc(doc: unknown, file: string): void {
  expect(doc && typeof doc === "object", `${file}: policy must be a mapping`).toBe(true)
  const keys: string[] = []
  collectKeys(doc, null, keys)
  expectKeysAllowed(keys, POLICY_FIELDS, file)
  const d = doc as Record<string, unknown>
  expect(d.version, `${file}: version is required`).toBe(1)
}

function validateProfileDoc(doc: unknown, file: string): void {
  const d = doc as Record<string, unknown>
  expect(d && typeof d === "object", `${file}: profile must be a mapping`).toBe(true)
  expectKeysAllowed(Object.keys(d), PROFILE_FIELDS, file)
  for (const cred of (d.credentials as Record<string, unknown>[] | undefined) ?? []) {
    expectKeysAllowed(Object.keys(cred), PROFILE_CREDENTIAL_FIELDS, `${file} credentials[]`)
    if (cred.refresh && typeof cred.refresh === "object") {
      expectKeysAllowed(Object.keys(cred.refresh as object), PROFILE_REFRESH_FIELDS, `${file} credentials[].refresh`)
    }
  }
  for (const ep of (d.endpoints as Record<string, unknown>[] | undefined) ?? []) {
    expectKeysAllowed(Object.keys(ep), POLICY_FIELDS, `${file} endpoints[]`)
  }
}

describe("openshell policy schema conformance", () => {
  const files = readdirSync(POLICY_DIR).filter((f) => f.endsWith(".yaml"))
  it("has at least one policy file", () => expect(files.length).toBeGreaterThan(0))
  for (const f of files) {
    it(`${f}: only schema-listed fields`, () => validatePolicyDoc(loadYaml(path.join(POLICY_DIR, f)), f))
  }
})

describe("openshell provider profile schema conformance", () => {
  const files = readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".yaml"))
  it("has at least one profile file", () => expect(files.length).toBeGreaterThan(0))
  for (const f of files) {
    it(`${f}: only schema-listed fields`, () => validateProfileDoc(loadYaml(path.join(PROFILE_DIR, f)), f))
  }
})

describe("tamper tests: invented fields must fail", () => {
  const tampered = [
    "version: 1\nmasked_paths: [/etc/shadow]\n",
    "version: 1\ndefault_egress: allow\nnetwork_policies: {}\n",
    "version: 1\nno_new_privileges: true\n",
    "version: 1\nnetwork_policies:\n  x:\n    endpoints:\n      - host: example.com\n        port: 443\n        invented_field: 1\n",
  ]
  for (const [i, src] of tampered.entries()) {
    it(`tampered policy #${i} is rejected`, () => {
      const doc = YAML.parse(src)
      const keys: string[] = []
      collectKeys(doc, null, keys)
      // the validator must throw on the unknown field
      expect(() => expectKeysAllowed(keys, POLICY_FIELDS, `tampered#${i}`)).toThrow(/unknown fields/)
    })
  }
})
