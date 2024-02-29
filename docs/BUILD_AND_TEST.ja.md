## ビルド方法

ビルドを行う前に、Dockerを必ず起動してください。

```shell
$ pnpm install # 初回だけ
$ pnpm prisma:generate # 初回だけ
$ pnpm build
```

## テスト方法

## 単体テスト

事前にDockerを必ず起動してください。

```shell
$ pnpm test
```

## E2Eテスト

docker composeで起動したアプリケーションに対してE2Eテストを実行します。

```shell
$ pnpm docker-build
$ pnpm docker-compose-up
$ pnpm verify-group-chat # E2E
```