# Step 1: Build the app
FROM node:23 AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN rm -rf dist && npm run build

# Step 2: Serve the built app with a minimal server
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
