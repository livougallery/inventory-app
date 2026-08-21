# PowerShell Script to Stop and Restart Node.js Server
# Cara pakai: .\restart-server.ps1

Write-Host "Stopping existing server..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*inventory-app*" } | Stop-Process -Force

Write-Host "Wait 2 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "Starting new server..." -ForegroundColor Green
cd C:\Users\livou\inventory-app
npm start

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Server running at http://localhost:3000" -ForegroundColor Cyan
Write-Host "Available routes:" -ForegroundColor Cyan
Write-Host "  /           - Dashboard (redirects from root)" -ForegroundColor White
Write-Host "  /login      - Login page" -ForegroundColor White
Write-Host "  /cek-data   - Master Data (ALL items)" -ForegroundColor White
Write-Host "  /bom        - Bill of Materials" -ForegroundColor White
Write-Host "  /vendors    - Vendor Management" -ForegroundColor White
Write-Host "  /products   - Products Catalog" -ForegroundColor White
Write-Host "  /raw-materials - Raw Materials" -ForegroundColor White
Write-Host "  /purchase-orders - Purchase Orders" -ForegroundColor White
Write-Host "  /production-batches - Production Batches" -ForegroundColor White
Write-Host "  /hpp        - HPP & Reports" -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Cyan
