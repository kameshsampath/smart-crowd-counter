#Requires -Version 5.1
# windows-wsl2.ps1 - Windows host side of the governed-environment provisioner.
#
# Platform model (docs/openshell.md section 1): NATIVE WINDOWS + WSL2 COMBO.
#   - Windows host runs Ollama (CUDA), MinIO AIStor, Next.js (untouched).
#   - A WSL2 distro imported from the golden tar runs ONLY the OpenShell
#     gateway + rootless Podman + the sandboxed agent.
#
# Usage (from the repo root, PowerShell):
#   scripts/provision/provision.sh windows+wsl2                 # provision project distro
#   scripts/provision/provision.sh windows+wsl2 -BuildGolden     # build dist/openshell-golden.tar from a base distro
#   scripts/provision/provision.sh windows+wsl2 -ResetFromGoldenTar  # unregister + re-import project distro from the golden tar
#   scripts/provision/provision.sh windows+wsl2 -BaseDistro Ubuntu    # base distro used by -BuildGolden
param(
    [switch]$BuildGolden,
    [switch]$ResetFromGoldenTar,
    [string]$BaseDistro = "Ubuntu",
    [string]$ProjectName = "",
    [string]$GoldenTar = ""
)
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $ProjectName) { $ProjectName = Split-Path -Leaf $RepoRoot }   # project distro uses the project name
if (-not $GoldenTar)  { $GoldenTar = Join-Path $RepoRoot "dist/openshell-golden.tar" }
$GoldenDistro = "openshell-golden"
$BuildDistro  = "openshell-golden-build"
$DistDir = Join-Path $RepoRoot "dist"

function Write-Log([string]$msg) { Write-Host "[provision] $msg" }

# --- resource rules (docs/openshell.md section 5) - never hardcode -------------------
# WSL2 memory cap = clamp(hostRAM_GB * 0.375, 4, 16); 16 GB -> 6 GB, 32 GB -> 12 GB
$cs = Get-CimInstance Win32_ComputerSystem
$hostRamGb = $cs.TotalPhysicalMemory / 1e9
$hostCores = $cs.NumberOfLogicalProcessors
$capGb = [math]::Floor($hostRamGb * 0.375); if ($capGb -lt 4) { $capGb = 4 }; if ($capGb -gt 16) { $capGb = 16 }
$procs = [math]::Floor($hostCores / 2); if ($procs -gt 4) { $procs = 4 }; if ($procs -lt 1) { $procs = 1 }
Write-Log "host: $([math]::Round($hostRamGb,2)) GB RAM, $hostCores cores -> .wslconfig memory=${capGb}GB processors=$procs swap=8GB autoMemoryReclaim=gradual"

# --- write scaled .wslconfig (upsert managed keys, preserve the rest) --------
# Installed WSL 2.6.3 accepts memory/processors/swap under [wsl2] and
# autoMemoryReclaim under [experimental] ("Unknown key 'wsl2.autoMemoryReclaim'"
# otherwise) - the installed WSL wins over doc examples.
$wslconfigPath = Join-Path $env:USERPROFILE ".wslconfig"
$raw = @()
if (Test-Path $wslconfigPath) { $raw = Get-Content $wslconfigPath }
$managedKeys = '^\s*(memory|processors|swap|autoMemoryReclaim)\s*='
$out = [System.Collections.Generic.List[string]]::new()
foreach ($l in $raw) {
    if ($l -match $managedKeys) { continue }   # re-emitted below in the right sections
    $out.Add($l)
}
function Upsert-SectionKeys {
    param([System.Collections.Generic.List[string]]$Lines, [string]$Section, [string[]]$Keys)
    $idx = -1
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match "^\s*\[$([regex]::Escape($Section))\]\s*$") { $idx = $i; break }
    }
    if ($idx -lt 0) { $Lines.Add("[$Section]"); foreach ($k in $Keys) { $Lines.Add($k) }; return }
    $Lines.InsertRange($idx + 1, $Keys)
}
Upsert-SectionKeys $out "wsl2" @("memory=${capGb}GB", "processors=$procs", "swap=8GB", "localhostForwarding=true")
Upsert-SectionKeys $out "experimental" @("autoMemoryReclaim=gradual")
Set-Content -Path $wslconfigPath -Value $out -Encoding ASCII
Write-Log "wrote $wslconfigPath ([wsl2] memory=${capGb}GB processors=$procs swap=8GB; [experimental] autoMemoryReclaim=gradual)"

# --- host services reachable from WSL (Ollama on 0.0.0.0 + firewall) -------
# The sandboxed agent reaches host-local services via host.openshell.internal,
# which the podman driver maps to host_gateway_ip (the vEthernet (WSL) adapter
# IP). Ollama must listen on all interfaces and the Windows firewall must
# allow the WSL subnet on 11434 (Ollama) and 9000 (MinIO AIStor).
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0", "User")
$wslSubnet = "172.23.208.0/20"   # vEthernet (WSL) /20; recompute if the host IP changes
try {
    $wslIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'vEthernet (WSL*' -ErrorAction Stop | Select-Object -First 1)
    if ($wslIp) { $wslSubnet = "$($wslIp.IPAddress)/$($wslIp.PrefixLength)" }
} catch { }
foreach ($port in 11434, 9000) {
    New-NetFirewallRule -DisplayName "OpenShell demo: port $port from WSL" -Direction Inbound `
        -Protocol TCP -LocalPort $port -RemoteAddress $wslSubnet -Action Allow -ErrorAction SilentlyContinue | Out-Null
}
# If Ollama is running but not bound to all interfaces, restart it so it picks up OLLAMA_HOST.
$listening = Get-NetTCPConnection -LocalPort 11434 -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -in @('::', '0.0.0.0') -and $_.State -eq 'Listen' }
if (-not $listening) {
    Write-Log "restarting Ollama with OLLAMA_HOST=0.0.0.0 so the sandbox can reach host.openshell.internal:11434"
    Get-Process | Where-Object { $_.ProcessName -like '*ollama*' } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
    if (Test-Path $ollama) {
        $env:OLLAMA_HOST = "0.0.0.0"
        Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 6
    }
}

# --- VRAM check (warn < 6 GB free; qwen2.5vl:7b Q4 needs ~5.5 GB) ------------
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $free = (nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | Select-Object -First 1)
    if ([int]$free -lt 6144) {
        Write-Warning "free VRAM ${free} MiB < 6144 MiB - consider AGENT_MODEL=qwen2.5vl:3b fallback"
    } else { Write-Log "free VRAM ${free} MiB OK" }
}

function Get-Distros { (wsl.exe -l -q | ForEach-Object { $_.Trim() }) -ne "" }

# --- golden tar build: import base -> run inner provisioner -> export --------
if ($BuildGolden) {
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
    $baseTar = Join-Path $DistDir "base-$BaseDistro.tar"
    if (-not (Test-Path $baseTar)) {
        Write-Log "exporting base distro '$BaseDistro' to $baseTar (distro must be stopped)"
        wsl.exe --terminate $BaseDistro | Out-Null
        wsl.exe --export $BaseDistro $baseTar
    }
    if ((wsl.exe -l -q) -contains $BuildDistro) { wsl.exe --unregister $BuildDistro | Out-Null }
    $buildDir = Join-Path $DistDir "vhdx-$BuildDistro"
    New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
    Write-Log "importing $BuildDistro from base tar"
    wsl.exe --import $BuildDistro $buildDir $baseTar --version 2
    & wsl.exe -d $BuildDistro -u root -- bash /mnt/$(($RepoRoot[0]).ToString().ToLower())/$($RepoRoot.Substring(2) -replace '\\','/')/scripts/provision/inner-linux.sh
    if ($LASTEXITCODE -eq 42) {
        Write-Log "systemd was enabled; restarting $BuildDistro and re-running"
        wsl.exe --terminate $BuildDistro | Out-Null
        & wsl.exe -d $BuildDistro -u root -- bash /mnt/$(($RepoRoot[0]).ToString().ToLower())/$($RepoRoot.Substring(2) -replace '\\','/')/scripts/provision/inner-linux.sh
    }
    if ($LASTEXITCODE -ne 0) { throw "inner provisioning of $BuildDistro failed ($LASTEXITCODE)" }
    Write-Log "exporting golden tar to $GoldenTar"
    wsl.exe --terminate $BuildDistro | Out-Null
    wsl.exe --export $BuildDistro $GoldenTar
    Write-Log "golden tar written: $GoldenTar"
    exit 0
}

# --- project distro: import from golden tar (or reset from it) ---------------
if (-not (Test-Path $GoldenTar)) { throw "golden tar not found at $GoldenTar - run with -BuildGolden first" }
if ($ResetFromGoldenTar -or -not ((wsl.exe -l -q) -contains $ProjectName)) {
    if ((wsl.exe -l -q) -contains $ProjectName) {
        Write-Log "resetting $ProjectName from golden tar"
        wsl.exe --terminate $ProjectName | Out-Null
        wsl.exe --unregister $ProjectName | Out-Null
    }
    $projDir = Join-Path $DistDir "vhdx-$ProjectName"
    if (Test-Path $projDir) { Remove-Item -Recurse -Force $projDir }
    New-Item -ItemType Directory -Force -Path $projDir | Out-Null
    Write-Log "importing project distro '$ProjectName' from golden tar"
    wsl.exe --import $ProjectName $projDir $GoldenTar --version 2
}

# --- run inner provisioner inside the project distro (idempotent) -------------
$repoWslPath = "/mnt/$(($RepoRoot[0]).ToString().ToLower())$($RepoRoot.Substring(2) -replace '\\','/')"
& wsl.exe -d $ProjectName -u root -- bash "$repoWslPath/scripts/provision/inner-linux.sh"
if ($LASTEXITCODE -eq 42) {
    Write-Log "systemd was enabled; restarting $ProjectName and re-running"
    wsl.exe --terminate $ProjectName | Out-Null
    & wsl.exe -d $ProjectName -u root -- bash "$repoWslPath/scripts/provision/inner-linux.sh"
}
if ($LASTEXITCODE -ne 0) { throw "inner provisioning of $ProjectName failed ($LASTEXITCODE)" }

# --- post-provision footprint on Windows --------------------------------------
Write-Log "footprint: vmmem working set (guidance: < ~3 GB after 10 min idle on the 16 GB spec):"
Get-Process vmmem -ErrorAction SilentlyContinue | Select-Object @{n='vmmem_MB'; e={[math]::Round($_.WorkingSet64/1MB,0)}} | Format-Table | Out-String | Write-Host
Write-Log "done - project distro '$ProjectName' is provisioned and the gateway is ready"
