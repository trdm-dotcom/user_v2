FROM node:16.13.1
RUN mkdir -p /app
COPY / /app
WORKDIR /app
RUN npm install && npm run build
WORKDIR /app/build/src
ENTRYPOINT [ "node", "index.js" ]