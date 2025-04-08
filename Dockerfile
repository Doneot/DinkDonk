# Base image
FROM node:23

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy app source
COPY . .

# Expose the port your server runs on (e.g. 443 if you use https)
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
