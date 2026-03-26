# ===========================================
# Xine - Deploy Script Template
# ===========================================
# Copy this file to deploy.ps1 and update with your server details:
#   cp deploy.example.ps1 deploy.ps1
#
# Usage:
#   .\deploy.ps1          # Full build + deploy
#   .\deploy.ps1 -NoBuild # Deploy without rebuilding

param (
    [switch]$NoBuild = $false
)

$ErrorActionPreference = "Stop"

# ==============================
# CONFIGURATION - Update these!
# ==============================
$ServerIp = "YOUR_SERVER_IP"
$Username = "YOUR_SSH_USER"
$RemoteDir = "/var/www/web-analytics"
$SshKey = "$env:USERPROFILE\.ssh\id_rsa"
$StagingDir = "$env:TEMP\analytics_deploy_staging"
$TarFile = "$env:TEMP\analytics_deploy.tar.gz"

# Cloudflare Configuration (loaded from .env.local)
$EnvFile = Join-Path $PSScriptRoot ".env.local"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}
$CfApiToken = $env:CF_API_TOKEN
$CfZoneId = $env:CF_ZONE_ID
$TrackingScriptUrl = "https://YOUR_DOMAIN/t.js"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Xine Deploy Script                  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$TotalTime = [System.Diagnostics.Stopwatch]::StartNew()

# 1. Build Layer
if (-not $NoBuild) {
    Write-Host "`n[1/6] Building Next.js Application..." -ForegroundColor Yellow
    $BuildTime = [System.Diagnostics.Stopwatch]::StartNew()
    
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed. Aborting deployment." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    
    $BuildTime.Stop()
    Write-Host "Build completed in $([math]::Round($BuildTime.Elapsed.TotalSeconds, 2)) seconds." -ForegroundColor Green
} else {
    Write-Host "`n[1/6] Skipping Build..." -ForegroundColor DarkGray
    $BuildTime = [System.TimeSpan]::Zero
}

# 2. Stage Layer
Write-Host "`n[2/6] Staging files for deployment..." -ForegroundColor Yellow
$StageTime = [System.Diagnostics.Stopwatch]::StartNew()

if (Test-Path $StagingDir) {
    Remove-Item -Recurse -Force $StagingDir
}
New-Item -ItemType Directory -Path $StagingDir | Out-Null

robocopy .next/standalone "$StagingDir" /E /NFL /NDL /NJH /NJS /nc /ns /XD .env | Out-Null
robocopy .next/static "$StagingDir/.next/static" /E /NFL /NDL /NJH /NJS /nc /ns | Out-Null
robocopy public "$StagingDir/public" /E /NFL /NDL /NJH /NJS /nc /ns | Out-Null

$StageTime.Stop()
Write-Host "Staging completed in $([math]::Round($StageTime.Elapsed.TotalSeconds, 2)) seconds." -ForegroundColor Green

# 3. Compress Layer
Write-Host "`n[3/6] Compressing files..." -ForegroundColor Yellow
$CompressTime = [System.Diagnostics.Stopwatch]::StartNew()

if (Test-Path $TarFile) {
    Remove-Item -Force $TarFile
}

$TotalFiles = (Get-ChildItem -Path $StagingDir -Recurse -File).Count
$CurrentFile = 0

Write-Host "Archiving $TotalFiles files -> $TarFile" -ForegroundColor Cyan

Push-Location $StagingDir
try {
    tar.exe -czf $TarFile . 2>&1 | ForEach-Object {
        $CurrentFile++
        $Percent = 0
        if ($TotalFiles -gt 0) {
            $Percent = [math]::Min([math]::Round(($CurrentFile / $TotalFiles) * 100), 100)
        }
        Write-Progress -Activity "Compressing Files" -Status "$CurrentFile / $TotalFiles ($Percent%)" -PercentComplete $Percent
    }
} finally {
    Pop-Location
    Write-Progress -Activity "Compressing Files" -Completed
}

$CompressTime.Stop()
$FileSizeMB = [math]::Round(((Get-Item $TarFile).Length / 1MB), 2)
Write-Host "Compression completed in $([math]::Round($CompressTime.Elapsed.TotalSeconds, 2)) seconds. Size: ${FileSizeMB}MB" -ForegroundColor Green

# 4. Transfer Layer
Write-Host "`n[4/6] Transferring archive to server..." -ForegroundColor Yellow
$TransferTime = [System.Diagnostics.Stopwatch]::StartNew()

scp $TarFile "${Username}@${ServerIp}:/tmp/analytics_deploy.tar.gz"

$TransferTime.Stop()
Write-Host "Transfer completed in $([math]::Round($TransferTime.Elapsed.TotalSeconds, 2)) seconds." -ForegroundColor Green

# 5. Extract & Restart Layer
Write-Host "`n[5/6] Extracting on server & restarting PM2..." -ForegroundColor Yellow
$ExtractTime = [System.Diagnostics.Stopwatch]::StartNew()

$RemoteCommands = @"
    mkdir -p $RemoteDir
    cd $RemoteDir
    echo "Extracting archive..."
    tar -xzf /tmp/analytics_deploy.tar.gz -C .
    echo "Cleaning up archive..."
    rm /tmp/analytics_deploy.tar.gz
    echo "Restarting application via PM2..."
    pm2 restart analytics --update-env 2>/dev/null || pm2 start server.js --name analytics --update-env
"@

ssh "${Username}@${ServerIp}" $RemoteCommands

$ExtractTime.Stop()
Write-Host "Extraction & restart completed in $([math]::Round($ExtractTime.Elapsed.TotalSeconds, 2)) seconds." -ForegroundColor Green

# 6. Cloudflare Cache Purge (t.js only)
$PurgeTime = [System.Diagnostics.Stopwatch]::new()
if ($CfApiToken -and $CfZoneId) {
    Write-Host "`n[6/6] Purging Cloudflare cache for t.js..." -ForegroundColor Yellow
    $PurgeTime.Start()

    $headers = @{
        "Authorization" = "Bearer $CfApiToken"
        "Content-Type"  = "application/json"
    }
    $body = @{ files = @($TrackingScriptUrl) } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod `
            -Uri "https://api.cloudflare.com/client/v4/zones/$CfZoneId/purge_cache" `
            -Method POST -Headers $headers -Body $body

        if ($response.success) {
            Write-Host "Cloudflare cache purged for t.js" -ForegroundColor Green
        } else {
            Write-Host "Cloudflare purge returned errors: $($response.errors | ConvertTo-Json)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Cloudflare purge failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   Deploy succeeded, but t.js may serve from cache until it expires." -ForegroundColor DarkGray
    }

    $PurgeTime.Stop()
} else {
    Write-Host "`n[6/6] Skipping Cloudflare purge (CF_API_TOKEN or CF_ZONE_ID not set)" -ForegroundColor DarkGray
}

$TotalTime.Stop()

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "           Deployment Summary           " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Build Time:       $([math]::Round($BuildTime.Elapsed.TotalSeconds, 2))s"
Write-Host " Stage Time:       $([math]::Round($StageTime.Elapsed.TotalSeconds, 2))s"
Write-Host " Compress Time:    $([math]::Round($CompressTime.Elapsed.TotalSeconds, 2))s"
Write-Host " Transfer Time:    $([math]::Round($TransferTime.Elapsed.TotalSeconds, 2))s"
Write-Host " Extraction Time:  $([math]::Round($ExtractTime.Elapsed.TotalSeconds, 2))s"
Write-Host " Cache Purge:      $([math]::Round($PurgeTime.Elapsed.TotalSeconds, 2))s"
Write-Host "----------------------------------------"
Write-Host " Total Elapsed:    $([math]::Round($TotalTime.Elapsed.TotalSeconds, 2))s" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Xine Deployment Successful!" -ForegroundColor Green
