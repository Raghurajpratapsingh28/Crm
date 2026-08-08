FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /worker ./cmd/worker

FROM alpine:3.20
RUN adduser -D -H -u 10001 worker
WORKDIR /app
COPY --from=build /worker /usr/local/bin/worker
USER worker
EXPOSE 8081
CMD ["worker"]
