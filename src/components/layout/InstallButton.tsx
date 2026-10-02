import { Download } from "lucide-react";
import { useEffect, useState } from "react";

/** Chrome/Edge's deferred install prompt — not part of the TS DOM lib. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * "Install app" button. It only appears when the browser actually offers the
 * install prompt (a manifest-qualified Chromium); already-installed apps and
 * browsers without the prompt (Safari / iOS — where Add to Home Screen does
 * the same job) render nothing.
 */
export function InstallButton({ className }: { className?: string }) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Suppress the browser's own mini-bar — the sidebar button is the entry point.
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !prompt) return null;

  async function install() {
    const event = prompt;
    if (!event) return;
    try {
      await event.prompt();
      await event.userChoice; // accepted or dismissed — either way it's finished
    } finally {
      setPrompt(null);
    }
  }

  return (
    <button type="button" className={className} onClick={install}>
      <Download className="size-4" aria-hidden="true" />
      Install app
    </button>
  );
}
