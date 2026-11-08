-- Rollback of migration 5. This narrows the four watermark columns back to INT
-- and is only safe while every value still fits in a signed 32-bit integer.
--
-- WARNING: if any row holds a value above 2147483647, this migration fails or
-- loses data, depending on the server's sql_mode:
--   * strict mode (the MySQL default) aborts with
--     "ERROR 1264 (22003): Out of range value for column ...";
--   * non-strict mode clamps the value to 2147483647, silently dropping the
--     real processing position.
-- Run the following check on every table before rolling back and treat a
-- non-empty result as a blocker:
--   SELECT COUNT(*) FROM `read_model_positions` WHERE `last_processed_sequence_number` > 2147483647;
--   SELECT COUNT(*) FROM `group_chats`           WHERE `last_processed_sequence_number` > 2147483647;
--   SELECT COUNT(*) FROM `members`               WHERE `last_processed_sequence_number` > 2147483647;
--   SELECT COUNT(*) FROM `messages`              WHERE `last_processed_sequence_number` > 2147483647;
ALTER TABLE `read_model_positions`
    MODIFY COLUMN `last_processed_sequence_number` INT NOT NULL;

ALTER TABLE `group_chats`
    MODIFY COLUMN `last_processed_sequence_number` INT NOT NULL;

ALTER TABLE `members`
    MODIFY COLUMN `last_processed_sequence_number` INT NOT NULL;

ALTER TABLE `messages`
    MODIFY COLUMN `last_processed_sequence_number` INT NOT NULL;
