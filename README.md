# cqrs-es-example-js

[![CI](https://github.com/j5ik2o/cqrs-es-example-js/actions/workflows/ci.yml/badge.svg)](https://github.com/j5ik2o/cqrs-es-example-js/actions/workflows/ci.yml)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![](https://tokei.rs/b1/github/j5ik2o/cqrs-es-example-js)](https://github.com/XAMPPRocky/tokei)

## Overview

This is an example of CQRS/Event Sourcing and GraphQL implemented in TypeScript.

This project uses [j5ik2o/event-store-adapter-js](https://github.com/j5ik2o/event-store-adapter-js) for Event Sourcing.

[日本語](./README.ja.md)

## Feature

- [x] Write API Server(GraphQL)
- [x] Read API Server(GraphQL)
- [x] Read Model Updater on Local
- [x] Docker Compose Support
- [ ] Read Model Updater on AWS Lambda
- [ ] Deployment to AWS

## Overview

### Component Composition

- Write API Server
  - API is implemented by GraphQL (Mutation)
  - Event Sourced Aggregate is implemented by [j5ik2o/event-store-adapter-js](https://github.com/j5ik2o/event-store-adapter-js)
- Read Model Updater
  - Lambda to build read models based on journals
- Read API Server
  - API is implemented by GraphQL (Query)

### System Architecture Diagram

![](docs/images/system-layout.png)


## Links

- [Rust Version](https://github.com/j5ik2o/cqrs-es-example-rs)
- [Go Version](https://github.com/j5ik2o/cqrs-es-example-go)
- [Common Documents](https://github.com/j5ik2o/cqrs-es-example-docs)
