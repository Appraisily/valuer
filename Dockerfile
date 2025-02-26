FROM node:18-slim

# Configurar variables de entorno para reducir el tamaño de la instalación de Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome \
    CHROME_PATH=/usr/bin/google-chrome \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096"

# Instalar Chrome y otras dependencias necesarias
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    fonts-liberation \
    dbus \
    xdg-utils \
    libxss1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/chrome-user-data

# Crear directorio de la aplicación
WORKDIR /usr/src/app

# Copiar solo los archivos de definición de dependencias primero
COPY package*.json ./

# Instalar dependencias de producción solamente con un timeout extendido
RUN npm config set fetch-timeout 300000 \
    && npm config set network-timeout 300000 \
    && npm install --no-optional --only=production --loglevel verbose

# Copiar el resto del código fuente
COPY . .

# Crear directorios necesarios
RUN mkdir -p temp/chrome-data temp/checkpoints \
    && chmod -R 777 temp

# Exponer el puerto que usa el servidor HTTP
EXPOSE 8080

# Configuración para entorno de contenedor
ENV PORT=8080 \
    NODE_ENV=production

# Comando para iniciar la aplicación
CMD [ "node", "src/examples/invaluable-category-scraper.js" ]