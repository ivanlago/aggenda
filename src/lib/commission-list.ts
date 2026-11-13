export type CommissionListQuery = { inicio?:string; fim?:string; mes?:string; beneficiario?:string; status?:string; consulta?:string; custo?:string; taxa?:string; desconto?:string };
export function validCommissionDate(value:string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
export function commissionListFilters(query:CommissionListQuery,today:string) {
  const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(query.mes??"")?query.mes!:today.slice(0,7);
  const [year,number]=month.split("-").map(Number);
  const start=query.inicio||month+"-01", end=query.fim||new Date(Date.UTC(year,number,0)).toISOString().slice(0,10);
  const error=!validCommissionDate(start)||!validCommissionDate(end)?"Informe datas válidas para o período.":start>end?"A data inicial deve ser anterior ou igual à data final.":"";
  return {start,end,error,beneficiary:query.beneficiario??"",status:["pending","paid","cancelled"].includes(query.status??"")?query.status!:"",deductFees:query.taxa==="1",deductDiscount:query.consulta==="1"?query.desconto==="1":true};
}
