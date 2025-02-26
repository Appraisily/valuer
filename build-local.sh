#!/bin/bash
# Script para construir y ejecutar localmente el scraper de Invaluable

echo "🔨 Construyendo imagen Docker local..."
docker build -t valuer-dev:local .

if [ $? -eq 0 ]; then
  echo "✅ Construcción completada exitosamente"
  
  # Preguntar si quiere ejecutar en modo debug
  read -p "¿Ejecutar en modo depuración? (s/n, default: n): " debug
  
  # Configurar variables de entorno según respuesta
  env_args="-e NODE_ENV=production"
  
  if [[ "$debug" == "s" || "$debug" == "S" ]]; then
    echo "🐛 Ejecutando en modo depuración con logs detallados..."
    env_args="-e NODE_ENV=development -e DEBUG=puppeteer:*,playwright:*"
  else
    echo "🚀 Ejecutando en modo producción..."
  fi
  
  # Ejecutar el contenedor
  docker run -p 8080:8080 $env_args valuer-dev:local
else
  echo "❌ Error durante la construcción"
  exit 1
fi 