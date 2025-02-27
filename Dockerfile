FROM node:18-slim

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Create temp directory for Chrome user data
RUN mkdir -p temp/chrome-data && chmod -R 777 temp

# Install app dependencies using npm ci for exact versions
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]