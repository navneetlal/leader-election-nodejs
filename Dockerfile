FROM node:22.1.0-alpine

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile && mkdir -p /etc/service-A/files

COPY . .

ENTRYPOINT ["yarn", "start"]