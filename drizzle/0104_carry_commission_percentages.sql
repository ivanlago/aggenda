-- Carry existing percentage preferences to the new per-member catalog.
-- Historical ledger rows and their original rule references remain untouched.
WITH catalog AS (
  SELECT organization_id,id,'product'::text AS item_type FROM retail_product_variants WHERE is_active
  UNION ALL
  SELECT organization_id,id,'service'::text FROM services WHERE is_active
), candidates AS (
  SELECT c.organization_id,m.user_id,c.item_type,c.id AS item_id,r.value,
    row_number() OVER (PARTITION BY c.organization_id,m.user_id,c.item_type,c.id
      ORDER BY (r.service_id IS NOT NULL OR r.variant_id IS NOT NULL) DESC,
        (r.source_type='service') DESC,r.created_at DESC,r.id DESC) AS priority
  FROM catalog c
  JOIN commission_rules r ON r.organization_id=c.organization_id AND r.is_active
    AND r.calculation_type='percentage' AND r.value BETWEEN 0 AND 10000
    AND ((c.item_type='product' AND r.source_type='product' AND (r.variant_id IS NULL OR r.variant_id=c.id))
      OR (c.item_type='service' AND r.source_type IN ('service','appointment') AND (r.service_id IS NULL OR r.service_id=c.id)))
  LEFT JOIN professionals p ON p.id=r.professional_id AND p.organization_id=c.organization_id
  JOIN organization_members m ON m.organization_id=c.organization_id AND m.user_id=COALESCE(r.beneficiary_user_id,p.user_id)
)
INSERT INTO collaborator_item_commissions(organization_id,user_id,item_type,item_id,percentage_basis_points)
SELECT organization_id,user_id,item_type,item_id,value FROM candidates WHERE priority=1
ON CONFLICT DO NOTHING;
