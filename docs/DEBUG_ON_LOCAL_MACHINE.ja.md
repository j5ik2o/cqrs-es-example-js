# ローカルマシンでデバッグ

## docker-composeにてデータベースだけを実行する。

```shell
$ pnpm docker-compose-up-db
```

## Web Stormなどを使ってデバッグする。

アプリケーションは動作していないので必要に応じて起動してデバッグしてください。

- write-api-server
    - `packages/bootstrap/src/write-api-main.ts`
- dynamodb-read-model-updater `(dynamodb-local-rmu)`
    - `packages/bootstrap/src/dynamodb-local-rmu-main.ts`
- read-api-server
    - `packages/bootstrap/src/read-api-main.ts`

## 動作確認

```shell
$ pnpm verify-group-chat
```
