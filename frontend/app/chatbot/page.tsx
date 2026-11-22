import { Suspense } from "react";
import { ChatbotApp } from "@/components/chatbot/ChatbotApp";
import "@/styles/chatbot.css";

export const metadata = {
  title: "Temu Tani | Chatbot WhatsApp (Simulasi)",
  description: "Prototipe chatbot Temu Tani untuk petani dan tengkulak.",
};

export default function ChatbotPage() {
  return (
    <div className="chatbot-page">
      <Suspense fallback={null}>
        <ChatbotApp />
      </Suspense>
    </div>
  );
}
