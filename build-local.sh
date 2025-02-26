#!/bin/bash
# Script para construir y ejecutar localmente el scraper de Invaluable

echo "🔨 Construyendo imagen Docker local..."
docker build -t valuer-dev:local .

if [ $? -eq 0 ]; then
  echo "✅ Construcción completada exitosamente"
  
  echo "🚀 Ejecutando el contenedor..."
  docker run -p 8080:8080 \
    -e NODE_ENV=production \
    valuer-dev:local
else
  echo "❌ Error durante la construcción"
  exit 1
fi 