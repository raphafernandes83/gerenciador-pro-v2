-- 0003 — capability token por lead para autorizar Worker -> Apps Script.
-- O token nunca é enviado ao navegador nem gravado como coluna na planilha.
-- É mantido apenas enquanto o lead ainda precisa ser espelhado.
--
-- Para banco novo: aplique o ALTER uma vez e depois os triggers abaixo.
-- Em banco existente o workflow d1-mirror-auth-migration verifica a coluna
-- antes do ALTER, evitando erro em reexecução.
ALTER TABLE leads ADD COLUMN mirror_auth_token TEXT;

-- Todo lead pendente nasce com capability token de 256 bits.
CREATE TRIGGER IF NOT EXISTS trg_lead_mirror_token_insert
AFTER INSERT ON leads
WHEN NEW.sheet_sync_status IN ('pending','retry')
 AND COALESCE(NEW.mirror_auth_token,'') = ''
BEGIN
  UPDATE leads
     SET mirror_auth_token = lower(hex(randomblob(32)))
   WHERE id = NEW.id;
END;

-- Se um lead ainda não sincronizado entrar em retry/pending por manutenção,
-- garante que exista token para o próximo espelhamento.
CREATE TRIGGER IF NOT EXISTS trg_lead_mirror_token_active
AFTER UPDATE OF sheet_sync_status ON leads
WHEN NEW.sheet_sync_status IN ('pending','retry')
 AND COALESCE(NEW.mirror_auth_token,'') = ''
BEGIN
  UPDATE leads
     SET mirror_auth_token = lower(hex(randomblob(32)))
   WHERE id = NEW.id;
END;

-- synced é estado terminal. Evita regressão mesmo por um segundo processo.
CREATE TRIGGER IF NOT EXISTS trg_lead_sync_terminal
BEFORE UPDATE OF sheet_sync_status ON leads
WHEN OLD.sheet_sync_status = 'synced'
 AND NEW.sheet_sync_status <> 'synced'
BEGIN
  SELECT RAISE(ABORT, 'synced_is_terminal');
END;

-- Capability token deixa de existir depois da confirmação do Sheets.
CREATE TRIGGER IF NOT EXISTS trg_lead_mirror_token_synced
AFTER UPDATE OF sheet_sync_status ON leads
WHEN NEW.sheet_sync_status = 'synced'
 AND NEW.mirror_auth_token IS NOT NULL
BEGIN
  UPDATE leads
     SET mirror_auth_token = NULL
   WHERE id = NEW.id;
END;
