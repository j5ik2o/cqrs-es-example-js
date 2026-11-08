FROM bash:devel-alpine3.19

RUN apk add --no-cache curl jq

COPY lib.sh verify-group-chat.sh verify-resilience.sh ./

ENTRYPOINT ["bash", "/verify-group-chat.sh"]
