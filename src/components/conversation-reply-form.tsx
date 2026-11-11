"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { replyToConversation } from "@/actions/conversation-reply";

export function ConversationReplyForm({conversationId,disabledReason}:{conversationId:string;disabledReason?:string}){
  const requestId=useRef<string|null>(null);
  return <ActionForm action={async data=>{requestId.current??=crypto.randomUUID();data.set("requestId",requestId.current);return replyToConversation(data);}} onSuccess={()=>{requestId.current=null;}} successMessage="Resposta enfileirada para envio pelo WhatsApp." className="mt-4 grid gap-3">
    <input type="hidden" name="conversationId" value={conversationId}/>
    <label className="grid gap-2 text-sm font-bold">Responder ao cliente<textarea className="field min-h-24 resize-y" name="body" required maxLength={4096} disabled={Boolean(disabledReason)} placeholder="Digite sua mensagem…"/></label>
    {disabledReason&&<p className="text-sm text-amber-800" role="status">{disabledReason}</p>}
    <button className="primary-button w-fit" disabled={Boolean(disabledReason)}>Enviar pelo WhatsApp</button>
  </ActionForm>;
}

export function ConversationRefresh(){
  const router=useRouter();
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible")router.refresh();};
    const timer=window.setInterval(refresh,10000);
    window.addEventListener("focus",refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[router]);
  return null;
}
