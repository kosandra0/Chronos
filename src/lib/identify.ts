// Application identification. Applications are discovered dynamically from real process
// information; this module only provides *naming hints* and *category heuristics*.
// Unknown executables are always kept and shown by their executable name.

export const CATEGORIES = [
  "Browsers",
  "Development",
  "Productivity",
  "Communication",
  "Entertainment",
  "Gaming",
  "System Utilities",
  "Administration",
  "Media",
  "Education",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_COLORS: Record<string, string> = {
  Browsers: "#5b8def",
  Development: "#2fb8a5",
  Productivity: "#8bb174",
  Communication: "#b58de0",
  Entertainment: "#e07a8e",
  Gaming: "#e8a05a",
  "System Utilities": "#8fa1b3",
  Administration: "#d9bf5c",
  Media: "#e58bc2",
  Education: "#64c1e0",
  Other: "#7d8794",
  Desktop: "#9bb0a4",
  Idle: "#4a5563",
  Locked: "#3a4350",
};

// Friendly-name hints keyed by lowercase executable (names only; never a support list).
const NAME_HINTS: Record<string, string> = {
  "powershell.exe": "Windows PowerShell",
  "pwsh.exe": "PowerShell",
  "cmd.exe": "Command Prompt",
  "notepad.exe": "Notepad",
  "explorer.exe": "Windows Explorer",
  "taskmgr.exe": "Task Manager",
  "code.exe": "Visual Studio Code",
  "devenv.exe": "Visual Studio",
  "chrome.exe": "Google Chrome",
  "msedge.exe": "Microsoft Edge",
  "firefox.exe": "Mozilla Firefox",
  "brave.exe": "Brave",
  "opera.exe": "Opera",
  "windowsterminal.exe": "Windows Terminal",
  "wt.exe": "Windows Terminal",
  "notepad++.exe": "Notepad++",
  "mspaint.exe": "Paint",
  "calculatorapp.exe": "Calculator",
  "systemsettings.exe": "Settings",
  "control.exe": "Control Panel",
  "discord.exe": "Discord",
  "telegram.exe": "Telegram",
  "spotify.exe": "Spotify",
  "steam.exe": "Steam",
  "robloxplayerbeta.exe": "Roblox",
  "winword.exe": "Microsoft Word",
  "excel.exe": "Microsoft Excel",
  "powerpnt.exe": "Microsoft PowerPoint",
  "outlook.exe": "Microsoft Outlook",
  chronos: "Chronos",
};

const RULES: [RegExp, Category][] = [
  [/chrome|msedge|firefox|brave|opera|vivaldi|iexplore|safari|arc\.exe|tor browser/i, "Browsers"],
  [/code|devenv|idea|pycharm|webstorm|rider|clion|goland|studio|sublime|notepad\+\+|atom|vim|emacs|git|docker|postman|terminal|powershell|pwsh|cmd\.exe|bash|wsl|node|python|android/i, "Development"],
  [/word|excel|powerpnt|onenote|outlook|notion|obsidian|acrobat|foxit|libreoffice|soffice|evernote|todoist|trello|notepad\.exe|chronos/i, "Productivity"],
  [/discord|telegram|slack|teams|zoom|skype|whatsapp|signal|thunderbird|viber/i, "Communication"],
  [/roblox|steam|epic|minecraft|valorant|league|riot|origin|ubisoft|battle\.net|fortnite|gog|game|unity\.exe|dota|csgo|cs2/i, "Gaming"],
  [/spotify|vlc|itunes|foobar|musicbee|winamp|obs|premiere|audacity|photoshop|illustrator|resolve|mpv|potplayer|movies|groove|photos/i, "Media"],
  [/netflix|youtube|twitch|disney|prime/i, "Entertainment"],
  [/anki|duolingo|kindle|coursera|khan/i, "Education"],
  [/taskmgr|regedit|mmc|eventvwr|services|compmgmt|gpedit|perfmon|resmon|lusrmgr|diskmgmt|msconfig|powershell_ise|wf\.msc|devmgmt/i, "Administration"],
  [/explorer|systemsettings|control\.exe|calculator|mspaint|snippingtool|screenclip|winrar|7zfg|7zip|settings|cleanmgr|sndvol|charmap|magnify|osk/i, "System Utilities"],
];

export type AppInfoInput = {
  exe: string;
  description?: string | null;
  product?: string | null;
  path?: string | null;
};

export function identifyApp(inp: AppInfoInput): { name: string; category: Category } {
  const exe = (inp.exe || "unknown.exe").trim();
  const lower = exe.toLowerCase();
  const hint = NAME_HINTS[lower];
  const desc = (inp.description || inp.product || "").trim();
  const stripped = exe.replace(/\.exe$/i, "");
  const name = hint ?? (desc && desc.length <= 60 ? desc : stripped);
  const haystack = `${lower} ${desc.toLowerCase()}`;
  let category: Category = "Other";
  for (const [re, cat] of RULES) {
    if (re.test(haystack)) {
      category = cat;
      break;
    }
  }
  return { name, category };
}

/** Identity: full lowercase path when known (so unrelated programs sharing an exe name stay separate). */
export function identityKey(exe: string, path?: string | null): string {
  if (path && path.trim()) return `path:${path.trim().toLowerCase()}`;
  return `exe:${exe.trim().toLowerCase()}`;
}
