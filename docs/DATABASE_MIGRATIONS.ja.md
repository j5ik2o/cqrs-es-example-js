# データベースマイグレーション

MySQL のスキーマは `tools/migrate/migrations/` にあり、
[golang-migrate](https://github.com/golang-migrate/migrate) で適用します。
docker compose では `migration` サービスが実行し、テストも同じ `*.up.sql` を
MySQL のテストコンテナへ適用します。

## シーケンス番号カラム（マイグレーション 5）

`5_expand_sequence_number_to_bigint` は、ESA core-contract T-9 に合わせて
`read_model_positions`、`group_chats`、`members`、`messages` の
`last_processed_sequence_number` を `BIGINT NOT NULL` に広げます。Prisma は
これらのカラムを JavaScript の `bigint` で返すため、RMU は T-9 の上限である
2^53 - 1（`9007199254740991`）以下の値だけを `number` に変換し、それを超える
値は拒否します。

## マイグレーション 5 のロールバック

`5_expand_sequence_number_to_bigint.down.sql` は 4 つのカラムを `INT` に戻します。
すべての値が `2147483647` に収まっている場合にだけ安全です。

- strict モード（MySQL の既定）では、ロールバックは
  `ERROR 1264 (22003): Out of range value for column ...` で失敗します。
- strict モードでない場合、MySQL は値を `2147483647` に丸めてしまい、実際の
  処理位置が失われます。

ロールバックの前に、全テーブルで `2147483647` を超える値がないか確認して
ください（確認用のクエリは down マイグレーションに記載しています）。該当する
行がある場合はロールバックせず、前に進む修正を行ってください。
