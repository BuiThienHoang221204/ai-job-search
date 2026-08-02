#!/usr/bin/env node
// ai-job-search: environment check & setup (cross-platform, zero dependencies)

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const WHICH = IS_WIN ? "where" : "which";

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function has(tool) {
  return spawnSync(WHICH, [tool], { stdio: "ignore" }).status === 0;
}

function run(cmd, args = [], opts = {}) {
  const shell = IS_WIN && opts.shell !== false;
  const target = shell ? [cmd, ...args].join(" ") : cmd;
  const pass = shell ? [] : args;
  return spawnSync(target, pass, { stdio: "inherit", shell, ...opts }).status;
}

function out(cmd, args = []) {
  const shell = IS_WIN;
  const target = shell ? [cmd, ...args].join(" ") : cmd;
  const pass = shell ? [] : args;
  const r = spawnSync(target, pass, { encoding: "utf8", shell });
  if (r.status !== 0) return null;
  return `${r.stdout}${r.stderr}`.trim();
}

function pythonBin() {
  for (const b of ["python3", "python", "py"]) {
    if (!has(b)) continue;
    const shell = IS_WIN;
    const target = shell ? `${b} -c print(1)` : b;
    const pass = shell ? [] : ["-c", "print(1)"];
    if (spawnSync(target, pass, { stdio: "ignore", shell }).status === 0) return b;
  }
  return null;
}

function pythonOk() {
  const bin = pythonBin();
  if (!bin) return false;
  return spawnSync(bin, ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], {
    stdio: "ignore",
  }).status === 0;
}

function cliDirs() {
  const skills = join(".agents", "skills");
  if (!existsSync(skills)) return [];
  return readdirSync(skills, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(skills, d.name, "cli", "package.json")))
    .map((d) => join(skills, d.name, "cli"));
}

function status(label, ok, detail = "") {
  const tag = ok ? green("OK    ") : red("MISSING");
  console.log(`${tag} ${label}${detail ? ` - ${detail}` : ""}`);
}

function optStatus(label, ok, hint = "") {
  const tag = ok ? green("OK    ") : yellow("optional");
  console.log(`${tag} ${label}${ok ? "" : ` - ${hint}`}`);
}

function check() {
  console.log("== Prerequisites check ==");
  console.log("");

  console.log("--- git ---");
  status("git", has("git"), out("git", ["--version"]) ?? "required");

  console.log("--- python (>= 3.10) ---");
  const pyBin = pythonBin();
  status(
    `python (${pyBin ?? "not found"})`,
    pythonOk(),
    pyBin ? out(pyBin, ["--version"]) ?? "" : "run 'npm run install:python'"
  );

  console.log("--- bun ---");
  status("bun", has("bun"), out("bun", ["--version"]) ?? "run 'npm run install:bun'");

  console.log("--- lualatex (CV) ---");
  status("lualatex", has("lualatex"), has("lualatex") ? "" : "run 'npm run install:latex'");

  console.log("--- xelatex (cover letters) ---");
  status("xelatex", has("xelatex"), has("xelatex") ? "" : "run 'npm run install:latex'");

  console.log("");
  console.log("== Optional components ==");
  console.log("--- claude (Claude Code) ---");
  optStatus("claude", has("claude"), "run 'npm run install:claude'");
  console.log("--- pdftotext (ATS check) ---");
  optStatus("pdftotext", has("pdftotext"), "run 'npm run install:poppler' (/apply falls back without it)");
  console.log("--- npm (for Claude Code) ---");
  optStatus("npm", has("npm"), "needed for 'npm run install:claude'");

  console.log("");
  console.log("== CLI tool dependencies ==");
  const dirs = cliDirs();
  if (dirs.length === 0) {
    console.log(`${yellow("info   ")} no portal CLI skills found (.agents/skills/*/cli)`);
  } else {
    for (const dir of dirs) {
      const ok = existsSync(join(dir, "node_modules"));
      console.log(`${ok ? green("OK    ") : yellow("pending")} ${dir}${ok ? "" : " - run 'npm run install:tools'"}`);
    }
  }
  console.log("");
  console.log("Done. Run 'npm run setup' to install everything missing.");
}

function installPython() {
  if (pythonOk()) {
    console.log(`Python already OK: ${out(pythonBin(), ["--version"])}`);
    return;
  }
  if (IS_WIN) {
    console.log("Installing Python via winget...");
    if (run("winget", ["install", "--id", "Python.Python.3.12", "--silent", "--accept-package-agreements", "--accept-source-agreements"]) !== 0) {
      console.log("winget failed - install Python 3.10+ manually from https://www.python.org/downloads/");
    }
  } else if (IS_MAC) {
    console.log("Install Python 3.10+ manually from https://www.python.org/downloads/ or: brew install python");
  } else {
    console.log("Install Python 3.10+ via your package manager (e.g. sudo apt install python3 python3-pip)");
  }
}

function installBun() {
  if (has("bun")) {
    console.log(`Bun already installed: ${out("bun", ["--version"])}`);
    return;
  }
  if (IS_WIN) {
    console.log("Installing Bun via winget...");
    if (run("winget", ["install", "Oven-sh.Bun", "--silent", "--accept-package-agreements", "--accept-source-agreements"]) !== 0) {
      console.log("winget failed - trying the official installer...");
      run("powershell", ["-ExecutionPolicy", "Bypass", "-c", "irm https://bun.sh/install.ps1 | iex"], { shell: false });
    }
  } else {
    console.log("Installing Bun via the official installer...");
    run("bash", ["-c", "curl -fsSL https://bun.sh/install | bash"]);
  }
}

function installClaude() {
  if (has("claude")) {
    console.log(`Claude Code already installed: ${out("claude", ["--version"]) ?? ""}`);
    return;
  }
  if (has("npm")) {
    console.log("Installing Claude Code via npm...");
    run("npm", ["install", "-g", "@anthropic-ai/claude-code"]);
  } else {
    console.log("npm not found - install Node.js first, then run: npm install -g @anthropic-ai/claude-code");
  }
}

function installLatex() {
  if (has("lualatex") && has("xelatex")) {
    console.log("LaTeX already installed (lualatex + xelatex found).");
    return;
  }
  if (IS_WIN) {
    console.log("Installing MiKTeX via winget...");
    if (run("winget", ["install", "--id", "MiKTeX.MiKTeX", "--silent", "--accept-package-agreements", "--accept-source-agreements"]) !== 0) {
      console.log("winget failed - install MiKTeX from https://miktex.org/download");
    }
    console.log("Tip: Basic MiKTeX needs silent auto-install of packages:");
    console.log("  initexmf --admin --set-config-value=[MPM]AutoInstall=1");
    console.log("  initexmf --set-config-value=[MPM]AutoInstall=1");
  } else if (IS_MAC) {
    console.log("Installing MacTeX via Homebrew...");
    if (run("brew", ["install", "--cask", "mactex"]) !== 0) {
      console.log("brew failed - install MacTeX from https://tug.org/mactex/");
    }
  } else if (has("apt-get")) {
    console.log("Installing texlive-full via apt...");
    run("sudo", ["apt-get", "install", "-y", "texlive-full"]);
  } else if (has("dnf")) {
    console.log("Installing texlive-scheme-full via dnf...");
    run("sudo", ["dnf", "install", "-y", "texlive-scheme-full"]);
  } else {
    console.log("No apt/dnf found - install a LaTeX distribution manually (see SETUP.md)");
  }
}

function installPoppler() {
  if (has("pdftotext")) {
    console.log("pdftotext already installed.");
    return;
  }
  if (IS_WIN) {
    if (has("choco")) {
      console.log("Installing poppler via Chocolatey...");
      run("choco", ["install", "poppler", "-y"]);
    } else {
      console.log("poppler not installed - install Chocolatey then run 'choco install poppler',");
      console.log("or download poppler binaries manually (https://github.com/oschwartz10612/poppler-windows/releases)");
    }
  } else if (IS_MAC) {
    console.log("Installing poppler via Homebrew...");
    run("brew", ["install", "poppler"]);
  } else if (has("apt-get")) {
    run("sudo", ["apt-get", "install", "-y", "poppler-utils"]);
  } else if (has("dnf")) {
    run("sudo", ["dnf", "install", "-y", "poppler-utils"]);
  }
}

function installEnv() {
  installPython();
  installBun();
  installClaude();
  installLatex();
  installPoppler();
  console.log("Install phase finished.");
}

function installTools() {
  if (!has("bun")) {
    console.log("bun not found - run 'npm run install:bun' first.");
    process.exitCode = 1;
    return;
  }
  const dirs = cliDirs();
  if (dirs.length === 0) {
    console.log("No portal CLI skills found (.agents/skills/*/cli) - nothing to install.");
    return;
  }
  for (const dir of dirs) {
    console.log(`--> bun install in ${dir}`);
    run("bun", ["install"], { cwd: dir });
  }
  console.log("All CLI dependencies installed.");
}

function test() {
  if (!has("bun")) {
    console.log("bun not found - run 'npm run install:bun' first.");
    process.exitCode = 1;
    return;
  }
  const dirs = cliDirs();
  if (dirs.length === 0) {
    console.log("No portal CLI skills found - nothing to test.");
    return;
  }
  for (const dir of dirs) {
    console.log(`--> bun test in ${dir}`);
    run("bun", ["test", "--timeout", "30000"], { cwd: dir });
  }
}

function smoke() {
  console.log("== CV smoke test (lualatex) ==");
  if (!has("lualatex")) {
    console.log("lualatex not found - run 'npm run install:latex'.");
    process.exitCode = 1;
    return;
  }
  run("lualatex", ["-interaction=nonstopmode", "-halt-on-error", "main_example.tex"], { cwd: "cv" });

  console.log("== Cover letter smoke test (xelatex) ==");
  if (!has("xelatex")) {
    console.log("xelatex not found - run 'npm run install:latex'.");
    process.exitCode = 1;
    return;
  }
  run("xelatex", ["-interaction=nonstopmode", "-halt-on-error", "cover_example.tex"], { cwd: "cover_letters" });

  console.log("== Smoke tests finished ==");
}

function setup() {
  check();
  console.log("");
  console.log("== Installing missing prerequisites ==");
  installEnv();
  console.log("");
  console.log("== Installing job-search CLI dependencies ==");
  installTools();
  console.log("");
  console.log("== Setup complete ==");
  console.log("Next steps:");
  console.log("  1. npm run smoke                          (verify LaTeX)");
  console.log("  2. Start Claude Code: claude");
  console.log("  3. Run /setup to fill in your candidate profile");
}

function help() {
  console.log("Usage: node scripts/setup.mjs <command>");
  console.log("");
  console.log("  check             Verify installed prerequisites (no changes)");
  console.log("  setup             Full setup: check + install + CLI deps (recommended)");
  console.log("  install           Install missing prerequisites");
  console.log("  install-tools     bun install inside job-search CLI tools");
  console.log("  install-python    Install Python 3.10+");
  console.log("  install-bun       Install Bun");
  console.log("  install-claude    Install Claude Code (requires npm)");
  console.log("  install-latex     Install a LaTeX distribution");
  console.log("  install-poppler   Install pdftotext (poppler) for the ATS check");
  console.log("  test              Run job-search CLI tests");
  console.log("  smoke             Compile CV + cover letter smoke tests");
}

const cmd = process.argv[2];
switch (cmd) {
  case "check":
    check();
    break;
  case "setup":
    setup();
    break;
  case "install":
    installEnv();
    break;
  case "install-tools":
    installTools();
    break;
  case "install-python":
    installPython();
    break;
  case "install-bun":
    installBun();
    break;
  case "install-claude":
    installClaude();
    break;
  case "install-latex":
    installLatex();
    break;
  case "install-poppler":
    installPoppler();
    break;
  case "test":
    test();
    break;
  case "smoke":
    smoke();
    break;
  default:
    help();
    process.exitCode = cmd ? 1 : 0;
}
