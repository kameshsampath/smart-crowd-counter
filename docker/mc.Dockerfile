FROM golang:1.25-alpine AS build
LABEL maintainer="MinIO Inc <dev@min.io>"
ENV GOPATH /go
ENV CGO_ENABLED 0
RUN apk add -U --no-cache ca-certificates curl

RUN go install -v -ldflags "-s -w" "github.com/minio/mc@latest"

FROM alpine:3
COPY --from=build /go/bin/mc /usr/bin/mc
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
ENTRYPOINT ["mc"]
