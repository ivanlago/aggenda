ALTER TABLE organizations ADD COLUMN online_installment_policy jsonb;
--> statement-breakpoint
UPDATE organizations AS organization
SET online_installment_policy = jsonb_build_object(
  'maxCardInstallments', integration.metadata->'maxCardInstallments',
  'interestFreeCardInstallments', integration.metadata->'interestFreeCardInstallments',
  'minimumCardInstallmentInCents', integration.metadata->'minimumCardInstallmentInCents',
  'allowCardBuyerInterest', integration.metadata->'allowCardBuyerInterest'
)
FROM organization_financial_integrations AS integration
WHERE integration.organization_id = organization.id
  AND integration.provider = 'pagbank'
  AND integration.metadata ? 'maxCardInstallments';
