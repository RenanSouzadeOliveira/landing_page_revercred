(() => {
  "use strict";

  const TYPEBOT_READY_EVENT = "revercred:typebot-ready";
  const TYPEBOT_ERROR_EVENT = "revercred:typebot-error";
  const typebotStatus = document.querySelector("[data-typebot-status]");

  function trackEvent(eventName, parameters = {}) {
    const payload = { event: eventName, ...parameters };

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent("revercred:tracking", { detail: payload }));
  }

  window.revercredTrack = trackEvent;

  function updateTypebotStatus(message) {
    if (typebotStatus) typebotStatus.textContent = message;
  }

  function openTypebot() {
    const typebot = window.__revercredTypebot;

    if (!typebot || typeof typebot.open !== "function") return false;

    try {
      typebot.open();
      updateTypebotStatus("");
      trackEvent("typebot_open");
      return true;
    } catch {
      return false;
    }
  }

  function handleTypebotCta(event) {
    event.preventDefault();
    trackEvent("cta_simulacao_click", {
      cta_text: event.currentTarget.textContent.trim().replace(/\s+/g, " "),
    });

    if (openTypebot()) return;

    document.querySelector("#simulacao")?.scrollIntoView({ behavior: "smooth", block: "center" });
    updateTypebotStatus("A simulação está carregando. Ela será aberta em instantes.");

    const openWhenReady = () => {
      if (!openTypebot()) {
        updateTypebotStatus("Use o botão laranja de conversa no canto da tela para iniciar a simulação.");
      }
    };

    window.addEventListener(TYPEBOT_READY_EVENT, openWhenReady, { once: true });
    window.addEventListener(
      TYPEBOT_ERROR_EVENT,
      () => updateTypebotStatus("Não foi possível carregar a simulação agora. Tente novamente ou fale com um especialista pelo WhatsApp."),
      { once: true },
    );
  }

  document.querySelectorAll(".js-typebot-cta").forEach((cta) => {
    cta.addEventListener("click", handleTypebotCta);
  });

  document.querySelectorAll(".js-whatsapp-link").forEach((link) => {
    link.addEventListener("click", () => {
      trackEvent("whatsapp_click", { placement: link.closest(".floating-contact") ? "floating" : "content" });
    });
  });

  document.querySelectorAll(".faq-list details").forEach((item, index) => {
    item.addEventListener("toggle", () => {
      if (item.open) {
        trackEvent("faq_open", {
          faq_index: index + 1,
          faq_question: item.querySelector("summary")?.firstChild?.textContent?.trim() || "",
        });
      }
    });
  });

  const scrollMilestones = new Set();
  let ticking = false;

  function measureScroll() {
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 1;

    [50, 90].forEach((milestone) => {
      if (progress >= milestone / 100 && !scrollMilestones.has(milestone)) {
        scrollMilestones.add(milestone);
        trackEvent(`scroll_${milestone}`);
      }
    });

    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(measureScroll);
        ticking = true;
      }
    },
    { passive: true },
  );

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  function loadTypebot() {
    if (document.querySelector("script[data-typebot-loader]")) return;

    const typebotInitScript = document.createElement("script");
    typebotInitScript.type = "module";
    typebotInitScript.dataset.typebotLoader = "true";
    typebotInitScript.innerHTML = `import Typebot from 'https://cdn.jsdelivr.net/npm/@typebot.io/js@0/dist/web.js'

window.__revercredTypebot = Typebot;

try {
  Typebot.initBubble({
    typebot: "my-typebot-823hdwo",
    previewMessage: {
      message: "Clique aqui para simular gratis!",
      avatarUrl: "https://cdn-icons-png.flaticon.com/512/8743/8743949.png",
    },
    theme: {
      button: { backgroundColor: "#ff5924" },
      chatWindow: { backgroundColor: "#1D1D1D" },
    },
  });
  window.dispatchEvent(new CustomEvent("${TYPEBOT_READY_EVENT}"));
} catch {
  window.dispatchEvent(new CustomEvent("${TYPEBOT_ERROR_EVENT}"));
}
`;

    typebotInitScript.addEventListener("error", () => {
      window.dispatchEvent(new CustomEvent(TYPEBOT_ERROR_EVENT));
    });

    document.body.append(typebotInitScript);
  }

  if (document.readyState === "complete") {
    loadTypebot();
  } else {
    window.addEventListener("load", loadTypebot, { once: true });
  }
})();
