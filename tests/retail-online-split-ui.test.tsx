import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("PDV online permite informar valores, adicionar forma e preencher o restante", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url:"https://example.com", pretendToBeVisual:true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window","document","navigator","HTMLElement","Element","IS_REACT_ACT_ENVIRONMENT"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string,unknown>)[key]});
  }
  const bundle = await build({entryPoints:["src/components/retail-sale-form.tsx"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",jsx:"automatic",plugins:[{name:"split-ui",setup(builder){
    const mocks:Record<string,string> = {
      "@/actions/retail":"export async function registerRetailSale(){}",
      "@/actions/financial-operations":"export async function openCash(){}",
      "@/components/payment-catalog-context":`export function usePaymentCatalog(){return {accounts:[{id:'bank',name:'Banco'}],methods:[{id:'pix',name:'Pix',kind:'pix',defaultAccountId:'bank'},{id:'card',name:'Cartão de Crédito',kind:'credit_card',defaultAccountId:'bank'},{id:'cash',name:'Dinheiro',kind:'cash',defaultAccountId:'bank'}]}}`,
      "@/components/modal-shell":"import {createElement} from 'react'; export function ModalShell({children}){return createElement('section',null,children)}",
      "@/components/action-form":"import {createElement} from 'react'; export function ActionForm({children}){return createElement('form',null,children)}",
      "next/link":"import {createElement} from 'react'; export default function Link(props){return createElement('a',props)}",
      ...Object.fromEntries([
        ["pos-catalog","PosCatalog"],["client-search","ClientSearch"],["phone-input","PhoneInput"],
        ["order-discount-field","OrderDiscountField"],["pos-package-notice","PosPackageNotice"],
        ["asaas-card-fees","AsaasCardFees"],["pagbank-installment-fields","PagBankInstallmentFields"],
      ].map(([path,name])=>[`@/components/${path}`,`export function ${name}(){return null}`])),
    };
    builder.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:"fixture"}:undefined);
    builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path],loader:"js",resolveDir:process.cwd()}));
  }}]});
  const compiled={exports:{} as {RetailSaleForm:typeof import("../src/components/retail-sale-form").RetailSaleForm}};
  new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),compiled,compiled.exports);
  const {createRoot}=await import("react-dom/client");
  const root=createRoot(dom.window.document.getElementById("root")!);
  const document=dom.window.document;
  const click=async(text:string)=>{
    const button=[...document.querySelectorAll<HTMLButtonElement>("button")].find(item=>item.textContent===text);
    assert.ok(button); await act(async()=>button.click());
  };
  const select=async(element:HTMLSelectElement,value:string)=>{await act(async()=>{element.value=value;element.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});};
  const amount=async(index:number,value:string)=>{
    const element=document.querySelector<HTMLInputElement>(`[aria-label="Valor do pagamento ${index}"]`)!;
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(element,value);element.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
  };
  try {
    await act(async()=>root.render(<compiled.exports.RetailSaleForm variants={[{id:"item",label:"Produto",priceInCents:5000,stock:10,barcode:null}]} clients={[]} canDiscount={false}
      initialCart={[{variantId:"item",quantity:1,discountInCents:0}]} cashSession={{id:"cash-session"} as never}
      paymentProviders={[{id:"mercado_pago",name:"Mercado Pago",environment:"production"}]} />));
    const receipt=document.querySelector<HTMLSelectElement>('select:has(option[value="online"])')!;
    await select(receipt,"online");
    const methods=()=>[...document.querySelectorAll<HTMLSelectElement>("fieldset select")];
    assert.deepEqual([...methods()[0].options].map(option=>option.text),["Selecione","Pix","Cartão de Crédito"]);
    await select(methods()[0],"pix");
    await amount(1,"20,00");
    const summary=()=>document.querySelector('[aria-label="Resumo da divisão dos pagamentos"]')!.textContent!.replace(/\s/g, " ");
    assert.match(summary(),/Valor distribuídoR\$ 20,00/);
    assert.match(summary(),/Saldo a pagarR\$ 30,00/);
    await click("Adicionar pagamento");
    await select(methods()[1],"card");
    await click("Preencher restante");
    assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Valor do pagamento 2"]')!.value,"30,00");
    assert.deepEqual(JSON.parse(document.querySelector<HTMLInputElement>('input[name="payments"]')!.value),[{method:"pix",amountInCents:2000},{method:"card",amountInCents:3000}]);
    const generate=[...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Gerar cobranças Mercado Pago")!;
    assert.equal(generate.disabled,false);
    assert.match(summary(),/Saldo a pagarR\$ 0,00/);
    await amount(2,"29,00");
    assert.equal(generate.disabled,true);
    assert.match(summary(),/Saldo a pagarR\$ 1,00/);
    await amount(2,"31,00");
    assert.match(summary(),/Valor excedenteR\$ 1,00/);
    assert.equal(generate.disabled,true);
    const remove=document.querySelector<HTMLButtonElement>('[aria-label="Remover pagamento 2"]')!;
    await act(async()=>remove.click());
    assert.match(summary(),/Saldo a pagarR\$ 30,00/);
  } finally {
    await act(async()=>root.unmount());dom.window.close();
    for(const [key,descriptor] of originals) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
});
