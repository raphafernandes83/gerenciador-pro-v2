from pathlib import Path


def patch(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise SystemExit(f"expected pattern missing: {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count))
    return True


changed = False

# Worker: gera capability token antes do INSERT e o envia somente server-side.
changed |= patch(
    "src/worker.js",
    '''async function sha256Hex(value) {\n  const data = new TextEncoder().encode(String(value || ""));\n  const digest = await crypto.subtle.digest("SHA-256", data);\n  return [...new Uint8Array(digest)]\n    .map((byte) => byte.toString(16).padStart(2, "0"))\n    .join("");\n}\n''',
    '''async function sha256Hex(value) {\n  const data = new TextEncoder().encode(String(value || ""));\n  const digest = await crypto.subtle.digest("SHA-256", data);\n  return [...new Uint8Array(digest)]\n    .map((byte) => byte.toString(16).padStart(2, "0"))\n    .join("");\n}\n\nfunction randomHex(bytes = 32) {\n  return [...crypto.getRandomValues(new Uint8Array(bytes))]\n    .map((byte) => byte.toString(16).padStart(2, "0"))\n    .join("");\n}\n''',
)

changed |= patch(
    "src/worker.js",
    '''  return {\n    submission_id: record.submission_id,''',
    '''  return {\n    _mirror_auth_token: clean(record.mirror_auth_token, 128),\n    submission_id: record.submission_id,''',
)

changed |= patch(
    "src/worker.js",
    '''            enviado_em_local, payload_json, sheet_sync_status\n     FROM leads WHERE submission_id = ? LIMIT 1`''',
    '''            enviado_em_local, payload_json, sheet_sync_status, mirror_auth_token\n     FROM leads WHERE submission_id = ? LIMIT 1`''',
)

changed |= patch(
    "src/worker.js",
    '''    enviado_em_local: clean(payload.enviado_em_local, 100) || null\n  };''',
    '''    enviado_em_local: clean(payload.enviado_em_local, 100) || null,\n    mirror_auth_token: randomHex(32)\n  };''',
)

changed |= patch(
    "src/worker.js",
    '''        pagina_url, user_agent, enviado_em_local, payload_json\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
    '''        pagina_url, user_agent, enviado_em_local, payload_json, mirror_auth_token\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
)

changed |= patch(
    "src/worker.js",
    '''      record.utm_campaign, record.pagina_url, record.user_agent,\n      record.enviado_em_local, JSON.stringify(payload)\n    ).run();''',
    '''      record.utm_campaign, record.pagina_url, record.user_agent,\n      record.enviado_em_local, JSON.stringify(payload), record.mirror_auth_token\n    ).run();''',
)

# Authorization endpoint: exige token correto E payload canônico.
changed |= patch(
    "src/worker-entry.js",
    '''function mirrorPayloadMatches(expected, supplied) {\n  const keys = Object.keys(expected);\n  return keys.every((key) => mirrorValue(supplied?.[key], 5000) === expected[key]);\n}\n''',
    '''function mirrorPayloadMatches(expected, supplied) {\n  const keys = Object.keys(expected);\n  return keys.every((key) => mirrorValue(supplied?.[key], 5000) === expected[key]);\n}\n\nasync function mirrorTokenMatches(expected, supplied) {\n  const expectedToken = mirrorValue(expected, 128);\n  const suppliedToken = mirrorValue(supplied, 128);\n  if (!/^[a-f0-9]{64}$/.test(expectedToken) || !/^[a-f0-9]{64}$/.test(suppliedToken)) return false;\n  const encoder = new TextEncoder();\n  const [expectedHash, suppliedHash] = await Promise.all([\n    crypto.subtle.digest("SHA-256", encoder.encode(expectedToken)),\n    crypto.subtle.digest("SHA-256", encoder.encode(suppliedToken))\n  ]);\n  const a = new Uint8Array(expectedHash);\n  const b = new Uint8Array(suppliedHash);\n  let diff = 0;\n  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];\n  return diff === 0;\n}\n''',
)

changed |= patch(
    "src/worker-entry.js",
    '''              pagina_url,user_agent,enviado_em_local,payload_json,sheet_sync_status\n       FROM leads WHERE submission_id = ? LIMIT 1`''',
    '''              pagina_url,user_agent,enviado_em_local,payload_json,sheet_sync_status,mirror_auth_token\n       FROM leads WHERE submission_id = ? LIMIT 1`''',
)

changed |= patch(
    "src/worker-entry.js",
    '''    const expected = expectedMirrorPayload(lead);\n    if (!mirrorPayloadMatches(expected, supplied)) {''',
    '''    if (!(await mirrorTokenMatches(lead.mirror_auth_token, supplied?._mirror_auth_token))) {\n      console.warn("mirror_token_mismatch");\n      return json({ ok: false, error: "mirror_unauthorized" }, 403);\n    }\n\n    const expected = expectedMirrorPayload(lead);\n    if (!mirrorPayloadMatches(expected, supplied)) {''',
)

# Queue HTTP pull.
changed |= patch(
    "scripts/pull-sheet-retry-queue.mjs",
    '''  return {\n    ...original,\n    submission_id: row.submission_id,''',
    '''  return {\n    ...original,\n    _mirror_auth_token: clean(row.mirror_auth_token, 128),\n    submission_id: row.submission_id,''',
)
changed |= patch(
    "scripts/pull-sheet-retry-queue.mjs",
    '''            enviado_em_local,payload_json,sheet_sync_status,sheet_sync_attempts\n     FROM leads WHERE submission_id=? LIMIT 1`,''',
    '''            enviado_em_local,payload_json,sheet_sync_status,sheet_sync_attempts,mirror_auth_token\n     FROM leads WHERE submission_id=? LIMIT 1`,''',
)
changed |= patch(
    "scripts/pull-sheet-retry-queue.mjs",
    '''async function mirror(row) {\n  const controller = new AbortController();''',
    '''async function mirror(row) {\n  if (!/^[a-f0-9]{64}$/.test(clean(row.mirror_auth_token, 128))) {\n    throw new Error("mirror_auth_token_missing");\n  }\n  const controller = new AbortController();''',
)

# Reconciliador. O SELECT é preparado por fix-reconcile-mirror-token.py.
changed |= patch(
    "scripts/reconcile-sheets.mjs",
    '''  return {\n    ...original,\n    submission_id: row.submission_id,''',
    '''  return {\n    ...original,\n    _mirror_auth_token: String(row.mirror_auth_token || "").trim().slice(0, 128),\n    submission_id: row.submission_id,''',
)
changed |= patch(
    "scripts/reconcile-sheets.mjs",
    '''async function mirror(row) {\n  const controller = new AbortController();''',
    '''async function mirror(row) {\n  if (!/^[a-f0-9]{64}$/.test(String(row.mirror_auth_token || "").trim())) {\n    throw new Error("mirror_auth_token_missing");\n  }\n  const controller = new AbortController();''',
)

# Apps Script seguro v3.
p = Path("scripts/apps-script/Code.secure.gs")
text = p.read_text()
if 'VERSION: "2026-08-23.3"' not in text:
    text = text.replace("Versão: 2026-08-23.2", "Versão: 2026-08-23.3")
    text = text.replace('VERSION: "2026-08-23.2"', 'VERSION: "2026-08-23.3"')
    old = '''  const submissionId = cleanText_(payload.submission_id);\n  if (!submissionId) {\n    throw new Error("MIRROR_UNAUTHORIZED");\n  }'''
    new = '''  const submissionId = cleanText_(payload.submission_id);\n  const mirrorAuthToken = plainText_(payload._mirror_auth_token, 128);\n  if (!submissionId || !/^[a-f0-9]{64}$/.test(mirrorAuthToken)) {\n    throw new Error("MIRROR_UNAUTHORIZED");\n  }'''
    if old not in text:
        raise SystemExit("Apps Script auth gate pattern missing")
    text = text.replace(old, new, 1)
    old = '''  return {\n    submission_id: plainText_(payload.submission_id, 120),'''
    new = '''  return {\n    _mirror_auth_token: plainText_(payload._mirror_auth_token, 128),\n    submission_id: plainText_(payload.submission_id, 120),'''
    if old not in text:
        raise SystemExit("Apps Script auth payload pattern missing")
    text = text.replace(old, new, 1)
    p.write_text(text)
    changed = True

# Source check + readiness v3.
changed |= patch(
    ".github/workflows/apps-script-secure-check.yml",
    '''          grep -F 'MIRROR_AUTH_URL' "$file" >/dev/null''',
    '''          grep -F 'MIRROR_AUTH_URL' "$file" >/dev/null\n          grep -F 'VERSION: "2026-08-23.3"' "$file" >/dev/null\n          grep -F '_mirror_auth_token' "$file" >/dev/null''',
)
changed |= patch(
    ".github/workflows/production-readiness.yml",
    '''.version == "2026-08-23.2"''',
    '''.version == "2026-08-23.3"''',
)

# Mirror auth smoke: usa token real do fixture e prova ausência/adulteração/replay.
p = Path(".github/workflows/mirror-auth-smoke.yml")
text = p.read_text()
if "Token ausente deve bloquear" not in text:
    anchor = '''          test "$(jq -r '.success // false' <<<"$response")" = "true"\n\n      - name: Aguardar endpoint de autorizacao'''
    replacement = '''          test "$(jq -r '.success // false' <<<"$response")" = "true"\n\n          token_body=$(jq -nc --arg id "$id" '{sql:"SELECT mirror_auth_token FROM leads WHERE submission_id=? LIMIT 1",params:[$id]}')\n          token_response=$(curl --fail-with-body -sS -X POST "$api" -H "$auth" -H "Content-Type: application/json" --data "$token_body")\n          token=$(jq -r '.result[0].results[0].mirror_auth_token // empty' <<<"$token_response")\n          test "${#token}" -eq 64\n          echo "token=$token" >> "$GITHUB_OUTPUT"\n\n      - name: Aguardar endpoint de autorizacao'''
    if anchor not in text:
        raise SystemExit("mirror smoke seed anchor missing")
    text = text.replace(anchor, replacement, 1)

    text = text.replace(
        '''        env:\n          QA_ID: ${{ steps.qa.outputs.id }}\n        run:''',
        '''        env:\n          QA_ID: ${{ steps.qa.outputs.id }}\n          QA_TOKEN: ${{ steps.qa.outputs.token }}\n        run:''',
    )
    text = text.replace(
        'jq -nc --arg id "$QA_ID" \'{submission_id:$id,',
        'jq -nc --arg id "$QA_ID" --arg token "$QA_TOKEN" \'{_mirror_auth_token:$token,submission_id:$id,',
    )

    marker = '''      - name: Payload adulterado deve bloquear\n'''
    extra = '''      - name: Token ausente deve bloquear\n        shell: bash\n        env:\n          QA_ID: ${{ steps.qa.outputs.id }}\n        run: |\n          set -euo pipefail\n          payload=$(jq -nc --arg id "$QA_ID" '{submission_id:$id,tipo_interesse:"comprar",nome:"QA MIRROR AUTH",whatsapp:"+5521900000099",email:"qa.mirror.auth@example.com",pais:"Brazil",cidade_estado:"Rio de Janeiro — RJ",contato_preferido:"WhatsApp",experiencia_trading:"Menos de 6 meses",principal_objetivo:"Organizar",canal_divulgacao:"",tamanho_publico:"",link_canal:"",experiencia_afiliado:"",observacao:"QA auth",consentimento:"Sim",origem:"ci-mirror-auth",utm_source:"qa",utm_medium:"github",utm_campaign:"mirror-auth",pagina_url:"https://preview.invalid/",enviado_em_local:"2026-08-23T06:00:00.000Z",user_agent:"GitHub Actions"}')\n          code=$(curl -sS -o /tmp/no-token.json -w '%{http_code}' -X POST "${PREVIEW_URL}/api/mirror/authorize" -H "Content-Type: application/json" --data "$payload")\n          test "$code" = "403"\n\n      - name: Token adulterado deve bloquear\n        shell: bash\n        env:\n          QA_ID: ${{ steps.qa.outputs.id }}\n        run: |\n          set -euo pipefail\n          bad=$(printf '0%.0s' $(seq 1 64))\n          payload=$(jq -nc --arg id "$QA_ID" --arg token "$bad" '{_mirror_auth_token:$token,submission_id:$id,tipo_interesse:"comprar",nome:"QA MIRROR AUTH",whatsapp:"+5521900000099",email:"qa.mirror.auth@example.com",pais:"Brazil",cidade_estado:"Rio de Janeiro — RJ",contato_preferido:"WhatsApp",experiencia_trading:"Menos de 6 meses",principal_objetivo:"Organizar",canal_divulgacao:"",tamanho_publico:"",link_canal:"",experiencia_afiliado:"",observacao:"QA auth",consentimento:"Sim",origem:"ci-mirror-auth",utm_source:"qa",utm_medium:"github",utm_campaign:"mirror-auth",pagina_url:"https://preview.invalid/",enviado_em_local:"2026-08-23T06:00:00.000Z",user_agent:"GitHub Actions"}')\n          code=$(curl -sS -o /tmp/bad-token.json -w '%{http_code}' -X POST "${PREVIEW_URL}/api/mirror/authorize" -H "Content-Type: application/json" --data "$payload")\n          test "$code" = "403"\n\n'''
    if marker not in text:
        raise SystemExit("mirror smoke insertion marker missing")
    text = text.replace(marker, extra + marker, 1)

    old = '''          curl --fail-with-body -sS -X POST "$api" -H "$auth" -H "Content-Type: application/json" --data "$body" >/dev/null\n          payload='''
    new = '''          curl --fail-with-body -sS -X POST "$api" -H "$auth" -H "Content-Type: application/json" --data "$body" >/dev/null\n          token_check=$(jq -nc --arg id "$QA_ID" '{sql:"SELECT mirror_auth_token FROM leads WHERE submission_id=? LIMIT 1",params:[$id]}')\n          token_result=$(curl --fail-with-body -sS -X POST "$api" -H "$auth" -H "Content-Type: application/json" --data "$token_check")\n          test "$(jq -r '.result[0].results[0].mirror_auth_token // empty' <<<"$token_result")" = ""\n          payload='''
    if old not in text:
        raise SystemExit("mirror smoke replay marker missing")
    text = text.replace(old, new, 1)
    p.write_text(text)
    changed = True

print("changed" if changed else "no-change")
