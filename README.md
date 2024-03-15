# cqrs-es-example-js

[![CI](https://github.com/j5ik2o/cqrs-es-example-js/actions/workflows/ci.yml/badge.svg)](https://github.com/j5ik2o/cqrs-es-example-js/actions/workflows/ci.yml)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![License](https://img.shields.io/badge/License-APACHE2.0-blue.svg)](https://opensource.org/licenses/apache-2-0)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![](https://tokei.rs/b1/github/j5ik2o/cqrs-es-example-js)](https://github.com/XAMPPRocky/tokei)

## Overview

This is an example of CQRS/Event Sourcing and GraphQL implemented in TypeScript.

This project uses [j5ik2o/event-store-adapter-js](https://github.com/j5ik2o/event-store-adapter-js) for Event Sourcing.

Please refer to [here](https://github.com/j5ik2o/cqrs-es-example) for implementation examples in other languages.

[日本語](./README.ja.md)

## Feature

- [x] Write API Server(GraphQL)
- [x] Read API Server(GraphQL)
- [x] Read Model Updater on Local
- [x] Docker Compose Support
- [ ] Read Model Updater on AWS Lambda
- [ ] Deployment to AWS

## Component Composition

- Write API Server
  - API is implemented by GraphQL (Mutation)
  - Event Sourced Aggregate is implemented by [j5ik2o/event-store-adapter-js](https://github.com/j5ik2o/event-store-adapter-js)
- Read Model Updater
  - Lambda to build read models based on journals
  - Locally, run code that emulates Lambda behavior (local-rmu)
- Read API Server
  - API is implemented by GraphQL (Query)

## Stack

This OSS repository mainly utilizes the following technology stack.

- [apollographql/apollo-server](https://github.com/apollographql/apollo-server)
- [MichalLytek/type-graphql](https://github.com/MichalLytek/type-graphql)
- [prisma](https://github.com/prisma/prisma)
- [j5ik2o/cqrs-es-example-js](https://github.com/j5ik2o/cqrs-es-example-js)

## System Architecture Diagram

![](docs/images/system-layout.png)


## Development Environment

- [Tools Setup](./docs/TOOLS_INSTALLATION.md)
- [Build and Test](./docs/BUILD_AND_TEST.md)

### Local Environment

- [Debugging on Local Machine](docs/DEBUG_ON_LOCAL_MACHINE.md)
- [Debugging on Docker Compose](docs/DEBUG_ON_DOCKER_COMPOSE.md)

## Links

- [Common Documents](https://github.com/j5ik2o/cqrs-es-example)
