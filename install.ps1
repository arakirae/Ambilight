# Ambilight installer for Windows
#
# What it does:
#   1. Checks for Git, Node.js 22+ and pnpm, and installs what is missing
#      (Git and Node.js with winget, pnpm with npm)
#   2. Finds your Vencord folder (Vencord in your user folder or in Documents) and updates it,
#      or downloads Vencord into %USERPROFILE%\Vencord if you don't have it yet
#   3. Copies Ambilight into Vencord\src\userplugins\ambilight and builds Vencord
#      (from the files next to this installer, or downloaded from GitHub if they aren't there)
#   4. Asks whether to install (inject) Vencord into Discord
#
# Start it with Install.bat, or paste this in PowerShell:
#   irm https://raw.githubusercontent.com/arakirae/Ambilight/main/install.ps1 | iex

# Everything runs inside this block, so pasting the command above leaves nothing behind in your PowerShell window
$AmbilightResult = & {
param([string]$Root)

$ErrorActionPreference = 'Stop'

$VencordRepo = 'https://github.com/Vendicated/Vencord.git'
$RawBase = 'https://raw.githubusercontent.com/arakirae/Ambilight/main/'
$PluginFiles = @('index.ts', 'ambilight.ts', 'native.ts')
$ObsoleteFiles = @('strip.ts') # left over by early test versions
$MinNodeMajor = 18          # Vencord's build refuses older versions
$RecommendedNodeMajor = 22  # what Vencord asks for in its package.json
$MinPnpmMajor = 9

$DefaultVencordDir = Join-Path $env:USERPROFILE 'Vencord'
$State = @{ VencordDir = $DefaultVencordDir; PluginSource = $null; TempDir = $null }

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Magenta
}

function Write-Ok([string]$Text) {
    Write-Host "    $Text" -ForegroundColor Green
}

function Write-Info([string]$Text) {
    Write-Host "    $Text"
}

# Full path of a program on PATH (.exe or .cmd), or $null
function Get-ToolPath([string]$Name) {
    $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cmd) { return $cmd.Source }
    return $null
}

function Get-MajorVersion([string]$Text) {
    if ($Text -match '(\d+)\.\d+') { return [int]$Matches[1] }
    return 0
}

# Lets this window see programs that were installed while it was open
function Update-SessionPath {
    $parts = @($env:Path -split ';')
    foreach ($scope in @('Machine', 'User')) {
        $value = [Environment]::GetEnvironmentVariable('Path', $scope)
        if ($value) { $parts += @($value -split ';') }
    }
    $env:Path = (@($parts | Where-Object { $_ }) | Select-Object -Unique) -join ';'
}

# Runs a program in this window (so its messages and prompts work) and stops if it fails
function Invoke-Tool([string]$What, [string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    $proc = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru
    $null = $proc.Handle # keeps the exit code readable after the program ends
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) {
        throw "$What failed (exit code $($proc.ExitCode)). Read the messages above for details."
    }
}

function Install-WithWinget([string]$Id, [string]$Name, [string]$Url) {
    $winget = Get-ToolPath 'winget'
    if (-not $winget) {
        throw "$Name is missing and winget is not available to install it. Install $Name from $Url, then run the installer again."
    }
    Write-Info "Installing $Name with winget. If Windows asks for permission, click Yes."
    Invoke-Tool "Installing $Name" $winget @('install', '--id', $Id, '--exact', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements') $env:USERPROFILE
    Update-SessionPath
}

# The plugin files: next to this installer (ZIP download), or fresh from GitHub (one-command install)
function Get-PluginSource {
    Write-Step 'Getting Ambilight'
    if ($Root -and (Test-Path -LiteralPath (Join-Path $Root 'index.ts'))) {
        $State.PluginSource = $Root
        Write-Ok "Using the files in $Root"
        return
    }
    # GitHub only accepts TLS 1.2 or newer, which older Windows PowerShell doesn't always turn on by itself
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('Ambilight-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $State.TempDir = $tmp
    foreach ($file in $PluginFiles) {
        Write-Info "Downloading $file from GitHub"
        Invoke-WebRequest -Uri ($RawBase + $file) -OutFile (Join-Path $tmp $file) -UseBasicParsing
    }
    $index = [IO.File]::ReadAllText((Join-Path $tmp 'index.ts'))
    if ($index -notmatch 'name: "Ambilight"') {
        throw 'The file downloaded from GitHub does not look like Ambilight. Check your connection and run the installer again.'
    }
    $State.PluginSource = $tmp
    Write-Ok 'Downloaded the latest version'
}

function Assert-Git {
    Write-Step 'Checking Git'
    if (-not (Get-ToolPath 'git')) {
        Install-WithWinget 'Git.Git' 'Git' 'https://git-scm.com/download/win'
        if (-not (Get-ToolPath 'git')) {
            throw 'Git was installed, but this window cannot see it yet. Close this window and run the installer again.'
        }
    }
    $version = (& (Get-ToolPath 'git') --version | Out-String).Trim()
    Write-Ok $version
}

function Assert-Node {
    Write-Step 'Checking Node.js'
    if (-not (Get-ToolPath 'node')) {
        Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js' 'https://nodejs.org'
        if (-not (Get-ToolPath 'node')) {
            throw 'Node.js was installed, but this window cannot see it yet. Close this window and run the installer again.'
        }
    }
    $version = (& (Get-ToolPath 'node') --version | Out-String).Trim()
    $major = Get-MajorVersion $version
    if ($major -lt $MinNodeMajor) {
        throw "Vencord needs Node.js $RecommendedNodeMajor or newer, but you have $version. Install the LTS version from https://nodejs.org, then run the installer again."
    }
    Write-Ok "Node.js $version"
    if ($major -lt $RecommendedNodeMajor) {
        Write-Info "Vencord recommends Node.js $RecommendedNodeMajor or newer. If something fails below, install the LTS version from https://nodejs.org and run the installer again."
    }
}

function Get-PnpmVersion {
    $pnpm = Get-ToolPath 'pnpm'
    if (-not $pnpm) { return '' }
    return (& $pnpm --version | Out-String).Trim()
}

function Assert-Pnpm {
    Write-Step 'Checking pnpm'
    $version = Get-PnpmVersion
    if ((Get-MajorVersion $version) -lt $MinPnpmMajor) {
        if ($version) { Write-Info "pnpm $version is too old, updating it..." }
        else { Write-Info 'Installing pnpm...' }
        $npm = Get-ToolPath 'npm'
        if (-not $npm) { throw 'npm was not found. Reinstall Node.js from https://nodejs.org, then run the installer again.' }
        Invoke-Tool 'Installing pnpm' $npm @('install', '--global', 'pnpm@latest') $env:USERPROFILE
        Update-SessionPath
        $version = Get-PnpmVersion
        if (-not $version) {
            throw 'pnpm was installed, but this window cannot see it yet. Close this window and run the installer again.'
        }
        if ((Get-MajorVersion $version) -lt $MinPnpmMajor) {
            throw "pnpm $version is too old. Update it with: npm install --global pnpm@latest"
        }
    }
    Write-Ok "pnpm $version"
}

# An existing Vencord download: in the user folder, or in Documents (where Vencord's own guide puts it)
function Find-Vencord {
    $candidates = @(
        $DefaultVencordDir,
        (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Vencord'),
        (Join-Path $env:USERPROFILE 'Documents\Vencord')
    )
    foreach ($dir in $candidates) {
        if ($dir -and (Test-Path -LiteralPath (Join-Path $dir '.git'))) { return $dir }
    }
    return $null
}

function Sync-Vencord {
    Write-Step 'Getting Vencord'
    $git = Get-ToolPath 'git'
    $existing = Find-Vencord
    if ($existing) {
        $State.VencordDir = $existing
        Write-Info "Updating your Vencord in $existing"
        Invoke-Tool 'Updating Vencord' $git @('pull', '--ff-only') $existing
    }
    elseif (Test-Path -LiteralPath $DefaultVencordDir) {
        throw "The folder $DefaultVencordDir already exists but is not a Vencord download. Rename or move it, then run the installer again."
    }
    else {
        Write-Info "Downloading Vencord into $DefaultVencordDir"
        Invoke-Tool 'Downloading Vencord' $git @('clone', $VencordRepo, 'Vencord') $env:USERPROFILE
        $State.VencordDir = $DefaultVencordDir
    }
    Write-Ok "Vencord is ready in $($State.VencordDir)"
}

function Copy-Plugin {
    Write-Step 'Adding Ambilight'
    $pluginDir = [IO.Path]::Combine($State.VencordDir, 'src', 'userplugins', 'ambilight')
    New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null
    foreach ($file in $PluginFiles) {
        $source = Join-Path $State.PluginSource $file
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $pluginDir $file) -Force
        }
    }
    foreach ($file in $ObsoleteFiles) {
        $old = Join-Path $pluginDir $file
        if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Force }
    }
    Write-Ok "Copied to $pluginDir"
}

function Build-Vencord {
    $pnpm = Get-ToolPath 'pnpm'
    Write-Step 'Installing what Vencord needs (this can take a few minutes)'
    Invoke-Tool 'Installing Vencord dependencies' $pnpm @('install', '--frozen-lockfile') $State.VencordDir
    Write-Step 'Building Vencord'
    Invoke-Tool 'Building Vencord' $pnpm @('build') $State.VencordDir
    Write-Ok 'Build finished'
}

function Install-IntoDiscord {
    Write-Step 'Installing Vencord into Discord'
    Write-Info 'This is needed the first time, or if you used the normal Vencord installer before.'
    Write-Info 'If you are not sure, answer Y: doing it again is harmless.'
    $answer = Read-Host '    Install Vencord into Discord now? (Y/N)'
    if ($answer -notmatch '^\s*[YySs]') {
        Write-Info 'Skipped.'
        return
    }
    Write-Info 'Pick your Discord with the arrow keys and press Enter.'
    Invoke-Tool 'Installing Vencord into Discord' (Get-ToolPath 'pnpm') @('inject') $State.VencordDir
}

$exitCode = 0
try {
    Write-Host ''
    Write-Host 'Ambilight installer' -ForegroundColor Magenta
    Write-Host 'Installs Vencord from source together with the Ambilight plugin.'

    Get-PluginSource
    Assert-Git
    Assert-Node
    Assert-Pnpm
    Sync-Vencord
    Copy-Plugin
    Build-Vencord
    Install-IntoDiscord

    Write-Host ''
    Write-Host 'Done!' -ForegroundColor Green
    Write-Host 'Last steps:'
    Write-Host '  1. Fully close Discord: right click its icon next to the clock > Quit Discord.'
    Write-Host '  2. Open Discord again.'
    Write-Host '  3. User Settings > Vencord > Plugins: search for Ambilight and turn it on.'
    Write-Host '  4. The first time, fully close and reopen Discord once more: this turns on the fix that keeps streams playing behind the Start menu.'
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host "Something went wrong: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Fix the problem above, then run the installer again.'
}
finally {
    if ($State.TempDir) { Remove-Item -LiteralPath $State.TempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
$exitCode
} $PSScriptRoot

# Install.bat runs this file directly and reads the exit code. A pasted command must not close the window.
$AmbilightExitCode = @($AmbilightResult)[-1]
Remove-Variable AmbilightResult -ErrorAction SilentlyContinue
if ($PSCommandPath) { exit $AmbilightExitCode }
Remove-Variable AmbilightExitCode -ErrorAction SilentlyContinue
