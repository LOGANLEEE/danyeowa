import { useState } from "react";
import { getStoredTheme, setTheme } from "./theme";
import type { Theme } from "./theme";

type Props = {
  email: string;
  onSignOut: () => void;
};

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsView({ email, onSignOut }: Props) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  function selectTheme(next: Theme) {
    setThemeState(next);
    setTheme(next);
  }

  return (
    <div className="entrance flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1 rounded-lg border border-edge bg-card p-4">
        <p className="text-xs uppercase text-ink-muted">Signed in as</p>
        <p className="text-ink">{email}</p>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-edge bg-card p-4">
        <legend className="px-1 text-xs uppercase text-ink-muted">Theme</legend>
        {THEME_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-ink">
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => selectTheme(option.value)}
              className="accent-accent"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1 rounded-lg border border-edge bg-card p-4">
        <p className="text-xs uppercase text-ink-muted">Home base</p>
        <p className="text-ink">DXB · default</p>
        <p className="text-sm text-ink-muted">customizable later</p>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="self-start rounded border border-danger px-3 py-2 text-danger transition-colors duration-[120ms] hover:bg-danger/10"
      >
        Sign out
      </button>
    </div>
  );
}
