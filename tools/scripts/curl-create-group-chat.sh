#!/usr/bin/env bash

WRITE_API_SERVER_BASE_URL="http://localhost:38080/v1"
ADMIN_ID="UserAccount-01H42K4ABWQ5V2XQEP3A48VE0Z"

curl -s -X 'POST' \
    "${WRITE_API_SERVER_BASE_URL}/group-chats/create" \
    -H 'accept: application/json' \
    -H 'Content-Type: application/json' \
    -d "{\"name\": \"group-chat-example\", \"executor_id\": \"${ADMIN_ID}\"}"
