-- Consolida clientes duplicados pelo mesmo celular brasileiro, preservando vínculos.
DO $$
DECLARE
  duplicate_group RECORD;
  duplicate_id UUID;
BEGIN
  CREATE TEMP TABLE _aggenda_client_phone_map ON COMMIT DROP AS
  WITH cleaned AS (
    SELECT
      id,
      organization_id,
      created_at,
      CASE
        WHEN length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) IN (12, 13)
          AND left(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 2) = '55'
          THEN substring(regexp_replace(phone, '\D', '', 'g') from 3)
        ELSE regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      END AS national_phone
    FROM clients
    WHERE phone IS NOT NULL
  )
  SELECT
    id,
    organization_id,
    created_at,
    CASE
      WHEN length(national_phone) = 10 AND substring(national_phone from 3 for 1) ~ '[6-9]'
        THEN left(national_phone, 2) || '9' || substring(national_phone from 3)
      ELSE national_phone
    END AS canonical_phone
  FROM cleaned
  WHERE national_phone <> '';

  IF EXISTS (
    SELECT 1
    FROM _aggenda_client_phone_map AS phone_map
    JOIN client_accounts AS account ON account.client_id = phone_map.id
    GROUP BY phone_map.organization_id, phone_map.canonical_phone
    HAVING count(DISTINCT account.user_id) > 1
  ) THEN
    RAISE EXCEPTION 'Consolidacao interrompida: ha telefones duplicados vinculados a contas de acesso distintas.';
  END IF;

  FOR duplicate_group IN
    SELECT
      organization_id,
      canonical_phone,
      (array_agg(
        phone_map.id
        ORDER BY EXISTS (
          SELECT 1 FROM client_accounts AS account WHERE account.client_id = phone_map.id
        ) DESC, phone_map.created_at, phone_map.id
      ))[1] AS keeper_id
    FROM _aggenda_client_phone_map AS phone_map
    GROUP BY organization_id, canonical_phone
    HAVING count(*) > 1
  LOOP
    FOR duplicate_id IN
      SELECT id
      FROM _aggenda_client_phone_map
      WHERE organization_id = duplicate_group.organization_id
        AND canonical_phone = duplicate_group.canonical_phone
        AND id <> duplicate_group.keeper_id
    LOOP
      UPDATE clients AS keeper
      SET
        name = CASE WHEN length(duplicate.name) > length(keeper.name) THEN duplicate.name ELSE keeper.name END,
        email = coalesce(keeper.email, duplicate.email),
        birth_date = coalesce(keeper.birth_date, duplicate.birth_date),
        gender = coalesce(keeper.gender, duplicate.gender),
        notes = coalesce(keeper.notes, duplicate.notes),
        updated_at = now()
      FROM clients AS duplicate
      WHERE keeper.id = duplicate_group.keeper_id AND duplicate.id = duplicate_id;

      UPDATE appointments SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE client_history_entries SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE client_clinical_media SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE electronic_documents SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE client_packages SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE client_memberships SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE crm_leads SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE retail_sales SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE payment_charges SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE financial_entries SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE chat_conversations SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE client_portal_access_requests SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      UPDATE client_portal_sessions SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;

      UPDATE client_accounts AS keeper_account
      SET
        verification_method = coalesce(keeper_account.verification_method, duplicate_account.verification_method),
        verified_at = coalesce(keeper_account.verified_at, duplicate_account.verified_at),
        created_at = least(keeper_account.created_at, duplicate_account.created_at)
      FROM client_accounts AS duplicate_account
      WHERE keeper_account.client_id = duplicate_group.keeper_id
        AND duplicate_account.client_id = duplicate_id
        AND keeper_account.user_id = duplicate_account.user_id;

      DELETE FROM client_accounts AS duplicate_account
      WHERE duplicate_account.client_id = duplicate_id
        AND EXISTS (
          SELECT 1 FROM client_accounts AS keeper_account
          WHERE keeper_account.client_id = duplicate_group.keeper_id
            AND keeper_account.user_id = duplicate_account.user_id
        );
      UPDATE client_accounts SET client_id = duplicate_group.keeper_id WHERE client_id = duplicate_id;
      DELETE FROM clients WHERE id = duplicate_id;
    END LOOP;
  END LOOP;

  UPDATE clients AS client
  SET phone = phone_map.canonical_phone, updated_at = now()
  FROM _aggenda_client_phone_map AS phone_map
  WHERE client.id = phone_map.id AND client.phone IS DISTINCT FROM phone_map.canonical_phone;
END $$;
