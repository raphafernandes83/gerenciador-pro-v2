from pathlib import Path

p = Path('scripts/reconcile-sheets.mjs')
text = p.read_text()
old = '''                            enviado_em_local,payload_json,sheet_sync_attempts\n                     FROM leads'''
new = '''                            enviado_em_local,payload_json,sheet_sync_attempts,mirror_auth_token\n                     FROM leads'''

if new in text:
    print('PASS: selector already includes mirror_auth_token')
elif old in text:
    p.write_text(text.replace(old, new, 1))
    print('PASS: selector patched')
else:
    raise SystemExit('reconcile selector pattern missing')
