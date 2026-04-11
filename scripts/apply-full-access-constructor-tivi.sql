-- v8.1: пресет «Full Access Constructor» для организации TiVi Media / пользователя shirinov.chingiz@gmail.com
-- Выполнить после миграции custom_config: psql $DATABASE_URL -f scripts/apply-full-access-constructor-tivi.sql

UPDATE organization_subscriptions AS os
SET
  tier = 'ENTERPRISE',
  is_trial = false,
  expires_at = NOW() + INTERVAL '10 years',
  active_modules = ARRAY[
    'banking_pro',
    'manufacturing',
    'fixed_assets',
    'ifrs',
    'hr_full',
    'kassa'
  ]::text[],
  custom_config = jsonb_build_object(
    'preset', 'full_access_constructor',
    'kassaPro', true,
    'modules', jsonb_build_array(
      'banking_pro',
      'manufacturing',
      'fixed_assets',
      'ifrs_mapping',
      'hr_full',
      'kassa',
      'kassa_pro'
    ),
    'billingNote', 'v8.4 Full Access + kassaPro flag (PRD/TZ)'
  )
WHERE os.organization_id IN (
  SELECT o.id
  FROM organizations o
  WHERE o.name ILIKE '%TiVi%Media%'
     OR o.id IN (
       SELECT om.organization_id
       FROM organization_memberships om
       INNER JOIN users u ON u.id = om.user_id
       WHERE lower(u.email) = lower('shirinov.chingiz@gmail.com')
     )
);

-- Проверка: SELECT o.name, os.tier, os.custom_config FROM organization_subscriptions os JOIN organizations o ON o.id = os.organization_id;
