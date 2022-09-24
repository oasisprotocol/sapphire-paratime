FROM node:16.15

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn

COPY . .

CMD ["node", "index.js"]