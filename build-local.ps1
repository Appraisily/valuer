# Script para construir y ejecutar localmente el scraper de Invaluable en Windows
Write-Host "🔨 Construyendo imagen Docker local..." -ForegroundColor Cyan

docker build -t valuer-dev:local .

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Construcción completada exitosamente" -ForegroundColor Green
    
    # Preguntar al usuario si quiere ejecutar en modo debug
    $debug = Read-Host "¿Ejecutar en modo depuración? (s/n, default: n)"
    
    # Configurar los argumentos de Docker según la respuesta
    $envArgs = "-e NODE_ENV=production"
    
    if ($debug -eq "s" -or $debug -eq "S") {
        Write-Host "🐛 Ejecutando en modo depuración con logs detallados..." -ForegroundColor Yellow
        $envArgs = "-e NODE_ENV=development -e DEBUG=puppeteer:*,playwright:*"
    } else {
        Write-Host "🚀 Ejecutando en modo producción..." -ForegroundColor Cyan
    }
    
    # Ejecutar el contenedor con los argumentos configurados
    Invoke-Expression "docker run -p 8080:8080 $envArgs valuer-dev:local"
} else {
    Write-Host "❌ Error durante la construcción" -ForegroundColor Red
    exit 1
} 