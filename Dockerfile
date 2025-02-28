FROM node:18-slim

# Install Chrome dependencies - enhanced for Cloud Run
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    fonts-freefont-ttf \
    libxss1 \
    libxtst6 \
    libglib2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libasound2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libxkbcommon0 \
    libxrandr2 \
    libgbm1 \
    libnss3 \
    libxcursor1 \
    libxinerama1 \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Verify Chrome installation and version
RUN google-chrome-stable --version

# Create app directory
WORKDIR /usr/src/app

# Skip Puppeteer download since we're using the installed Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Additional environment variables for Chrome in containerized environments
ENV NODE_OPTIONS=--max_old_space_size=4096
ENV CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox

# Install app dependencies with npm cache clean
COPY package*.json ./
RUN npm cache clean --force && \
    npm install --no-optional --verbose

# Bundle app source
COPY . .

# Create a special user for running Chrome
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /usr/src/app

# Switch to non-root user for better security and compatibility with Chrome
USER pptruser

# Expose port
EXPOSE 8080

# Start the application
CMD [ "npm", "start" ]