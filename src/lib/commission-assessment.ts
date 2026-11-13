export type CommissionAssessmentLine = { id: string; name: string; net: number; discount: number; rate: number };
export function commissionAssessment(lines: CommissionAssessmentLine[], deductDiscount: boolean, fee: number, refund = 0) {
  const ordered = [...lines].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const total = ordered.reduce((sum,line) => sum + line.net,0);
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > total) throw new Error("Informe uma taxa entre zero e o total da venda.");
  let cumulative = 0;
  return ordered.map(line => {
    const share = total ? Number(BigInt(cumulative + line.net)*BigInt(fee)/BigInt(total)-BigInt(cumulative)*BigInt(fee)/BigInt(total)) : 0;
    cumulative += line.net;
    const gross = line.net + line.discount;
    const discount = deductDiscount ? line.discount : 0;
    const base = Math.max(0,gross-discount-share);
    const originalCommission = Number((BigInt(base)*BigInt(line.rate)+BigInt(5000))/BigInt(10000));
    const commission = total ? Number((BigInt(originalCommission)*BigInt(Math.max(0,total-refund))*BigInt(2)+BigInt(total))/(BigInt(2)*BigInt(total))) : originalCommission;
    return { ...line, gross, discount, fee:share, base, commission };
  });
}
export function parseCommissionFee(value: string) {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value.trim())) throw new Error("Informe a taxa em reais, inclusive 0,00 quando não houver taxa.");
  const [whole, fraction=""] = value.trim().replace(",",".").split(".");
  const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  if(!Number.isSafeInteger(cents)||cents>2147483647) throw new Error("Taxa acima do limite permitido.");
  return cents;
}
