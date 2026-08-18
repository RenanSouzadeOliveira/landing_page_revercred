const endpoint = "http://127.0.0.1:9222/json";
const targets = await fetch(endpoint).then((response) => response.json());
const page = targets.find((target) => target.type === "page");

if (!page) throw new Error("Nenhuma página do Chrome disponível para teste.");

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const consoleIssues = [];
const typebotNetwork = [];
let commandId = 0;

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }

  if (message.method === "Runtime.exceptionThrown") {
    consoleIssues.push(message.params.exceptionDetails.text);
  }

  if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
    consoleIssues.push(message.params.entry.text);
  }

  if (message.method === "Network.responseReceived" && message.params.response.url.includes("typebot")) {
    typebotNetwork.push({ status: message.params.response.status, url: message.params.response.url });
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  commandId += 1;
  const id = commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Network.enable");

const viewports = [320, 375, 390, 430, 768, 1024, 1280, 1440];
const layoutResults = [];

for (const width of viewports) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: width < 768 ? 900 : 1000,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await send("Page.navigate", { url: "http://127.0.0.1:4173/" });
  await new Promise((resolve) => setTimeout(resolve, 1800));

  const metrics = await evaluate(`(() => {
    const visibleOverflow = [...document.querySelectorAll("body *")].filter((element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.position === "fixed") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
    }).map((element) => element.tagName.toLowerCase() + (element.className ? "." + String(element.className).split(" ")[0] : ""));

    return {
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflow: visibleOverflow.slice(0, 8),
      typebotMounted: Boolean(document.querySelector("typebot-bubble")),
      typebotApiReady: typeof window.__revercredTypebot?.open === "function",
    };
  })()`);
  layoutResults.push(metrics);
}

const interactionResults = await evaluate(`(() => {
  const faq = document.querySelector(".faq-list details");
  faq.querySelector("summary").click();
  document.querySelector(".hero .js-typebot-cta").click();
  const ctaCount = document.querySelectorAll(".js-typebot-cta").length;
  return {
    faqOpened: faq.open,
    ctaCount,
    ctaTracked: window.dataLayer?.some((item) => item.event === "cta_simulacao_click"),
    typebotOpenTracked: window.dataLayer?.some((item) => item.event === "typebot_open"),
    hasMetaDescription: Boolean(document.querySelector('meta[name="description"]')?.content),
    headingOrder: [...document.querySelectorAll("h1, h2, h3")].map((heading) => Number(heading.tagName[1])),
  };
})()`);

await new Promise((resolve) => setTimeout(resolve, 3000));

const result = {
  layoutResults,
  interactionResults,
  typebotNetwork: typebotNetwork.filter(
    (entry, index, all) => all.findIndex((candidate) => candidate.url === entry.url && candidate.status === entry.status) === index,
  ),
  consoleIssues: [...new Set(consoleIssues)],
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

const failed = layoutResults.some(
  (layout) => layout.documentWidth > layout.width || layout.overflow.length || !layout.typebotMounted || !layout.typebotApiReady,
);

socket.close();
if (
  failed ||
  !interactionResults.faqOpened ||
  !interactionResults.ctaTracked ||
  !interactionResults.typebotOpenTracked ||
  typebotNetwork.some((entry) => entry.status >= 400) ||
  consoleIssues.length
) {
  process.exitCode = 1;
}
