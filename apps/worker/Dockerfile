FROM golang:1.23-alpine AS build
WORKDIR /src
RUN apk add --no-cache ca-certificates git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /worker ./cmd/worker

FROM alpine:3.20
RUN apk add --no-cache ca-certificates \
  && addgroup -S -g 10001 worker && adduser -S -G worker -u 10001 -H worker
WORKDIR /app
COPY --from=build /worker /usr/local/bin/worker
USER worker
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/health >/dev/null || exit 1
CMD ["worker"]
