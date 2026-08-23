-- 0003 — capability token por lead para autorizar Worker -> Apps Script.
-- O token nunca é enviado ao navegador nem gravado como coluna na planilha.
-- É mantido apenas enquanto o lead ainda precisa ser espelhado.
ALTER TABLE leads ADD COLUMN mirror_auth_token TEXT;
