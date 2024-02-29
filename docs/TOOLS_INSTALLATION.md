# Tools Installation

## asdf

```shell
$ brew install asdf
$ echo -e "\n. $(brew --prefix asdf)/libexec/asdf.sh" >> ${ZDOTDIR:-~}/.zshrc
```

https://asdf-vm.com/

For Ubuntu, please follow the instructions below to install.

https://asdf-vm.com/guide/getting-started.html

## Node.js

```shell
$ asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
$ asdf install nodejs 20.5.0
$ asdf global nodejs 20.5.0
$ asdf reshim
```

## pnpm

```shell
$ corepack enable
$ asdf reshim
```

## Docker

### Mac

Please follow the instructions below for installation.

Docker Desktop for Mac

https://docs.docker.com/desktop/install/mac-install/

### Ubuntu

Please follow the instructions below for installation.

- Docker Desktop for Ubuntu
    - https://docs.docker.com/desktop/install/debian/
- Docker Engine for Ubuntu
    - https://docs.docker.com/engine/install/ubuntu/

Additionally, execute the following steps to use it without sudo:

https://qiita.com/katoyu_try1/items/1bdaaad9f64af86bbfb7