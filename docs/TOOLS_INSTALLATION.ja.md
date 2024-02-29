# ツールのインストール

## asdf

```shell
$ brew install asdf
$ echo -e "\n. $(brew --prefix asdf)/libexec/asdf.sh" >> ${ZDOTDIR:-~}/.zshrc
```

https://asdf-vm.com/

Ubuntuの場合は以下に従ってインストールしてください。

https://asdf-vm.com/guide/getting-started.html

## Node.js

```shell
$ asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
$ asdf install nodejs 20.5.0
$ asdf global nodejs 20.5.0
$ asdf reshim
$ node -v
```

## pnpm

```shell
$ corepack enable
$ asdf reshim
$ pnpm -v
```

## Docker

### Mac

以下に従ってインストールしてください。

Docker Desktop for Mac

https://docs.docker.com/desktop/install/mac-install/

### Ubuntu

以下に従ってインストールしてください。

- Docker Desktop for Ubuntu
    - https://docs.docker.com/desktop/install/debian/
- Docker Engine for Ubuntu
    - https://docs.docker.com/engine/install/ubuntu/

さらにsudoなしで使えるようにするために以下の手順を実行してください

https://qiita.com/katoyu_try1/items/1bdaaad9f64af86bbfb7
