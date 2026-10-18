# Builds the site and serves it with nginx.
#
# Stage 1 (build) runs on whatever machine is doing the build ($BUILDPLATFORM),
# because the output is plain HTML/JS/CSS that works on any CPU. Only stage 2,
# the small nginx server, is built separately for each CPU type (amd64 for the
# NUC, arm64 for the Pi).

FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# nginx-unprivileged runs as a normal user and listens on 8080 instead of 80.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/www /usr/share/nginx/html
EXPOSE 8080
