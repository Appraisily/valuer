# Script para construir y ejecutar localmente el scraper de Invaluable en Windows
Write-Host "🔨 Construyendo imagen Docker local..." -ForegroundColor Cyan

docker build -t valuer-dev:local .

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Construcción completada exitosamente" -ForegroundColor Green
    
    Write-Host "🚀 Ejecutando el contenedor..." -ForegroundColor Cyan
    docker run -p 8080:8080 `
        -e NODE_ENV=production `
        valuer-dev:local
} else {
    Write-Host "❌ Error durante la construcción" -ForegroundColor Red
    exit 1
} 