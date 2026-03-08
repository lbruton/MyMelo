FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /app/data/images

RUN apk add --no-cache openssl && \
    mkdir -p /app/certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout /app/certs/key.pem -out /app/certs/cert.pem \
      -subj '/CN=melody.local'

EXPOSE 3000 3443

CMD ["node", "server.js"]
