<#
  CHRONOS WINDOWS MONITORING AGENT  (initial development version)

  Native foreground monitor for Chronos. It uses Win32 APIs directly:
    GetForegroundWindow, GetWindowThreadProcessId, GetWindowTextW, GetClassNameW,
    OpenProcess, QueryFullProcessImageNameW, OpenProcessToken/GetTokenInformation,
    GetLastInputInfo, OpenInputDesktop (secure-desktop / lock detection), EnumChildWindows (UWP hosts).

  It reports ONLY: executable name/path, product description, PID, elevation status and
  (optionally, if enabled in Chronos settings) the window title. It never captures keystrokes,
  clipboard, screenshots, audio, video or page contents. Window titles are read locally to
  recognise the Chronos window itself and are discarded unless title tracking is enabled.

  Usage (Windows PowerShell 5.1 or PowerShell 7, no administrator rights needed):
      powershell -ExecutionPolicy Bypass -File .\chronos-agent.ps1 -Server http://localhost:3000

  The agent polls locally every -PollMs (default 500 ms) and talks to Chronos only on activity
  changes plus a heartbeat every 5 s. If the agent stops (crash, sleep, shutdown) Chronos closes the
  open session at the last heartbeat, so no activity is ever invented for unmonitored time.
#>
param(
  [string]$Server = "__CHRONOS_SERVER__",
  [int]$PollMs = 500
)

$ErrorActionPreference = 'Continue'
if ($Server -like '__CHRONOS*') { $Server = 'http://localhost:3000' }
$Server = $Server.TrimEnd('/')

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ChronosNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);

  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
  [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr lParam);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr h, uint flags, StringBuilder sb, ref uint size);
  [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr h, uint access, out IntPtr token);
  [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int cls, out int info, int len, out int ret);

  public static IntPtr Foreground() { return GetForegroundWindow(); }

  public static uint PidOf(IntPtr h) { uint pid; GetWindowThreadProcessId(h, out pid); return pid; }

  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowTextW(h, sb, 512); return sb.ToString(); }

  public static string ClassOf(IntPtr h) { var sb = new StringBuilder(256); GetClassNameW(h, sb, 256); return sb.ToString(); }

  // Milliseconds since the last keyboard/mouse input of the interactive session.
  public static uint IdleMs() {
    LASTINPUTINFO info = new LASTINPUTINFO();
    info.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref info)) return 0;
    return unchecked((uint)Environment.TickCount - info.dwTime);
  }

  // The input desktop cannot be opened while the workstation is locked (secure desktop / UAC prompt).
  public static bool IsSecureDesktop() {
    IntPtr h = OpenInputDesktop(0, false, 0x0100);
    if (h == IntPtr.Zero) return true;
    CloseDesktop(h);
    return false;
  }

  // UWP apps (Settings, Calculator...) are hosted by ApplicationFrameHost; find the real child process.
  public static uint UwpChildPid(IntPtr h, uint hostPid) {
    uint found = 0;
    EnumChildWindows(h, delegate (IntPtr c, IntPtr l) {
      uint p; GetWindowThreadProcessId(c, out p);
      if (p != 0 && p != hostPid) { found = p; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  // PROCESS_QUERY_LIMITED_INFORMATION (0x1000) is enough for the image path of most processes.
  public static string ImagePath(uint pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      var sb = new StringBuilder(1024); uint size = 1024;
      return QueryFullProcessImageNameW(h, 0, sb, ref size) ? sb.ToString() : null;
    } finally { CloseHandle(h); }
  }

  // 1 = elevated, 0 = not elevated, -1 = cannot be inspected (typically elevated/protected process).
  public static int Elevation(uint pid) {
    IntPtr h = OpenProcess(0x1000, false, pid);
    if (h == IntPtr.Zero) return -1;
    try {
      IntPtr tok;
      if (!OpenProcessToken(h, 0x0008, out tok)) return -1;
      try { int info; int ret; return GetTokenInformation(tok, 20, out info, 4, out ret) ? (info != 0 ? 1 : 0) : -1; }
      finally { CloseHandle(tok); }
    } finally { CloseHandle(h); }
  }
}
"@

$script:cfg = @{
  monitoringEnabled = $true; idleEnabled = $true; idleThresholdMs = 300000
  desktopTracking = $true; trackSelf = $true; trackTitles = $false; heartbeatMs = 5000
}
$script:versionCache = @{}
$DesktopClasses = @('Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd')

function Refresh-Config {
  try {
    $c = Invoke-RestMethod -Uri "$Server/api/agent/config" -TimeoutSec 5
    foreach ($k in @($script:cfg.Keys)) { if ($null -ne $c.$k) { $script:cfg[$k] = $c.$k } }
  } catch { Write-Host "[chronos] config unavailable, keeping last policy: $($_.Exception.Message)" }
}

function Send-Observation($payload) {
  try {
    $json = $payload | ConvertTo-Json -Depth 6 -Compress
    Invoke-RestMethod -Uri "$Server/api/ingest" -Method Post -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    Write-Host "[chronos] cannot reach $Server : $($_.Exception.Message)"
    return $false
  }
}

function Get-VersionText($path) {
  if (-not $path) { return @{ desc = $null; product = $null } }
  if ($script:versionCache.ContainsKey($path)) { return $script:versionCache[$path] }
  $r = @{ desc = $null; product = $null }
  try {
    $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($path)
    $r = @{ desc = $vi.FileDescription; product = $vi.ProductName }
  } catch { }
  $script:versionCache[$path] = $r
  return $r
}

function Get-Observation {
  if (-not $script:cfg.monitoringEnabled) { return @{ key = 'none:paused'; payload = @{ kind = 'none'; reason = 'monitoring-paused' } } }

  if ([ChronosNative]::IsSecureDesktop()) { return @{ key = 'locked'; payload = @{ kind = 'locked' } } }

  $idleMs = [ChronosNative]::IdleMs()
  if ($script:cfg.idleEnabled -and $idleMs -ge $script:cfg.idleThresholdMs) {
    # Policy: the first <threshold> of inactivity stays with the foreground app; idle starts at the threshold.
    $since = [DateTime]::UtcNow.AddMilliseconds(-($idleMs - $script:cfg.idleThresholdMs))
    return @{ key = 'idle'; payload = @{ kind = 'idle'; at = $since.ToString('o') } }
  }

  $hwnd = [ChronosNative]::Foreground()
  if ($hwnd -eq [IntPtr]::Zero) { return $null }   # transient state while windows switch

  $class = [ChronosNative]::ClassOf($hwnd)
  if ($DesktopClasses -contains $class) { return @{ key = 'desktop'; payload = @{ kind = 'desktop' } } }

  $title = [ChronosNative]::Title($hwnd)
  # The Chronos UI sets its window/tab title to "Chronos <middle dot> <page>" (U+00B7, built here to stay ASCII-safe).
  if ($title.Contains('Chronos ' + [char]0x00B7)) {
    return @{ key = 'self'; payload = @{ kind = 'app'; self = $true; app = @{ exe = 'chronos' } } }
  }

  $procId = [ChronosNative]::PidOf($hwnd)
  $path = [ChronosNative]::ImagePath($procId)
  $exe = if ($path) { [IO.Path]::GetFileName($path) } else { $null }
  if ($exe -ieq 'ApplicationFrameHost.exe') {
    $child = [ChronosNative]::UwpChildPid($hwnd, $procId)
    if ($child -ne 0) {
      $p2 = [ChronosNative]::ImagePath($child)
      if ($p2) { $procId = $child; $path = $p2; $exe = [IO.Path]::GetFileName($p2) }
    }
  }

  $limited = $false
  if (-not $exe) {
    # Access restricted (e.g. elevated/protected process). Record it with what is allowed; never bypass protections.
    try { $exe = (Get-Process -Id $procId -ErrorAction Stop).ProcessName + '.exe' } catch { $exe = "pid-$procId.exe" }
    $limited = $true
  }
  $elev = [ChronosNative]::Elevation($procId)
  if ($elev -eq -1) { $limited = $true }
  $ver = Get-VersionText $path

  $app = @{
    exe = $exe; path = $path; pid = [int]$procId
    description = $ver.desc; product = $ver.product
    elevated = ($elev -eq 1); limited = $limited
  }
  $payload = @{ kind = 'app'; app = $app }
  if ($script:cfg.trackTitles) { $payload.title = $title }
  return @{ key = "app:$path|$exe"; payload = $payload }
}

Write-Host "Chronos agent started -> $Server (poll ${PollMs}ms). Press Ctrl+C to stop."
Refresh-Config
$lastKey = $null
$lastSent = [DateTime]::MinValue
$lastTick = [DateTime]::UtcNow
$lastCfg = [DateTime]::UtcNow

try {
  while ($true) {
    $now = [DateTime]::UtcNow
    if (($now - $lastTick).TotalSeconds -gt 10) {
      # The loop stalled: the computer was asleep/suspended. Close the session where monitoring stopped.
      [void](Send-Observation @{ kind = 'none'; reason = 'system-suspended'; at = $lastTick.ToString('o') })
      $lastKey = $null
    }
    $lastTick = $now
    if (($now - $lastCfg).TotalSeconds -ge 30) { Refresh-Config; $lastCfg = $now }

    $obs = $null
    try { $obs = Get-Observation } catch { Write-Host "[chronos] detection error: $($_.Exception.Message)" }
    if ($obs) {
      $heartbeatDue = (($now - $lastSent).TotalMilliseconds -ge $script:cfg.heartbeatMs)
      if ($obs.key -ne $lastKey -or $heartbeatDue) {
        if (Send-Observation $obs.payload) { $lastKey = $obs.key; $lastSent = $now }
      }
    }
    Start-Sleep -Milliseconds $PollMs
  }
}
finally {
  [void](Send-Observation @{ kind = 'none'; reason = 'agent-stopped' })
  Write-Host 'Chronos agent stopped.'
}
