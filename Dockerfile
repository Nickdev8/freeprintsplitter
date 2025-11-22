FROM node:20-alpine AS build
WORKDIR /app/app

COPY app/package*.json ./
RUN npm install

COPY app ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
