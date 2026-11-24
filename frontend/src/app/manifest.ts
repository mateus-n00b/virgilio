import type { MetadataRoute } from "next";

/** PWA: permite "Instalar app" no Android (Chrome) e "Adicionar à Tela de Início" no iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Virgílio: ninguém atravessa sozinho",
    short_name: "Virgílio",
    description: "Prova de vida periódica: se você não responder, seus Virgílios são avisados.",
    lang: "pt-BR",
    start_url: "/?origem=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f5ee",
    theme_color: "#2f6b4f",
    categories: ["health", "lifestyle", "social"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Estou bem", url: "/?origem=atalho", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Protegidos", url: "/protegidos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
