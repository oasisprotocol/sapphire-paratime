FROM node:16.15

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY . .

CMD ["node", "index.js"]