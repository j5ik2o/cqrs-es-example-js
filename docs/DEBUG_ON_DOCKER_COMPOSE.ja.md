# Docker Compose上でデバッグする

## ビルドイメージ

```shell
$ pnpm docker-build
```

## docker-composeの起動

```shell
$ pnpm docker-compose-up
```

必要なデータベースとテーブルが作成され、アプリケーションも起動します。
開発目的でデータベースだけを起動したい場合は、`docker-compose-up`ではなく`docker-compose-up-db`を実行してください。

### docker-composeの停止

```shell
$ pnpm docker-compose-down
```

## 動作確認

```shell
$ pnpm verify-group-chat
```



