"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: Record<string, unknown>) => void;
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>,
      ) => void;
    };
  }
}

type SignupData = { wabaId?: string; phoneNumberId?: string };

export function WhatsAppConnectButton({
  appId,
  configurationId,
}: {
  appId?: string;
  configurationId?: string;
}) {
  const router = useRouter();
  const codeRef = useRef<string | null>(null);
  const signupRef = useRef<SignupData>({});
  const connectingRef = useRef(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [state, setState] = useState<"idle" | "connecting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const configured = Boolean(appId && configurationId);

  async function finishConnection() {
    const { wabaId, phoneNumberId } = signupRef.current;
    const code = codeRef.current;
    if (!code || !wabaId || !phoneNumberId || connectingRef.current) return;
    connectingRef.current = true;
    setState("connecting");
    setMessage("Validando o número e ativando o webhook…");
    try {
      const response = await fetch("/api/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, wabaId, phoneNumberId }),
      });
      const result = await response.json() as { error?: string; displayPhoneNumber?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível concluir a conexão.");
      setState("success");
      setMessage(`WhatsApp ${result.displayPhoneNumber ?? "empresarial"} conectado com sucesso.`);
      router.refresh();
    } catch (error) {
      connectingRef.current = false;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Falha ao conectar o WhatsApp.");
    }
  }

  useEffect(() => {
    function receiveMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== "object" || !("type" in data) || data.type !== "WA_EMBEDDED_SIGNUP") return;
      const signupEvent = data as { event?: string; data?: { waba_id?: string; phone_number_id?: string; error_message?: string } };
      if (signupEvent.event === "FINISH") {
        signupRef.current = {
          wabaId: signupEvent.data?.waba_id,
          phoneNumberId: signupEvent.data?.phone_number_id,
        };
        void finishConnection();
      } else if (signupEvent.event === "ERROR") {
        setState("error");
        setMessage(signupEvent.data?.error_message ?? "A Meta não concluiu a configuração.");
      } else if (signupEvent.event === "CANCEL") {
        setState("idle");
        setMessage("Conexão cancelada. Nenhuma alteração foi feita.");
      }
    }
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  });

  function connect() {
    if (!configured || !window.FB || !configurationId) return;
    codeRef.current = null;
    signupRef.current = {};
    connectingRef.current = false;
    setState("connecting");
    setMessage("Conclua as etapas na janela da Meta.");
    window.FB.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setState("error");
        setMessage("A autorização da Meta não foi concluída.");
        return;
      }
      codeRef.current = code;
      void finishConnection();
    }, {
      config_id: configurationId,
      response_type: "code",
      override_default_response_type: true,
      extras: { feature: "whatsapp_embedded_signup", sessionInfoVersion: "3" },
    });
  }

  return (
    <div className="mt-5">
      {configured && <Script
        src="https://connect.facebook.net/pt_BR/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: "v23.0" });
          setSdkReady(true);
        }}
      />}
      <button className="primary-button w-full" type="button" onClick={connect} disabled={!configured || !sdkReady || state === "connecting"}>
        {state === "connecting" ? "Conectando…" : "Conectar com a Meta"}
      </button>
      {!configured && <p className="mt-3 text-xs font-semibold text-amber-700">O aplicativo Meta da Aggenda ainda precisa receber App ID e Configuration ID.</p>}
      {message && <p className={`mt-3 text-xs font-semibold ${state === "error" ? "text-red-700" : state === "success" ? "text-brand" : "text-muted"}`} role={state === "error" ? "alert" : "status"}>{message}</p>}
    </div>
  );
}
