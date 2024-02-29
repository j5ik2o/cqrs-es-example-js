# cqrs-es-example-js

[![CI](https://github.com/j5ik2o/cqrs-es-example-js/actions/workflows/ci.yml/badge.svg)](https://github.com/j5ik2o/cqrs-es-example-js/actions/workflows/ci.yml)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![](https://tokei.rs/b1/github/j5ik2o/cqrs-es-example-js)](https://github.com/XAMPPRocky/tokei)

## Overview

これは、TypeScriptで実装されたCQRS/イベントソーシングおよびGraphQLの例です。

このプロジェクトはイベントソーシングのために[j5ik2o/event-store-adapter-js](https://github.com/j5ik2o/event-store-adapter-js)を使用しています。

[English](./README.md)

## 特徴

- [x] Write API Server(GraphQL)
- [x] Read API Server(GraphQL)
- [x] Read Model Updater on Local
- [x] Docker Compose Support
- [ ] Read Model Updater on AWS Lambda
- [ ] Deployment to AWS

## 概要

### コンポーネント構成

- 書き込みAPIサーバー
  - APIはGraphQL（Mutation）によって実装されています
  - イベントソース化されたアグリゲートは[j5ik2o/event-store-adapter-js](https://github.com/j5ik2o/event-store-adapter-js)によって実装されています
  - GraphQLサーバーは[apollographql/apollo-server](https://github.com/apollographql/apollo-server)、GraphQLスキーマツールは[MichalLytek/type-graphql](https://github.com/MichalLytek/type-graphql)
- Read Model Updater
  - ジャーナルに基づいてリードモデルを構築するLambda
  - ローカルでは、Lambdaの動作をエミュレートするコードを実行します（local-rmu）
- 読み取りAPIサーバー
  - APIはGraphQL（Query）によって実装されています
  - GraphQLサーバーは[apollographql/apollo-server](https://github.com/apollographql/apollo-server)、GraphQLスキーマツールは[MichalLytek/type-graphql](https://github.com/MichalLytek/type-graphql)、ORMは[prisma](https://github.com/prisma/prisma)

### System Architecture Diagram

![](docs/images/system-layout.png)


## Development Environment

- [Tools Setup](./docs/TOOLS_INSTALLATION.ja.md)
- [Build and Test](./docs/BUILD_AND_TEST.ja.md)

## Links

- [Common Documents](https://github.com/j5ik2o/cqrs-es-example)
