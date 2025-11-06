import React from 'react';

const predefinedThemes = [
  { name: 'Navidad', emoji: '🎄' },
  { name: 'San Valentín', emoji: '❤️' },
  { name: 'Verano', emoji: '☀️' },
  { name: 'Otoño', emoji: '🍂' },
  { name: 'Boda', emoji: '💍' },
];

type ThemeSelectorProps = {
  theme: string;
  setTheme: (theme: string) => void;
  disabled?: boolean;
};

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ theme, setTheme, disabled }) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {predefinedThemes.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setTheme(p.name)}
            disabled={disabled}
            className={`px-3 py-1 text-sm rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              theme === p.name
                ? 'bg-indigo-600 text-white font-semibold'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {p.emoji} {p.name}
          </button>
        ))}
      </div>
      <input
        id="theme-input"
        type="text"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        disabled={disabled}
        placeholder="O escribe tu propio tema (ej. 'Playa tropical')"
        className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
      />
    </div>
  );
};

export default ThemeSelector;
