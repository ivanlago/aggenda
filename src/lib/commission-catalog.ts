import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { catalogKits, retailProducts, retailProductVariants, servicePackages, services } from "@/db/schema";

export async function commissionCatalog(database: Pick<typeof db, "select">, org: string) {
  const [products, procedures, packages, kits] = await Promise.all([
    database.select({id:retailProductVariants.id,name:retailProducts.name,variant:retailProductVariants.name,rate:retailProductVariants.commissionRateBasisPoints}).from(retailProductVariants).innerJoin(retailProducts,and(eq(retailProducts.id,retailProductVariants.productId),eq(retailProducts.organizationId,org))).where(and(eq(retailProductVariants.organizationId,org),eq(retailProductVariants.isActive,true),eq(retailProducts.isActive,true))),
    database.select({id:services.id,name:services.name,executionRate:services.executionCommissionRateBasisPoints,rate:services.commissionRateBasisPoints}).from(services).where(and(eq(services.organizationId,org),eq(services.isActive,true))),
    database.select({id:servicePackages.id,name:servicePackages.name,executionRate:servicePackages.executionCommissionRateBasisPoints,rate:servicePackages.commissionRateBasisPoints}).from(servicePackages).where(and(eq(servicePackages.organizationId,org),eq(servicePackages.isActive,true))),
    database.select({id:catalogKits.id,name:catalogKits.name,rate:catalogKits.commissionRateBasisPoints}).from(catalogKits).where(and(eq(catalogKits.organizationId,org),eq(catalogKits.isActive,true))),
  ]);
  return [...products.map(x=>({...x,name:x.variant==="Padrão"?x.name:`${x.name} · ${x.variant}`,executionRate:null,type:"product",label:"Produto"})),...procedures.map(x=>({...x,type:"service",label:"Serviço"})),...packages.map(x=>({...x,type:"package",label:"Pacote"})),...kits.map(x=>({...x,executionRate:null,type:"kit",label:"Kit"}))].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}
