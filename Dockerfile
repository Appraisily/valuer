FROM node:20-slim

# Install Chrome dependencies - optimized layer with apt cache cleanup
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies - split for better caching
COPY package.json package-lock.json ./

# Use ci instead of install for faster and more reliable builds
RUN npm ci

# Bundle app source
COPY . .

# Expose port
EXPOSE 3000

# Use a non-root user for better security
RUN groupadd -r appuser && useradd -r -g appuser -G audio,video appuser \
    && mkdir -p /home/appuser/Downloads \
    && chown -R appuser:appuser /home/appuser \
    && chown -R appuser:appuser /usr/src/app

USER appuser

# Start the application
CMD [ "npm", "start" ]