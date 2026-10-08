import { useEffect } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { ConfirmHost, Toasts } from "./components/Dialogs";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { api, inTauri } from "./lib/ipc";
import { detectEnv, listenForJobs, probeT1, route, settings } from "./lib/state";
import { useStore } from "./lib/store";
import { JobsView } from "./views/JobsView";
import { Library } from "./views/Library";
import { Overview } from "./views/Overview";
import { SectionView } from "./views/SectionView";
import { SettingsView } from "./views/SettingsView";
import { T1View } from "./views/T1View";

function useTheme() {
  const s = useStore(settings);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const theme = s.theme === "system" ? (media.matches ? "light" : "dark") : s.theme;
      root.dataset.theme = theme;
    };
    apply();
    media.addEventListener("change", apply);
    root.classList.toggle("reduce-motion", s.reduceMotion);
    return () => media.removeEventListener("change", apply);
  }, [s.theme, s.reduceMotion]);
}

export function App() {
  const r = useStore(route);
  useTheme();

  useEffect(() => {
    // The macOS window draws its traffic lights over the content.
    if (inTauri && /Mac/i.test(navigator.userAgent)) document.documentElement.dataset.platform = "macos";
    void listenForJobs();
    void detectEnv();
    // Find the T1 server once at startup, so the top bar can show it.
    const s = settings.get();
    if (s.t1Url) void probeT1(s.t1Url);
    else api.t1LocalConfig().then((c) => probeT1(c.baseUrl)).catch(() => {});
  }, []);

  const scrollKey = r.view === "section" ? `${r.section}:${r.command ?? ""}` : r.view;

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <TopBar />
        <div className="content" key={scrollKey}>
          {r.view === "overview" && <Overview />}
          {r.view === "section" && <SectionView sectionId={r.section} commandId={r.command} prefill={r.prefill} nonce={r.nonce} />}
          {r.view === "t1" && <T1View />}
          {r.view === "library" && <Library />}
          {r.view === "jobs" && <JobsView jobId={r.job} />}
          {r.view === "settings" && <SettingsView />}
        </div>
      </main>
      <CommandPalette />
      <ConfirmHost />
      <Toasts />
    </div>
  );
}
