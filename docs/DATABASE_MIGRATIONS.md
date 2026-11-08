# Database migrations

The MySQL schema lives in `tools/migrate/migrations/` and is applied with
[golang-migrate](https://github.com/golang-migrate/migrate). docker compose runs
it through the `migration` service, and the test suites apply the same
`*.up.sql` files to a MySQL testcontainer.

## Sequence number columns (migration 5)

Migration `5_expand_sequence_number_to_bigint` widens
`last_processed_sequence_number` to `BIGINT NOT NULL` in
`read_model_positions`, `group_chats`, `members` and `messages`, matching ESA
core-contract T-9. Prisma returns these columns as JavaScript `bigint`; the RMU
converts them to `number` only within the T-9 limit of 2^53 - 1
(`9007199254740991`) and rejects anything larger.

## Rolling back migration 5

`5_expand_sequence_number_to_bigint.down.sql` narrows the four columns back to
`INT`, which is only safe while every value still fits in `2147483647`:

- With strict mode (the MySQL default), the rollback fails with
  `ERROR 1264 (22003): Out of range value for column ...`.
- Without strict mode, MySQL clamps the value to `2147483647`, silently losing
  the true processing position.

Before rolling back, check every table for values above `2147483647` (the
queries are listed in the down migration). If any row matches, do not roll
back; fix forward instead.
